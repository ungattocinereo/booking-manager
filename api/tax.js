// Vercel Serverless Function — City Tax (Tassa di Soggiorno)
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

const { formatDate } = require('./_helpers');
const { isDateOnly } = require('../lib/api-validation');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.method === 'GET') {
      const { date } = req.query;
      if (!isDateOnly(date)) {
        return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
      }
      const bookings = await db.getTaxByDate(date);
      const formatted = bookings.map(b => ({
        ...b,
        start_date: formatDate(b.start_date),
        end_date: formatDate(b.end_date),
        tax_paid_at: b.tax_paid_at ? new Date(b.tax_paid_at).toISOString() : null,
        nights: b.nights != null ? Number(b.nights) : null
      }));
      return res.status(200).json(formatted);
    }

    if (req.method === 'PATCH') {
      const { booking_id, tax_paid } = req.body || {};
      if (!booking_id) {
        return res.status(400).json({ error: 'booking_id is required' });
      }
      if (typeof tax_paid !== 'boolean') {
        return res.status(400).json({ error: 'tax_paid must be boolean' });
      }
      await db.updateTaxPaid(booking_id, tax_paid);
      return res.status(200).json({ ok: true, booking_id, tax_paid });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in tax endpoint:', error);
    res.status(500).json({ error: error.message });
  }
};
