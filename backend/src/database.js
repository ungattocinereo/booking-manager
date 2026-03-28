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
          console.log('✅ Database initialized');
          resolve();
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
    const { guestName, reservationUrl, phoneLast4, bookingType } = extra;
    // Check if booking exists
    const existing = await this.get(
      `SELECT id FROM bookings 
       WHERE property_id = ? AND platform = ? AND start_date = ? AND end_date = ?`,
      [propertyId, platform, startDate, endDate]
    );

    if (existing) {
      // Update
      return this.run(
        `UPDATE bookings SET raw_summary = ?, synced_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [rawSummary, existing.id]
      );
    } else {
      // Insert
      return this.run(
        `INSERT INTO bookings (property_id, platform, start_date, end_date, raw_summary)
         VALUES (?, ?, ?, ?, ?)`,
        [propertyId, platform, startDate, endDate, rawSummary]
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

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = new Database();
