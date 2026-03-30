const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../database/schema-postgres.sql');

class Database {
  constructor() {
    this.pool = null;
  }

  async init() {
    // Use Vercel Postgres URL or local
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('POSTGRES_URL or DATABASE_URL environment variable is required');
    }

    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      console.log('✅ Database connected');
      
      // Initialize schema if needed
      if (fs.existsSync(SCHEMA_PATH)) {
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        await client.query(schema);
        console.log('✅ Schema initialized');
      }
      
      client.release();
    } catch (err) {
      console.error('❌ Database connection failed:', err.message);
      throw err;
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
  async upsertBooking(propertyId, platform, startDate, endDate, rawSummary, extra = {}) {
    const { guestName, guestCountry, reservationUrl, phoneLast4, bookingType } = extra;
    return this.execute(
      `INSERT INTO bookings (property_id, platform, start_date, end_date, raw_summary, guest_name, guest_country, reservation_url, phone_last4, booking_type, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (property_id, platform, start_date, end_date)
       DO UPDATE SET raw_summary = $5, guest_name = COALESCE($6, bookings.guest_name), guest_country = COALESCE($7, bookings.guest_country), reservation_url = COALESCE($8, bookings.reservation_url), phone_last4 = COALESCE($9, bookings.phone_last4), booking_type = COALESCE($10, bookings.booking_type), synced_at = NOW()`,
      [propertyId, platform, startDate, endDate, rawSummary, guestName || null, guestCountry || null, reservationUrl || null, phoneLast4 || null, bookingType || 'reservation']
    );
  }

  async getBookings(propertyId = null, fromDate = null) {
    let sql = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (propertyId) {
      sql += ` AND property_id = $${paramCount++}`;
      params.push(propertyId);
    }

    if (fromDate) {
      sql += ` AND end_date >= $${paramCount++}`;
      params.push(fromDate);
    }

    sql += ' ORDER BY start_date ASC';
    return this.query(sql, params);
  }

  async deleteStaleBookings(propertyId, platform, feedKeys, today) {
    if (feedKeys.length === 0) return { rowCount: 0 };
    const keyStrings = feedKeys.map(k => k.startDate + '|' + k.endDate);
    const placeholders = keyStrings.map((_, i) => `$${i + 4}`).join(', ');
    return this.execute(
      `DELETE FROM bookings
       WHERE property_id = $1 AND platform = $2 AND end_date >= $3::date
       AND (to_char(start_date, 'YYYY-MM-DD') || '|' || to_char(end_date, 'YYYY-MM-DD')) NOT IN (${placeholders})`,
      [propertyId, platform, today, ...keyStrings]
    );
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
       ON CONFLICT (property_id, scheduled_date, task_type) DO NOTHING
       RETURNING id`,
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
    let paramCount = 1;

    if (cleanerId) {
      sql += ` AND ct.cleaner_id = $${paramCount++}`;
      params.push(cleanerId);
    }

    if (fromDate) {
      sql += ` AND ct.scheduled_date >= $${paramCount++}`;
      params.push(fromDate);
    }

    sql += ' ORDER BY ct.scheduled_date ASC';
    return this.query(sql, params);
  }

  async updateTaskStatus(taskId, status, completedAt = null) {
    return this.execute(
      'UPDATE cleaning_tasks SET status = $1, completed_at = $2 WHERE id = $3',
      [status, completedAt, taskId]
    );
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = new Database();
