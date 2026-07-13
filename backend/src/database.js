const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { buildSyncHealth } = require('../../lib/sync-health');
const {
  canonicalizeStatsSnapshots,
  isEmptyStatsSnapshot,
  prepareEmptySnapshotWrite,
  romeDateKey,
  shouldReplaceDailySnapshot
} = require('./stats-snapshots');

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '../database/bookings.db');
const SCHEMA_PATH = path.join(__dirname, '../database/schema.sql');

function hasGuestDetails(row) {
  return Boolean(String(row?.guest_name || '').trim()) || Number(row?.guest_count) > 0;
}

function shouldProtectExistingBookingFromMarker(existing, platform, bookingType) {
  return platform === 'booking'
    && ['blocked', 'unavailable'].includes(String(bookingType || '').toLowerCase())
    && (
      !existing?.booking_type ||
      String(existing.booking_type).toLowerCase() === 'reservation' ||
      hasGuestDetails(existing)
    );
}

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
    this.db = null;
    this.statsSnapshotWriteLocks = new Map();
  }

  async init() {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Load schema
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        this.db.exec(`PRAGMA foreign_keys = ON;\n${schema}`, (err) => {
          if (err) {
            reject(err);
            return;
          }
          const migrations = [
            'ALTER TABLE bookings ADD COLUMN guest_country TEXT',
            'ALTER TABLE bookings ADD COLUMN guest_count INTEGER',
            'ALTER TABLE bookings ADD COLUMN reservation_url TEXT',
            'ALTER TABLE bookings ADD COLUMN phone_last4 TEXT',
            'ALTER TABLE bookings ADD COLUMN booking_type TEXT DEFAULT "reservation"',
            'ALTER TABLE cleaners ADD COLUMN slug TEXT',
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_cleaners_slug ON cleaners(slug)',
            'ALTER TABLE bookings ADD COLUMN tax_paid INTEGER DEFAULT 0',
            'ALTER TABLE bookings ADD COLUMN tax_paid_at TEXT',
            'ALTER TABLE bookings ADD COLUMN created_at TEXT',
            'ALTER TABLE bookings ADD COLUMN active INTEGER DEFAULT 1',
            'ALTER TABLE bookings ADD COLUMN missing_since TEXT',
            'ALTER TABLE cleaning_tasks ADD COLUMN active INTEGER DEFAULT 1',
            'ALTER TABLE cleaning_tasks ADD COLUMN missing_since TEXT',
            'UPDATE bookings SET created_at = COALESCE(created_at, synced_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL',
            'UPDATE bookings SET active = COALESCE(active, 1) WHERE active IS NULL',
            'UPDATE cleaning_tasks SET active = COALESCE(active, 1) WHERE active IS NULL',
            'CREATE INDEX IF NOT EXISTS idx_bookings_active ON bookings(active)',
            'CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_active ON cleaning_tasks(active)',
          ];

          const runMigration = (index = 0) => {
            if (index >= migrations.length) {
              console.log('✅ Database initialized');
              resolve();
              return;
            }

            this.db.run(migrations[index], (migrationErr) => {
              if (migrationErr && !/duplicate column name/i.test(migrationErr.message)) {
                reject(migrationErr);
                return;
              }
              runMigration(index + 1);
            });
          };

          runMigration();
        });
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Property operations
  async createProperty(id, name) {
    return this.run('INSERT OR IGNORE INTO properties (id, name) VALUES (?, ?)', [id, name]);
  }

  async getProperties() {
    return this.all('SELECT * FROM properties ORDER BY name');
  }

  // Booking operations
  async upsertBooking(propertyId, platform, startDate, endDate, rawSummary, extra = {}) {
    const { guestName, guestCountry, reservationUrl, phoneLast4, bookingType } = extra;
    // Check if booking exists
    const existing = await this.get(
      `SELECT id, booking_type, guest_name, guest_count, raw_summary FROM bookings
       WHERE property_id = ? AND platform = ? AND start_date = ? AND end_date = ?`,
      [propertyId, platform, startDate, endDate]
    );

    if (existing) {
      const protectedFromMarker = shouldProtectExistingBookingFromMarker(existing, platform, bookingType);
      const nextRawSummary = protectedFromMarker ? (existing.raw_summary || rawSummary) : rawSummary;
      const nextBookingType = protectedFromMarker ? 'reservation' : bookingType;
      // Update
      let updateFields = 'raw_summary = ?, synced_at = CURRENT_TIMESTAMP, active = 1, missing_since = NULL';
      const updateParams = [nextRawSummary];
      if (guestName) {
        updateFields += ', guest_name = ?';
        updateParams.push(guestName);
      }
      if (guestCountry) {
        updateFields += ', guest_country = ?';
        updateParams.push(guestCountry);
      }
      if (reservationUrl) {
        updateFields += ', reservation_url = ?';
        updateParams.push(reservationUrl);
      }
      if (phoneLast4) {
        updateFields += ', phone_last4 = ?';
        updateParams.push(phoneLast4);
      }
      if (nextBookingType) {
        updateFields += ', booking_type = ?';
        updateParams.push(nextBookingType);
      }
      updateParams.push(existing.id);
      return this.run(
        `UPDATE bookings SET ${updateFields} WHERE id = ?`,
        updateParams
      );
    } else {
      // Insert
      return this.run(
        `INSERT INTO bookings (property_id, platform, start_date, end_date, raw_summary, guest_name, guest_country, reservation_url, phone_last4, booking_type, active, missing_since, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, CURRENT_TIMESTAMP)`,
        [
          propertyId,
          platform,
          startDate,
          endDate,
          rawSummary,
          guestName || null,
          guestCountry || null,
          reservationUrl || null,
          phoneLast4 || null,
          bookingType || 'reservation'
        ]
      );
    }
  }

  async getBookings(propertyId = null, fromDate = null, options = {}) {
    let sql = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];

    if (propertyId) {
      sql += ' AND property_id = ?';
      params.push(propertyId);
    }

    if (fromDate) {
      sql += ' AND end_date >= ?';
      params.push(fromDate);
    }

    if (!options.includeInactive) {
      sql += ' AND COALESCE(active, 1) != 0';
    }

    sql += ' ORDER BY start_date ASC';
    return this.all(sql, params);
  }

  async archiveStaleBookings(propertyId, platform, feedKeys, today) {
    if (feedKeys.length === 0) return { changes: 0 };
    const protectedBooking = `platform = 'booking' AND (
           COALESCE(booking_type, 'reservation') = 'reservation' OR
           COALESCE(NULLIF(TRIM(guest_name), ''), '') <> '' OR
           COALESCE(guest_count, 0) > 0
         )`;
    const coverageChecks = feedKeys.map(() => '(? <= MAX(start_date, ?) AND ? >= end_date)').join(' OR ');
    const staleWhere = `property_id = ? AND platform = ? AND end_date >= ?
       AND COALESCE(active, 1) != 0
       AND (
         (
           NOT (${protectedBooking})
           AND (start_date || '|' || end_date) NOT IN (${feedKeys.map(() => '?').join(', ')})
         )
         OR (
           ${protectedBooking}
           AND start_date > ?
           AND end_date > ?
           AND NOT (${coverageChecks})
         )
       )`;
    const staleParams = [
      propertyId,
      platform,
      today,
      ...feedKeys.map(k => k.startDate + '|' + k.endDate),
      today,
      today,
      ...feedKeys.flatMap(k => [k.startDate, today, k.endDate])
    ];

    const archived = await this.run(
      `UPDATE bookings
       SET active = 0, synced_at = CURRENT_TIMESTAMP
       WHERE ${staleWhere}
       AND missing_since IS NOT NULL
       AND missing_since <= ?`,
      [...staleParams, staleBookingCutoffIso()]
    );

    const quarantined = await this.run(
      `UPDATE bookings
       SET missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
           synced_at = CURRENT_TIMESTAMP
       WHERE ${staleWhere}`,
      staleParams
    );

    return { changes: archived.changes, quarantined: quarantined.changes };
  }

  async deleteStaleBookings(propertyId, platform, feedKeys, today) {
    return this.archiveStaleBookings(propertyId, platform, feedKeys, today);
  }

  // Cleaner operations
  async createCleaner(id, name) {
    return this.run('INSERT OR IGNORE INTO cleaners (id, name) VALUES (?, ?)', [id, name]);
  }

  async assignCleanerToProperty(cleanerId, propertyId) {
    return this.run(
      'INSERT OR IGNORE INTO cleaner_properties (cleaner_id, property_id) VALUES (?, ?)',
      [cleanerId, propertyId]
    );
  }

  async getCleaners() {
    return this.all('SELECT * FROM cleaners ORDER BY name');
  }

  async getCleanerBySlug(slug) {
    return this.get('SELECT * FROM cleaners WHERE slug = ?', [slug]);
  }

  async updateCleaner(id, fields) {
    const sets = [];
    const params = [];
    if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
    if (fields.slug !== undefined) { sets.push('slug = ?'); params.push(fields.slug); }
    if (sets.length === 0) return;
    params.push(id);
    return this.run(`UPDATE cleaners SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  async getCleanerProperties(cleanerId) {
    return this.all(
      `SELECT p.* FROM properties p
       JOIN cleaner_properties cp ON p.id = cp.property_id
       WHERE cp.cleaner_id = ?`,
      [cleanerId]
    );
  }

  async replaceCleanerProperties(cleanerId, propertyIds = []) {
    const uniqueIds = [...new Set(propertyIds)];
    await this.run('BEGIN IMMEDIATE');
    try {
      await this.run('DELETE FROM cleaner_properties WHERE cleaner_id = ?', [cleanerId]);
      for (const propertyId of uniqueIds) {
        await this.run(
          'INSERT OR IGNORE INTO cleaner_properties (cleaner_id, property_id) VALUES (?, ?)',
          [cleanerId, propertyId]
        );
      }
      await this.run('COMMIT');
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async deleteCleanerWithRelations(cleanerId) {
    await this.run('BEGIN IMMEDIATE');
    try {
      await this.run('DELETE FROM cleaner_properties WHERE cleaner_id = ?', [cleanerId]);
      await this.run('UPDATE cleaning_tasks SET cleaner_id = NULL WHERE cleaner_id = ?', [cleanerId]);
      await this.run('DELETE FROM cleaners WHERE id = ?', [cleanerId]);
      await this.run('COMMIT');
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  // Cleaning task operations
  async createCleaningTask(propertyId, scheduledDate, taskType = 'checkout_cleaning') {
    // Auto-assign cleaner based on property
    const cleaner = await this.get(
      `SELECT cleaner_id FROM cleaner_properties WHERE property_id = ? LIMIT 1`,
      [propertyId]
    );

    return this.run(
      `INSERT INTO cleaning_tasks (property_id, cleaner_id, scheduled_date, task_type)
       VALUES (?, ?, ?, ?)`,
      [propertyId, cleaner?.cleaner_id || null, scheduledDate, taskType]
    );
  }

  async getCleaningTasks(cleanerId = null, fromDate = null, options = {}) {
    let sql = `
      SELECT ct.*, p.name as property_name, c.name as cleaner_name
      FROM cleaning_tasks ct
      JOIN properties p ON ct.property_id = p.id
      LEFT JOIN cleaners c ON ct.cleaner_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (cleanerId) {
      sql += ' AND ct.cleaner_id = ?';
      params.push(cleanerId);
    }

    if (fromDate) {
      sql += ' AND ct.scheduled_date >= ?';
      params.push(fromDate);
    }

    if (!options.includeInactive) {
      sql += ' AND COALESCE(ct.active, 1) != 0';
    }

    sql += ' ORDER BY ct.scheduled_date ASC';
    return this.all(sql, params);
  }

  async archiveStaleCleaningTasks(today) {
    return this.run(
      `UPDATE cleaning_tasks
       SET active = 0,
           missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP)
       WHERE scheduled_date >= ?
         AND task_type = 'checkout_cleaning'
         AND status NOT IN ('completed', 'cancelled')
         AND COALESCE(active, 1) != 0
         AND NOT EXISTS (
           SELECT 1
           FROM bookings b
           WHERE b.property_id = cleaning_tasks.property_id
             AND b.end_date = cleaning_tasks.scheduled_date
             AND COALESCE(b.active, 1) != 0
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
    return this.run(
      'UPDATE cleaning_tasks SET status = ?, completed_at = ? WHERE id = ?',
      [status, completedAt, taskId]
    );
  }

  // City tax (tassa di soggiorno) operations
  async getTaxPending(date) {
    return this.all(
      `SELECT b.*, p.name as property_name,
              CAST(julianday(b.end_date) - julianday(b.start_date) AS INTEGER) as nights
       FROM bookings b
       JOIN properties p ON b.property_id = p.id
       WHERE b.end_date = ?
         AND COALESCE(b.active, 1) != 0
         AND b.tax_paid = 0
         AND NOT (
           (b.raw_summary LIKE '%Not available%' OR b.raw_summary LIKE '%CLOSED%' OR b.booking_type IN ('blocked', 'unavailable'))
           AND b.guest_name IS NULL
         )
       ORDER BY p.name ASC`,
      [date]
    );
  }

  async getTaxByDate(date) {
    return this.all(
      `SELECT b.*, p.name as property_name,
              CAST(julianday(b.end_date) - julianday(b.start_date) AS INTEGER) as nights
       FROM bookings b
       JOIN properties p ON b.property_id = p.id
       WHERE b.end_date = ?
         AND COALESCE(b.active, 1) != 0
         AND NOT (
           (b.raw_summary LIKE '%Not available%' OR b.raw_summary LIKE '%CLOSED%' OR b.booking_type IN ('blocked', 'unavailable'))
           AND b.guest_name IS NULL
         )
       ORDER BY p.name ASC`,
      [date]
    );
  }

  async updateTaxPaid(bookingId, paid) {
    const paidAt = paid ? new Date().toISOString() : null;
    return this.run(
      'UPDATE bookings SET tax_paid = ?, tax_paid_at = ? WHERE id = ?',
      [paid ? 1 : 0, paidAt, bookingId]
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
    const lockKey = `${snapshot.season_year}:${snapshotDate}`;
    const previous = this.statsSnapshotWriteLocks.get(lockKey) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const candidates = await this.all(
        `SELECT *
         FROM booking_stats_snapshots
         WHERE season_year = ?
         ORDER BY captured_at DESC, id DESC
         LIMIT 2000`,
        [snapshot.season_year]
      );
      const sameDay = candidates
        .map(row => this.normalizeStatsSnapshot(row))
        .filter(row => row.snapshot_date === snapshotDate);
      const existing = sameDay.reduce(
        (best, row) => shouldReplaceDailySnapshot(best, row) ? row : best,
        null
      );
      let incoming = {
        ...snapshot,
        captured_at: capturedAt,
        snapshot_date: snapshotDate,
        payload: { ...(snapshot.payload || {}), snapshot_date: snapshotDate }
      };
      const emptyPlan = prepareEmptySnapshotWrite(existing, incoming);
      incoming = emptyPlan.snapshot;

      if (existing && emptyPlan.quarantined && emptyPlan.existingPayload) {
        await this.run('UPDATE booking_stats_snapshots SET payload = ? WHERE id = ?', [
          stringifyJson(emptyPlan.existingPayload),
          existing.id
        ]);
        return {
          lastID: existing.id,
          changes: 0,
          skipped: true,
          quarantined: true,
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
          await this.run('UPDATE booking_stats_snapshots SET payload = ? WHERE id = ?', [
            stringifyJson(cleanPayload),
            existing.id
          ]);
          retained = { ...existing, payload: cleanPayload };
        }
        return { lastID: existing.id, changes: 0, skipped: true, snapshot: retained };
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

      if (existing) {
        const result = await this.run(
          `UPDATE booking_stats_snapshots
           SET captured_at = ?, source = ?, season_year = ?, booking_count = ?,
               occupied_nights = ?, guest_count = ?, occupancy_percent = ?, avg_stay = ?,
               monthly_nights = ?, monthly_bookings = ?, platform_counts = ?,
               country_counts = ?, payload = ?
          WHERE id = ?`,
          [...values, existing.id]
        );
        return { ...result, confirmed: emptyPlan.confirmed, snapshot: incoming };
      }

      const result = await this.run(
        `INSERT INTO booking_stats_snapshots (
        captured_at, source, season_year, booking_count, occupied_nights, guest_count,
        occupancy_percent, avg_stay, monthly_nights, monthly_bookings,
        platform_counts, country_counts, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );
      return { ...result, quarantined: emptyPlan.quarantined, confirmed: emptyPlan.confirmed, snapshot: incoming };
    });

    this.statsSnapshotWriteLocks.set(lockKey, write);
    try {
      return await write;
    } finally {
      if (this.statsSnapshotWriteLocks.get(lockKey) === write) {
        this.statsSnapshotWriteLocks.delete(lockKey);
      }
    }
  }

  async getStatsSnapshots(options = {}) {
    const seasonYear = options.seasonYear || options.season_year;
    const limit = Math.max(1, Math.min(Number(options.limit) || 500, 2000));
    const params = [];
    let where = '1=1';

    if (seasonYear) {
      where += ' AND season_year = ?';
      params.push(Number(seasonYear));
    }

    // Apply the public limit after canonicalization so legacy duplicate rows do
    // not crowd older calendar days out of the response.
    const rawLimit = Math.min(10000, Math.max(2000, limit * 10));
    params.push(rawLimit);
    const rows = await this.all(
      `SELECT * FROM (
        SELECT * FROM booking_stats_snapshots
        WHERE ${where}
        ORDER BY captured_at DESC
        LIMIT ?
      ) ORDER BY captured_at ASC`,
      params
    );

    return canonicalizeStatsSnapshots(
      rows.map(row => this.normalizeStatsSnapshot(row)),
      { limit }
    );
  }

  async ping() {
    const row = await this.get('SELECT 1 AS ok');
    return row?.ok === 1;
  }

  async startSyncRun(source = 'manual') {
    const result = await this.run(
      `INSERT INTO sync_runs (source, status, feed_errors)
       VALUES (?, 'running', '[]')`,
      [source]
    );
    return result.lastID;
  }

  async finishSyncRun(id, { status, eventsSynced = 0, feedErrors = [], errorMessage = null }) {
    if (!id) return;
    await this.run(
      `UPDATE sync_runs
       SET completed_at = CURRENT_TIMESTAMP,
           status = ?,
           events_synced = ?,
           feed_errors = ?,
           error_message = ?
       WHERE id = ?`,
      [status, eventsSynced, JSON.stringify(feedErrors || []), errorMessage, id]
    );
  }

  async getSyncHealth(options = {}) {
    let lastRun = null;
    let lastDataRun = null;
    try {
      [lastRun, lastDataRun] = await Promise.all([
        this.get(
          `SELECT id, started_at, completed_at, source, status, events_synced, feed_errors
           FROM sync_runs
           ORDER BY started_at DESC, id DESC
           LIMIT 1`
        ),
        this.get(
          `SELECT completed_at
           FROM sync_runs
           WHERE status IN ('success', 'partial') AND completed_at IS NOT NULL
           ORDER BY completed_at DESC, id DESC
           LIMIT 1`
        )
      ]);
    } catch (error) {
      if (!/no such table: sync_runs/i.test(error.message)) throw error;
    }
    const legacySnapshot = await this.get(
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

  close() {
    if (!this.db) return Promise.resolve();
    const connection = this.db;
    this.db = null;
    return new Promise((resolve, reject) => {
      connection.close(error => error ? reject(error) : resolve());
    });
  }
}

module.exports = new Database();
