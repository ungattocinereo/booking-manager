const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../database/bookings.db');
const SCHEMA_PATH = path.join(__dirname, '../database/schema.sql');

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
      let updateFields = 'raw_summary = ?, synced_at = CURRENT_TIMESTAMP';
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
        `INSERT INTO bookings (property_id, platform, start_date, end_date, raw_summary, guest_name, guest_country, reservation_url, phone_last4, booking_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  async getBookings(propertyId = null, fromDate = null) {
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

    sql += ' ORDER BY start_date ASC';
    return this.all(sql, params);
  }

  async deleteStaleBookings(propertyId, platform, feedKeys, today) {
    if (feedKeys.length === 0) return { changes: 0 };
    const placeholders = feedKeys.map(() => '(?, ?)').join(', ');
    const params = [propertyId, platform, today];
    for (const key of feedKeys) {
      params.push(key.startDate, key.endDate);
    }
    return this.run(
      `DELETE FROM bookings
       WHERE property_id = ? AND platform = ? AND end_date >= ?
       AND (start_date || '|' || end_date) NOT IN (${feedKeys.map(() => '?').join(', ')})`,
      [propertyId, platform, today, ...feedKeys.map(k => k.startDate + '|' + k.endDate)]
    );
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

  async getCleaningTasks(cleanerId = null, fromDate = null) {
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

    sql += ' ORDER BY ct.scheduled_date ASC';
    return this.all(sql, params);
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

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = new Database();
