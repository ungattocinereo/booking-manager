const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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

  // City tax (tassa di soggiorno) operations
  async getTaxPending(date) {
    return this.query(
      `SELECT b.*, p.name as property_name,
              (b.end_date - b.start_date) as nights
       FROM bookings b
       JOIN properties p ON b.property_id = p.id
       WHERE b.end_date = $1::date
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
      `SELECT b.*, p.name as property_name,
              (b.end_date - b.start_date) as nights
       FROM bookings b
       JOIN properties p ON b.property_id = p.id
       WHERE b.end_date = $1::date
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
    return this.execute(
      `INSERT INTO booking_stats_snapshots (
        captured_at, source, season_year, booking_count, occupied_nights, guest_count,
        occupancy_percent, avg_stay, monthly_nights, monthly_bookings,
        platform_counts, country_counts, payload
      ) VALUES (
        COALESCE($1::timestamp, NOW()), $2, $3, $4, $5, $6, $7, $8,
        $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb
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
    let n = 1;

    if (seasonYear) {
      where += ` AND season_year = $${n++}`;
      params.push(Number(seasonYear));
    }

    params.push(limit);
    const rows = await this.query(
      `SELECT * FROM (
        SELECT * FROM booking_stats_snapshots
        WHERE ${where}
        ORDER BY captured_at DESC
        LIMIT $${n}
      ) s ORDER BY captured_at ASC`,
      params
    );

    return rows.map(row => this.normalizeStatsSnapshot(row));
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

module.exports = new Database();
