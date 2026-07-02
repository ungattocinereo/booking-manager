const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

const strict = process.argv.includes('--strict');

if (!connectionString) {
  console.error('POSTGRES_URL or DATABASE_URL is required for production data audit');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const normalizedBookingsCte = `
  WITH normalized_bookings AS (
    SELECT
      id,
      property_id,
      platform,
      start_date,
      end_date,
      booking_type,
      (
        lower(coalesce(raw_summary, '')) LIKE '%not available%' OR
        lower(coalesce(raw_summary, '')) LIKE '%closed%' OR
        booking_type IN ('blocked', 'unavailable')
      ) AS is_unavailable,
      (
        coalesce(nullif(trim(guest_name), ''), '') <> '' OR
        coalesce(guest_count, 0) > 0
      ) AS has_guest
    FROM bookings
  )
`;

const queries = {
  totals: `
    SELECT
      COUNT(*)::int AS bookings,
      COUNT(*) FILTER (WHERE end_date >= CURRENT_DATE)::int AS upcoming,
      COUNT(DISTINCT property_id)::int AS properties
    FROM bookings
  `,
  by_platform_type: `
    SELECT platform, booking_type, COUNT(*)::int AS count
    FROM bookings
    GROUP BY platform, booking_type
    ORDER BY platform, booking_type
  `,
  exact_duplicates: `
    SELECT
      property_id,
      platform,
      start_date::text AS start_date,
      end_date::text AS end_date,
      COUNT(*)::int AS count
    FROM bookings
    GROUP BY property_id, platform, start_date, end_date
    HAVING COUNT(*) > 1
    ORDER BY count DESC, property_id, start_date
  `,
  blocked_over_real_summary: `
    ${normalizedBookingsCte}
    SELECT
      marker.property_id,
      marker.platform AS marker_platform,
      real.platform AS real_platform,
      COUNT(*)::int AS overlap_count
    FROM normalized_bookings marker
    JOIN normalized_bookings real
      ON marker.property_id = real.property_id
      AND marker.id <> real.id
      AND marker.start_date < real.end_date
      AND real.start_date < marker.end_date
    WHERE marker.end_date >= CURRENT_DATE
      AND marker.is_unavailable = true
      AND marker.has_guest = false
      AND NOT (real.is_unavailable = true AND real.has_guest = false)
    GROUP BY marker.property_id, marker.platform, real.platform
    ORDER BY overlap_count DESC, marker.property_id
  `,
  blocked_over_real_samples: `
    ${normalizedBookingsCte}
    SELECT
      marker.property_id,
      marker.platform AS marker_platform,
      marker.start_date::text AS marker_start,
      marker.end_date::text AS marker_end,
      real.platform AS real_platform,
      real.start_date::text AS real_start,
      real.end_date::text AS real_end
    FROM normalized_bookings marker
    JOIN normalized_bookings real
      ON marker.property_id = real.property_id
      AND marker.id <> real.id
      AND marker.start_date < real.end_date
      AND real.start_date < marker.end_date
    WHERE marker.end_date >= CURRENT_DATE
      AND marker.is_unavailable = true
      AND marker.has_guest = false
      AND NOT (real.is_unavailable = true AND real.has_guest = false)
    ORDER BY marker.start_date, marker.property_id
    LIMIT 40
  `,
  unavailable_markers: `
    ${normalizedBookingsCte}
    SELECT property_id, platform, booking_type, COUNT(*)::int AS count
    FROM normalized_bookings
    WHERE end_date >= CURRENT_DATE
      AND is_unavailable = true
      AND has_guest = false
    GROUP BY property_id, platform, booking_type
    ORDER BY count DESC, property_id
  `,
  cleaning_tasks_without_real_checkout: `
    ${normalizedBookingsCte}
    SELECT
      ct.property_id,
      COUNT(*)::int AS task_count
    FROM cleaning_tasks ct
    LEFT JOIN normalized_bookings b
      ON b.property_id = ct.property_id
      AND b.end_date = ct.scheduled_date
      AND NOT (b.is_unavailable = true AND b.has_guest = false)
    WHERE ct.scheduled_date >= CURRENT_DATE
      AND b.id IS NULL
    GROUP BY ct.property_id
    ORDER BY task_count DESC, ct.property_id
  `,
};

async function main() {
  const client = await pool.connect();
  const report = {};

  try {
    await client.query('BEGIN READ ONLY');
    for (const [name, sql] of Object.entries(queries)) {
      const result = await client.query(sql);
      report[name] = result.rows;
    }
    await client.query('ROLLBACK');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));

  if (strict) {
    const hasProblems =
      report.exact_duplicates.length > 0 ||
      report.blocked_over_real_summary.length > 0 ||
      report.cleaning_tasks_without_real_checkout.length > 0;
    if (hasProblems) process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`Audit failed: ${error.message}`);
  process.exit(1);
});
