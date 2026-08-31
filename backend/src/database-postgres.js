const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { buildSyncHealth } = require('../../lib/sync-health');
const {
  canonicalizeStatsSnapshots,
  isEmptyStatsSnapshot,
  prepareEmptySnapshotWrite,
  romeDateKey,
  shouldReplaceDailySnapshot
} = require('./stats-snapshots');

const SCHEMA_PATH = path.join(__dirname, '../database/schema-postgres.sql');

function stringifyJson(value) {
  return JSON.stringify(value || {});
}

function parseJsonColumn(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function staleBookingCutoffIso() {
  const configured = Number(process.env.BOOKING_STALE_GRACE_HOURS);
  const graceHours = Number.isFinite(configured) && configured >= 0 ? configured : 6;
  return new Date(Date.now() - graceHours * 60 * 60 * 1000).toISOString();
}

class Database {
  constructor() {
    this.pool = null;
  }

  async init() {
    if (this.pool) return;
    // Use Vercel Postgres URL or local
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('POSTGRES_URL or DATABASE_URL environment variable is required');
    }

    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    let client = null;
    try {
      client = await this.pool.connect();
      console.log('✅ Database connected');
      
      if (process.env.POSTGRES_AUTO_MIGRATE === '1' || process.env.POSTGRES_AUTO_MIGRATE === 'true') {
        await this.applySchema(client);
      }
      
    } catch (err) {
      console.error('❌ Database connection failed:', err.message);
      if (client) {
        client.release();
        client = null;
      }
      const pool = this.pool;
      this.pool = null;
      if (pool) await pool.end().catch(() => {});
      throw err;
    } finally {
      if (client) client.release();
    }
  }

  async applySchema(client) {
    if (!fs.existsSync(SCHEMA_PATH)) throw new Error(`Postgres schema not found: ${SCHEMA_PATH}`);
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    await client.query(schema);
    console.log('✅ Schema migrated');
  }

  async migrate() {
    if (!this.pool) await this.init();
    const client = await this.pool.connect();
    try {
      await this.applySchema(client);
    } finally {
      client.release();
    }
  }

  async query(sql, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }

  async execute(sql, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return { rowCount: result.rowCount, rows: result.rows };
    } finally {
      client.release();
    }
  }

  async acquireSyncLock() {
    const client = await this.pool.connect();
    try {
      // Keep the lock inside a transaction so it remains pinned to one
      // PostgreSQL backend even when POSTGRES_URL uses transaction pooling.
      await client.query('BEGIN');
      const result = await client.query('SELECT pg_try_advisory_xact_lock($1) AS acquired', [1729042026]);
      if (!result.rows[0]?.acquired) {
        await client.query('ROLLBACK');
        client.release();
        return null;
      }
      return client;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      throw error;
    }
  }

  async releaseSyncLock(client) {
    if (!client) return;
    try {
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  // Property operations
  async createProperty(id, name) {
    return this.execute(
      'INSERT INTO properties (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [id, name]
    );
  }

  async getProperties() {
    return this.query('SELECT * FROM properties ORDER BY name');
  }

  // Booking operations
  async findOriginalBookingMarkerStart(propertyId, platform, startDate, endDate, bookingType) {
    if (platform !== 'booking' || !['blocked', 'unavailable'].includes(String(bookingType || '').toLowerCase())) {
      return startDate;
    }

    const original = await this.queryOne(
      `SELECT to_char(candidate.start_date, 'YYYY-MM-DD') AS start_date
       FROM bookings candidate
       WHERE candidate.property_id = $1
         AND candidate.platform = 'booking'
         AND candidate.end_date = $2::date
         AND candidate.start_date < $3::date
         AND (
           (
             (
               COALESCE(candidate.booking_type, '') IN ('blocked', 'unavailable') OR
               LOWER(COALESCE(candidate.raw_summary, '')) LIKE '%closed%' OR
               LOWER(COALESCE(candidate.raw_summary, '')) LIKE '%not available%'
             )
             AND COALESCE(NULLIF(TRIM(candidate.guest_name), ''), '') = ''
             AND COALESCE(candidate.guest_count, 0) = 0
           )
           OR (
             candidate.active IS NOT FALSE
             AND (
               COALESCE(NULLIF(TRIM(candidate.guest_name), ''), '') <> '' OR
               COALESCE(candidate.guest_count, 0) > 0
             )
           )
         )
         AND NOT EXISTS (
           SELECT 1
           FROM bookings previous
           WHERE previous.property_id = candidate.property_id
             AND previous.platform = 'booking'
             AND previous.active IS NOT FALSE
             AND previous.end_date > candidate.start_date
             AND previous.end_date <= $3::date
             AND (
               COALESCE(NULLIF(TRIM(previous.guest_name), ''), '') <> '' OR
               COALESCE(previous.guest_count, 0) > 0
             )
         )
       ORDER BY candidate.start_date ASC
       LIMIT 1`,
      [propertyId, endDate, startDate]
    );
    return original?.start_date || startDate;
  }

  async archiveSupersededBookingMarkers(propertyId, canonicalStartDate, endDate) {
    return this.execute(
      `UPDATE bookings
       SET active = FALSE,
           missing_since = COALESCE(missing_since, NOW()),
           synced_at = NOW()
       WHERE property_id = $1
         AND platform = 'booking'
         AND end_date = $2::date
         AND start_date > $3::date
         AND (
           COALESCE(booking_type, '') IN ('blocked', 'unavailable') OR
           LOWER(COALESCE(raw_summary, '')) LIKE '%closed%' OR
           LOWER(COALESCE(raw_summary, '')) LIKE '%not available%'
         )
         AND COALESCE(NULLIF(TRIM(guest_name), ''), '') = ''
         AND COALESCE(guest_count, 0) = 0`,
      [propertyId, endDate, canonicalStartDate]
    );
  }

  async upsertBooking(propertyId, platform, startDate, endDate, rawSummary, extra = {}) {
    const { guestName, guestCountry, reservationUrl, phoneLast4, bookingType } = extra;
    const canonicalStartDate = await this.findOriginalBookingMarkerStart(
      propertyId,
      platform,
      startDate,
      endDate,
      bookingType
    );
    const result = await this.execute(
      `INSERT INTO bookings (property_id, platform, start_date, end_date, raw_summary, guest_name, guest_country, reservation_url, phone_last4, booking_type, active, missing_since, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, NULL, NOW())
       ON CONFLICT (property_id, platform, start_date, end_date)
       DO UPDATE SET
         raw_summary = CASE
           WHEN $2 = 'booking'
             AND $10 IN ('blocked', 'unavailable')
             AND (
               COALESCE(bookings.booking_type, 'reservation') = 'reservation' OR
               COALESCE(NULLIF(TRIM(bookings.guest_name), ''), '') <> '' OR
               COALESCE(bookings.guest_count, 0) > 0
             )
           THEN bookings.raw_summary
           ELSE $5
         END,
         guest_name = COALESCE($6, bookings.guest_name),
         guest_country = COALESCE($7, bookings.guest_country),
         reservation_url = COALESCE($8, bookings.reservation_url),
         phone_last4 = COALESCE($9, bookings.phone_last4),
         booking_type = CASE
           WHEN $2 = 'booking'
             AND $10 IN ('blocked', 'unavailable')
             AND (
               COALESCE(bookings.booking_type, 'reservation') = 'reservation' OR
               COALESCE(NULLIF(TRIM(bookings.guest_name), ''), '') <> '' OR
               COALESCE(bookings.guest_count, 0) > 0
             )
           THEN 'reservation'
           ELSE COALESCE($10, bookings.booking_type)
         END,
         active = TRUE,
         missing_since = NULL,
         synced_at = NOW()`,
      [propertyId, platform, canonicalStartDate, endDate, rawSummary, guestName || null, guestCountry || null, reservationUrl || null, phoneLast4 || null, bookingType || 'reservation']
    );
    if (platform === 'booking' && ['blocked', 'unavailable'].includes(String(bookingType || '').toLowerCase())) {
      await this.archiveSupersededBookingMarkers(propertyId, canonicalStartDate, endDate);
    }
    return { ...result, canonicalStartDate };
  }

  async getBookings(propertyId = null, fromDate = null, options = {}) {
    let sql = `
      SELECT b.*,
             to_char(b.start_date, 'YYYY-MM-DD') AS start_date,
             to_char(b.end_date, 'YYYY-MM-DD') AS end_date
      FROM bookings b
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (propertyId) {
      sql += ` AND b.property_id = $${paramCount++}`;
      params.push(propertyId);
    }

    if (fromDate) {
      sql += ` AND b.end_date >= $${paramCount++}`;
      params.push(fromDate);
    }

    if (!options.includeInactive) {
      sql += ' AND b.active IS NOT FALSE';
    }

    sql += ' ORDER BY b.start_date ASC';
    return this.query(sql, params);
  }

  async archiveStaleBookings(propertyId, platform, feedKeys, today) {
    if (feedKeys.length === 0) return { rowCount: 0 };
    const keyStrings = feedKeys.map(k => k.startDate + '|' + k.endDate);
    const placeholders = keyStrings.map((_, i) => `$${i + 4}`).join(', ');
    const coverageOffset = 4 + keyStrings.length;
    const coverageChecks = feedKeys
      .map((_, i) => `($${coverageOffset + (i * 2)}::date <= GREATEST(start_date, $3::date) AND $${coverageOffset + (i * 2) + 1}::date >= end_date)`)
      .join(' OR ');
    const coverageParams = feedKeys.flatMap(k => [k.startDate, k.endDate]);
    const protectedBooking = `platform = 'booking' AND (
           COALESCE(booking_type, 'reservation') = 'reservation' OR
           COALESCE(NULLIF(TRIM(guest_name), ''), '') <> '' OR
           COALESCE(guest_count, 0) > 0
         )`;
    const staleWhere = `property_id = $1 AND platform = $2 AND end_date >= $3::date
       AND active IS NOT FALSE
       AND (
         (
           NOT (${protectedBooking})
           AND (to_char(start_date, 'YYYY-MM-DD') || '|' || to_char(end_date, 'YYYY-MM-DD')) NOT IN (${placeholders})
         )
         OR (
           ${protectedBooking}
           AND start_date > $3::date
           AND end_date > $3::date
           AND NOT (${coverageChecks})
         )
       )`;
    const staleParams = [propertyId, platform, today, ...keyStrings, ...coverageParams];
    const cutoffPlaceholder = `$${staleParams.length + 1}`;

    const archived = await this.execute(
      `UPDATE bookings
       SET active = FALSE, synced_at = NOW()
       WHERE ${staleWhere}
       AND missing_since IS NOT NULL
       AND missing_since <= ${cutoffPlaceholder}::timestamptz`,
      [...staleParams, staleBookingCutoffIso()]
    );

    const quarantined = await this.execute(
      `UPDATE bookings
       SET missing_since = COALESCE(missing_since, NOW()),
           synced_at = NOW()
       WHERE ${staleWhere}`,
      staleParams
    );

    return { rowCount: archived.rowCount, quarantined: quarantined.rowCount };
  }

  async deleteStaleBookings(propertyId, platform, feedKeys, today) {
    return this.archiveStaleBookings(propertyId, platform, feedKeys, today);
  }

  // Cleaner operations
  async createCleaner(id, name) {
    return this.execute(
      'INSERT INTO cleaners (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [id, name]
    );
  }

  async assignCleanerToProperty(cleanerId, propertyId) {
    return this.execute(
      'INSERT INTO cleaner_properties (cleaner_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [cleanerId, propertyId]
    );
  }

  async getCleaners() {
    return this.query('SELECT * FROM cleaners ORDER BY name');
  }

  async getCleanerBySlug(slug) {
    return this.queryOne('SELECT * FROM cleaners WHERE slug = $1', [slug]);
  }

  async updateCleaner(id, fields) {
    const sets = [];
    const params = [];
    let n = 1;
    if (fields.name !== undefined) { sets.push(`name = $${n++}`); params.push(fields.name); }
    if (fields.slug !== undefined) { sets.push(`slug = $${n++}`); params.push(fields.slug); }
    if (sets.length === 0) return;
    params.push(id);
    return this.execute(`UPDATE cleaners SET ${sets.join(', ')} WHERE id = $${n}`, params);
  }

  async getCleanerProperties(cleanerId) {
    return this.query(
      `SELECT p.* FROM properties p
       JOIN cleaner_properties cp ON p.id = cp.property_id
       WHERE cp.cleaner_id = $1`,
      [cleanerId]
    );
  }

  async replaceCleanerProperties(cleanerId, propertyIds = []) {
    const uniqueIds = [...new Set(propertyIds)];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM cleaner_properties WHERE cleaner_id = $1', [cleanerId]);
      if (uniqueIds.length) {
        await client.query(
          `INSERT INTO cleaner_properties (cleaner_id, property_id)
           SELECT $1, property_id
           FROM unnest($2::varchar[]) AS property_id
           ON CONFLICT DO NOTHING`,
          [cleanerId, uniqueIds]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteCleanerWithRelations(cleanerId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM cleaner_properties WHERE cleaner_id = $1', [cleanerId]);
      await client.query('UPDATE cleaning_tasks SET cleaner_id = NULL WHERE cleaner_id = $1', [cleanerId]);
      await client.query('DELETE FROM cleaners WHERE id = $1', [cleanerId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Cleaning task operations
  async createCleaningTask(propertyId, scheduledDate, taskType = 'checkout_cleaning') {
    // Auto-assign cleaner based on property
    const cleaner = await this.queryOne(
      'SELECT cleaner_id FROM cleaner_properties WHERE property_id = $1 LIMIT 1',
      [propertyId]
    );

    return this.execute(
      `INSERT INTO cleaning_tasks (property_id, cleaner_id, scheduled_date, task_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (property_id, scheduled_date, task_type)
       DO UPDATE SET
         cleaner_id = COALESCE(cleaning_tasks.cleaner_id, EXCLUDED.cleaner_id),
         active = TRUE,
         missing_since = NULL
       WHERE cleaning_tasks.status <> 'completed'
         AND cleaning_tasks.active IS FALSE
       RETURNING id`,
      [propertyId, cleaner?.cleaner_id || null, scheduledDate, taskType]
    );
  }

  async getCleaningTasks(cleanerId = null, fromDate = null, options = {}) {
    let sql = `
      SELECT ct.*,
             to_char(ct.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
             p.name as property_name,
             c.name as cleaner_name
      FROM cleaning_tasks ct
      JOIN properties p ON ct.property_id = p.id
      LEFT JOIN cleaners c ON ct.cleaner_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (cleanerId) {
      sql += ` AND ct.cleaner_id = $${paramCount++}`;
      params.push(cleanerId);
    }

    if (fromDate) {
      sql += ` AND ct.scheduled_date >= $${paramCount++}`;
      params.push(fromDate);
    }

    if (!options.includeInactive) {
      sql += ' AND ct.active IS NOT FALSE';
    }

    sql += ' ORDER BY ct.scheduled_date ASC';
    return this.query(sql, params);
  }

  async archiveStaleCleaningTasks(today, expectedCheckoutKeys = null) {
    if (Array.isArray(expectedCheckoutKeys)) {
      return this.execute(
        `UPDATE cleaning_tasks ct
         SET active = FALSE,
             missing_since = COALESCE(ct.missing_since, NOW())
         WHERE ct.scheduled_date >= $1::date
           AND ct.task_type = 'checkout_cleaning'
           AND ct.status NOT IN ('completed', 'cancelled')
           AND ct.active IS NOT FALSE
           AND NOT ((ct.property_id || '|' || to_char(ct.scheduled_date, 'YYYY-MM-DD')) = ANY($2::text[]))`,
        [today, [...new Set(expectedCheckoutKeys)]]
      );
    }
    return this.execute(
      `UPDATE cleaning_tasks ct
       SET active = FALSE,
           missing_since = COALESCE(ct.missing_since, NOW())
       WHERE ct.scheduled_date >= $1::date
         AND ct.task_type = 'checkout_cleaning'
         AND ct.status NOT IN ('completed', 'cancelled')
         AND ct.active IS NOT FALSE
         AND NOT EXISTS (
           SELECT 1
           FROM bookings b
           WHERE b.property_id = ct.property_id
             AND b.end_date = ct.scheduled_date
             AND b.active IS NOT FALSE
             AND NOT (
               (
                 lower(coalesce(b.raw_summary, '')) LIKE '%not available%' OR
                 lower(coalesce(b.raw_summary, '')) LIKE '%closed%' OR
                 b.booking_type IN ('blocked', 'unavailable')
               )
               AND coalesce(nullif(trim(b.guest_name), ''), '') = ''
               AND coalesce(b.guest_count, 0) <= 0
             )
         )`,
      [today]
    );
  }

  async updateTaskStatus(taskId, status, completedAt = null) {
    return this.execute(
      'UPDATE cleaning_tasks SET status = $1, completed_at = $2 WHERE id = $3',
      [status, completedAt, taskId]
    );
  }

  // City tax (tassa di soggiorno) operations
  async getTaxPending(date) {
    return this.query(
      `SELECT b.*,
              to_char(b.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(b.end_date, 'YYYY-MM-DD') AS end_date,
              p.name as property_name,
              (b.end_date - b.start_date) as nights
       FROM bookings b
       JOIN properties p ON b.property_id = p.id
       WHERE b.end_date = $1::date
         AND b.active IS NOT FALSE
         AND b.tax_paid = false
         AND NOT (
           (b.raw_summary LIKE '%Not available%' OR b.raw_summary LIKE '%CLOSED%' OR b.booking_type IN ('blocked', 'unavailable'))
           AND b.guest_name IS NULL
         )
       ORDER BY p.name ASC`,
      [date]
    );
  }

  async getTaxByDate(date) {
    return this.query(
      `SELECT b.*,
              to_char(b.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(b.end_date, 'YYYY-MM-DD') AS end_date,
              p.name as property_name,
              (b.end_date - b.start_date) as nights
       FROM bookings b
       JOIN properties p ON b.property_id = p.id
       WHERE b.end_date = $1::date
         AND b.active IS NOT FALSE
         AND NOT (
           (b.raw_summary LIKE '%Not available%' OR b.raw_summary LIKE '%CLOSED%' OR b.booking_type IN ('blocked', 'unavailable'))
           AND b.guest_name IS NULL
         )
       ORDER BY p.name ASC`,
      [date]
    );
  }

  async updateTaxPaid(bookingId, paid) {
    return this.execute(
      'UPDATE bookings SET tax_paid = $1, tax_paid_at = CASE WHEN $1 THEN NOW() ELSE NULL END WHERE id = $2',
      [paid, bookingId]
    );
  }

  // Statistics snapshot operations
  normalizeStatsSnapshot(row) {
    if (!row) return row;
    const payload = parseJsonColumn(row.payload);
    return {
      ...row,
      snapshot_date: String(row.snapshot_date || payload.snapshot_date || romeDateKey(row.captured_at)).slice(0, 10),
      season_year: Number(row.season_year),
      booking_count: Number(row.booking_count) || 0,
      occupied_nights: Number(row.occupied_nights) || 0,
      guest_count: Number(row.guest_count) || 0,
      occupancy_percent: Number(row.occupancy_percent) || 0,
      avg_stay: Number(row.avg_stay) || 0,
      monthly_nights: parseJsonColumn(row.monthly_nights),
      monthly_bookings: parseJsonColumn(row.monthly_bookings),
      platform_counts: parseJsonColumn(row.platform_counts),
      country_counts: parseJsonColumn(row.country_counts),
      payload
    };
  }

  async createStatsSnapshot(snapshot) {
    const capturedAt = snapshot.captured_at || new Date().toISOString();
    const snapshotDate = String(snapshot.snapshot_date || snapshot.payload?.snapshot_date || romeDateKey(capturedAt)).slice(0, 10);
    const payload = { ...(snapshot.payload || {}), snapshot_date: snapshotDate };
    const baseIncoming = { ...snapshot, captured_at: capturedAt, snapshot_date: snapshotDate, payload };
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`booking-stats:${snapshot.season_year}:${snapshotDate}`]);
      const candidatesResult = await client.query(
        `SELECT id, captured_at AT TIME ZONE 'UTC' AS captured_at, source,
                season_year, booking_count, occupied_nights, guest_count,
                occupancy_percent, avg_stay, monthly_nights, monthly_bookings,
                platform_counts, country_counts, payload
         FROM booking_stats_snapshots
         WHERE season_year = $1
         ORDER BY booking_stats_snapshots.captured_at DESC, id DESC
         LIMIT 2000`,
        [snapshot.season_year]
      );
      const sameDay = candidatesResult.rows
        .map(row => this.normalizeStatsSnapshot(row))
        .filter(row => row.snapshot_date === snapshotDate);
      const existing = sameDay.reduce(
        (best, row) => shouldReplaceDailySnapshot(best, row) ? row : best,
        null
      );
      let incoming = baseIncoming;
      const emptyPlan = prepareEmptySnapshotWrite(existing, incoming);
      incoming = emptyPlan.snapshot;

      if (existing && emptyPlan.quarantined && emptyPlan.existingPayload) {
        await client.query('UPDATE booking_stats_snapshots SET payload = $1::jsonb WHERE id = $2', [
          stringifyJson(emptyPlan.existingPayload),
          existing.id
        ]);
        await client.query('COMMIT');
        return {
          rowCount: 0,
          rows: [],
          skipped: true,
          quarantined: true,
          existingId: existing.id,
          snapshot: { ...existing, payload: emptyPlan.existingPayload }
        };
      }

      if (existing && !emptyPlan.confirmed && !shouldReplaceDailySnapshot(existing, incoming)) {
        let retained = existing;
        const resetsEmptyCandidate = !isEmptyStatsSnapshot(incoming) ||
          String(incoming.payload?.sync_status || '').toLowerCase() !== 'success' ||
          Number(incoming.payload?.feed_error_count || 0) > 0;
        if (existing.payload?.empty_candidate && resetsEmptyCandidate) {
          const cleanPayload = { ...(existing.payload || {}) };
          delete cleanPayload.empty_candidate;
          await client.query('UPDATE booking_stats_snapshots SET payload = $1::jsonb WHERE id = $2', [
            stringifyJson(cleanPayload),
            existing.id
          ]);
          retained = { ...existing, payload: cleanPayload };
        }
        await client.query('COMMIT');
        return { rowCount: 0, rows: [], skipped: true, existingId: existing.id, snapshot: retained };
      }

      const values = [
        incoming.captured_at,
        incoming.source || 'sync',
        incoming.season_year,
        incoming.booking_count || 0,
        incoming.occupied_nights || 0,
        incoming.guest_count || 0,
        incoming.occupancy_percent || 0,
        incoming.avg_stay || 0,
        stringifyJson(incoming.monthly_nights),
        stringifyJson(incoming.monthly_bookings),
        stringifyJson(incoming.platform_counts),
        stringifyJson(incoming.country_counts),
        stringifyJson(incoming.payload)
      ];

      let result;
      if (existing) {
        result = await client.query(
          `UPDATE booking_stats_snapshots
           SET captured_at = ($1::timestamptz AT TIME ZONE 'UTC'), source = $2,
               season_year = $3, booking_count = $4, occupied_nights = $5,
               guest_count = $6, occupancy_percent = $7, avg_stay = $8,
               monthly_nights = $9::jsonb, monthly_bookings = $10::jsonb,
               platform_counts = $11::jsonb, country_counts = $12::jsonb,
               payload = $13::jsonb
           WHERE id = $14
           RETURNING id`,
          [...values, existing.id]
        );
      } else {
        result = await client.query(
          `INSERT INTO booking_stats_snapshots (
            captured_at, source, season_year, booking_count, occupied_nights, guest_count,
            occupancy_percent, avg_stay, monthly_nights, monthly_bookings,
            platform_counts, country_counts, payload
          ) VALUES (
            ($1::timestamptz AT TIME ZONE 'UTC'), $2, $3, $4, $5, $6, $7, $8,
            $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb
          ) RETURNING id`,
          values
        );
      }
      await client.query('COMMIT');
      return {
        rowCount: result.rowCount,
        rows: result.rows,
        quarantined: emptyPlan.quarantined,
        confirmed: emptyPlan.confirmed,
        snapshot: incoming
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getStatsSnapshots(options = {}) {
    const seasonYear = options.seasonYear || options.season_year;
    const limit = Math.max(1, Math.min(Number(options.limit) || 500, 2000));
    const params = [];
    let where = '1=1';
    let n = 1;

    if (seasonYear) {
      where += ` AND season_year = $${n++}`;
      params.push(Number(seasonYear));
    }

    // Apply the API limit after daily canonicalization so duplicate legacy
    // writes cannot displace older days from the history window.
    const rawLimit = Math.min(10000, Math.max(2000, limit * 10));
    params.push(rawLimit);
    const rows = await this.query(
      `SELECT * FROM (
        SELECT id, captured_at AT TIME ZONE 'UTC' AS captured_at, source,
               season_year, booking_count, occupied_nights, guest_count,
               occupancy_percent, avg_stay, monthly_nights, monthly_bookings,
               platform_counts, country_counts, payload
        FROM booking_stats_snapshots
        WHERE ${where}
        ORDER BY booking_stats_snapshots.captured_at DESC
        LIMIT $${n}
      ) s ORDER BY captured_at ASC`,
      params
    );

    return canonicalizeStatsSnapshots(
      rows.map(row => this.normalizeStatsSnapshot(row)),
      { limit }
    );
  }

  async ping() {
    const row = await this.queryOne('SELECT 1 AS ok');
    return Number(row?.ok) === 1;
  }

  async startSyncRun(source = 'manual') {
    try {
      const result = await this.execute(
        `INSERT INTO sync_runs (source, status, feed_errors)
         VALUES ($1, 'running', '[]'::jsonb)
         RETURNING id`,
        [source]
      );
      return result.rows[0]?.id || null;
    } catch (error) {
      // Keep sync available during a rolling deploy; health falls back to legacy snapshots.
      if (error.code === '42P01') return null;
      throw error;
    }
  }

  async finishSyncRun(id, { status, eventsSynced = 0, feedErrors = [], errorMessage = null }) {
    if (!id) return;
    await this.execute(
      `UPDATE sync_runs
       SET completed_at = NOW(),
           status = $2,
           events_synced = $3,
           feed_errors = $4::jsonb,
           error_message = $5
       WHERE id = $1`,
      [id, status, eventsSynced, JSON.stringify(feedErrors || []), errorMessage]
    );
  }

  async getSyncHealth(options = {}) {
    let lastRun = null;
    let lastDataRun = null;
    try {
      [lastRun, lastDataRun] = await Promise.all([
        this.queryOne(
          `SELECT id, started_at, completed_at, source, status, events_synced, feed_errors
           FROM sync_runs
           ORDER BY started_at DESC, id DESC
           LIMIT 1`
        ),
        this.queryOne(
          `SELECT completed_at
           FROM sync_runs
           WHERE status IN ('success', 'partial') AND completed_at IS NOT NULL
           ORDER BY completed_at DESC, id DESC
           LIMIT 1`
        )
      ]);
    } catch (error) {
      if (error.code !== '42P01') throw error;
    }
    const legacySnapshot = await this.queryOne(
      `SELECT captured_at
       FROM booking_stats_snapshots
       WHERE source = 'sync'
       ORDER BY captured_at DESC
       LIMIT 1`
    );

    return buildSyncHealth({
      lastRun,
      lastDataAt: lastDataRun?.completed_at || legacySnapshot?.captured_at || null,
      staleMinutes: options.staleMinutes
    });
  }

  async close() {
    if (this.pool) {
      const pool = this.pool;
      this.pool = null;
      await pool.end();
    }
  }
}

module.exports = new Database();
