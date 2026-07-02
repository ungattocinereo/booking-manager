const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../database/bookings.db');
const SCHEMA_PATH = path.join(__dirname, '../database/schema.sql');

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

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Load schema
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        this.db.exec(schema, (err) => {
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
      `SELECT id FROM bookings
       WHERE property_id = ? AND platform = ? AND start_date = ? AND end_date = ?`,
      [propertyId, platform, startDate, endDate]
    );

    if (existing) {
      // Update
      let updateFields = 'raw_summary = ?, synced_at = CURRENT_TIMESTAMP, active = 1, missing_since = NULL';
      const updateParams = [rawSummary];
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
      if (bookingType) {
        updateFields += ', booking_type = ?';
        updateParams.push(bookingType);
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
    return this.run(
      `UPDATE bookings
       SET active = 0,
           missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
           synced_at = CURRENT_TIMESTAMP
       WHERE property_id = ? AND platform = ? AND end_date >= ?
       AND COALESCE(active, 1) != 0
       AND (start_date || '|' || end_date) NOT IN (${feedKeys.map(() => '?').join(', ')})`,
      [propertyId, platform, today, ...feedKeys.map(k => k.startDate + '|' + k.endDate)]
    );
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
    return {
      ...row,
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
      payload: parseJsonColumn(row.payload)
    };
  }

  async createStatsSnapshot(snapshot) {
    return this.run(
      `INSERT INTO booking_stats_snapshots (
        captured_at, source, season_year, booking_count, occupied_nights, guest_count,
        occupancy_percent, avg_stay, monthly_nights, monthly_bookings,
        platform_counts, country_counts, payload
      ) VALUES (
        COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
      [
        snapshot.captured_at || null,
        snapshot.source || 'sync',
        snapshot.season_year,
        snapshot.booking_count || 0,
        snapshot.occupied_nights || 0,
        snapshot.guest_count || 0,
        snapshot.occupancy_percent || 0,
        snapshot.avg_stay || 0,
        stringifyJson(snapshot.monthly_nights),
        stringifyJson(snapshot.monthly_bookings),
        stringifyJson(snapshot.platform_counts),
        stringifyJson(snapshot.country_counts),
        stringifyJson(snapshot.payload)
      ]
    );
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

    params.push(limit);
    const rows = await this.all(
      `SELECT * FROM (
        SELECT * FROM booking_stats_snapshots
        WHERE ${where}
        ORDER BY captured_at DESC
        LIMIT ?
      ) ORDER BY captured_at ASC`,
      params
    );

    return rows.map(row => this.normalizeStatsSnapshot(row));
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = new Database();
