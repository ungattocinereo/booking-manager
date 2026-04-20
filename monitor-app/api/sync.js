const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { withClient } = require('../lib/db');
const { PROPERTY_IDS } = require('../lib/properties');
const { parseAirbnbCsv } = require('../lib/parse-airbnb-csv');
const { parseBookingXls } = require('../lib/parse-booking-xls');

const EXPORTS_DIR = path.join(__dirname, '..', 'exports');

function bookingKey(propertyId, platform, startDate, endDate) {
  return `${propertyId}|${platform}|${startDate}|${endDate}`;
}

function sameStrings(a, b) {
  return (a || '') === (b || '');
}

async function loadLiveStates(client) {
  const { rows } = await client.query(`
    SELECT DISTINCT ON (booking_key)
      booking_key, event_type, property_id, platform, start_date, end_date,
      guest_name, reservation_url, confirmation_code, booking_created_at
    FROM monitor_booking_events
    ORDER BY booking_key, id DESC
  `);
  const map = new Map();
  for (const r of rows) map.set(r.booking_key, r);
  return map;
}

async function insertEvent(client, e) {
  if (e.detectedAt) {
    await client.query(`
      INSERT INTO monitor_booking_events
        (property_id, platform, event_type, booking_key, start_date, end_date,
         guest_name, reservation_url, confirmation_code, source, source_ref,
         detected_at, booking_created_at, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [
      e.propertyId, e.platform, e.eventType, e.bookingKey,
      e.startDate, e.endDate, e.guestName || null, e.reservationUrl || null,
      e.confirmationCode || null, e.source, e.sourceRef || null,
      e.detectedAt, e.bookingCreatedAt || null,
      e.metadata ? JSON.stringify(e.metadata) : null
    ]);
  } else {
    await client.query(`
      INSERT INTO monitor_booking_events
        (property_id, platform, event_type, booking_key, start_date, end_date,
         guest_name, reservation_url, confirmation_code, source, source_ref,
         booking_created_at, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      e.propertyId, e.platform, e.eventType, e.bookingKey,
      e.startDate, e.endDate, e.guestName || null, e.reservationUrl || null,
      e.confirmationCode || null, e.source, e.sourceRef || null,
      e.bookingCreatedAt || null,
      e.metadata ? JSON.stringify(e.metadata) : null
    ]);
  }
}

async function syncFromBookingsTable(client) {
  const { rows } = await client.query(`
    SELECT property_id, platform, start_date, end_date, guest_name,
           reservation_url, created_at
    FROM bookings
    WHERE property_id = ANY($1::text[])
      AND platform = 'airbnb'
      AND end_date >= CURRENT_DATE
  `, [PROPERTY_IDS]);

  const currentByKey = new Map();
  for (const r of rows) {
    const sd = toIsoDate(r.start_date);
    const ed = toIsoDate(r.end_date);
    const key = bookingKey(r.property_id, r.platform, sd, ed);
    currentByKey.set(key, {
      propertyId: r.property_id,
      platform: r.platform,
      startDate: sd,
      endDate: ed,
      guestName: r.guest_name,
      reservationUrl: r.reservation_url,
      bookingCreatedAt: r.created_at
    });
  }

  const live = await loadLiveStates(client);
  const isBootstrap = live.size === 0;

  let created = 0;
  let cancelled = 0;

  for (const [key, cur] of currentByKey) {
    const last = live.get(key);
    if (!last || last.event_type === 'cancelled') {
      await insertEvent(client, {
        propertyId: cur.propertyId,
        platform: cur.platform,
        eventType: 'created',
        bookingKey: key,
        startDate: cur.startDate,
        endDate: cur.endDate,
        guestName: cur.guestName,
        reservationUrl: cur.reservationUrl,
        confirmationCode: null,
        source: 'bookings_table',
        sourceRef: isBootstrap ? 'bootstrap' : 'hourly_sync',
        bookingCreatedAt: cur.bookingCreatedAt,
        detectedAt: isBootstrap ? cur.bookingCreatedAt : null
      });
      created++;
    }
  }

  for (const [key, last] of live) {
    if (last.event_type === 'cancelled') continue;
    if (last.platform !== 'airbnb') continue;
    if (!PROPERTY_IDS.includes(last.property_id)) continue;
    if (currentByKey.has(key)) continue;
    await insertEvent(client, {
      propertyId: last.property_id,
      platform: last.platform,
      eventType: 'cancelled',
      bookingKey: key,
      startDate: toIsoDate(last.start_date),
      endDate: toIsoDate(last.end_date),
      guestName: last.guest_name,
      reservationUrl: last.reservation_url,
      confirmationCode: last.confirmation_code,
      source: 'bookings_table',
      sourceRef: 'hourly_sync',
      bookingCreatedAt: last.booking_created_at
    });
    cancelled++;
  }

  return { created, cancelled };
}

function toIsoDate(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function ingestExports(client) {
  if (!fs.existsSync(EXPORTS_DIR)) return [];

  const files = fs.readdirSync(EXPORTS_DIR)
    .filter(f => !f.startsWith('.') && f !== 'README.md')
    .sort();

  const imports = [];

  for (const filename of files) {
    const filePath = path.join(EXPORTS_DIR, filename);
    let buf;
    try {
      buf = fs.readFileSync(filePath);
    } catch (err) {
      continue;
    }
    const checksum = sha256(buf);

    const { rows: existing } = await client.query(
      `SELECT id FROM monitor_exports_log WHERE filename = $1 AND checksum = $2`,
      [filename, checksum]
    );
    if (existing.length > 0) {
      imports.push({ filename, status: 'skipped', reason: 'already_imported' });
      continue;
    }

    let parsed = [];
    let source = null;
    if (filename.toLowerCase().endsWith('.csv')) {
      source = 'airbnb';
      parsed = parseAirbnbCsv(buf.toString('utf8'));
    } else if (/\.xlsx?$/i.test(filename)) {
      source = 'booking';
      parsed = parseBookingXls(filePath);
    } else {
      continue;
    }

    const live = await loadLiveStates(client);
    let created = 0, cancelled = 0, updated = 0;

    for (const row of parsed) {
      const key = row.bookingKey;
      const last = live.get(key);

      if (row.status === 'cancelled') {
        if (last && last.event_type !== 'cancelled') {
          await insertEvent(client, {
            propertyId: row.propertyId,
            platform: row.platform,
            eventType: 'cancelled',
            bookingKey: key,
            startDate: row.startDate,
            endDate: row.endDate,
            guestName: row.guestName,
            reservationUrl: last.reservation_url,
            confirmationCode: row.confirmationCode || last.confirmation_code,
            source: source === 'airbnb' ? 'export_airbnb_csv' : 'export_booking_xls',
            sourceRef: filename,
            bookingCreatedAt: last.booking_created_at
          });
          cancelled++;
        }
        continue;
      }

      if (!last || last.event_type === 'cancelled') {
        await insertEvent(client, {
          propertyId: row.propertyId,
          platform: row.platform,
          eventType: 'created',
          bookingKey: key,
          startDate: row.startDate,
          endDate: row.endDate,
          guestName: row.guestName,
          reservationUrl: null,
          confirmationCode: row.confirmationCode,
          source: source === 'airbnb' ? 'export_airbnb_csv' : 'export_booking_xls',
          sourceRef: filename,
          bookingCreatedAt: row.bookedAt ? `${row.bookedAt} 00:00:00` : null
        });
        created++;
        continue;
      }

      const enriched =
        !sameStrings(last.guest_name, row.guestName) ||
        !sameStrings(last.confirmation_code, row.confirmationCode);

      if (enriched) {
        await insertEvent(client, {
          propertyId: row.propertyId,
          platform: row.platform,
          eventType: 'updated',
          bookingKey: key,
          startDate: row.startDate,
          endDate: row.endDate,
          guestName: row.guestName || last.guest_name,
          reservationUrl: last.reservation_url,
          confirmationCode: row.confirmationCode || last.confirmation_code,
          source: source === 'airbnb' ? 'export_airbnb_csv' : 'export_booking_xls',
          sourceRef: filename,
          bookingCreatedAt: last.booking_created_at || (row.bookedAt ? `${row.bookedAt} 00:00:00` : null)
        });
        updated++;
      }
    }

    await client.query(`
      INSERT INTO monitor_exports_log
        (filename, checksum, source, records_total, events_created, events_cancelled, events_updated)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [filename, checksum, source, parsed.length, created, cancelled, updated]);

    imports.push({ filename, source, records: parsed.length, created, cancelled, updated });
  }

  return imports;
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'] || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await withClient(async (client) => {
      const bookingsDiff = await syncFromBookingsTable(client);
      const imports = await ingestExports(client);
      return { bookingsDiff, imports };
    });
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('sync error:', err);
    res.status(500).json({ error: err.message });
  }
};
