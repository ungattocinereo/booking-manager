// Vercel Serverless Function — Maid calendar data
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../../backend/src/database-postgres')
  : require('../../backend/src/database');
const { formatBooking, todayInRome } = require('../_helpers');
const { normalizeBookingsForDisplay } = require('../../lib/booking-normalization');

module.exports = async (req, res) => {
  try {
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slug } = req.query;
    const cleaner = await db.getCleanerBySlug(slug);
    if (!cleaner) return res.status(404).json({ error: 'Not found' });

    const assignedProperties = await db.getCleanerProperties(cleaner.id);
    const propertyIds = assignedProperties.map(p => p.id);

    const today = todayInRome();
    const allBookings = normalizeBookingsForDisplay(await db.getBookings(null, today));

    const maidBookings = allBookings.filter(b => {
      if (!propertyIds.includes(b.property_id)) return false;
      return true;
    }).map(formatBooking);

    res.status(200).json({
      cleaner: { id: cleaner.id, name: cleaner.name, slug: cleaner.slug },
      properties: assignedProperties,
      bookings: maidBookings
    });
  } catch (error) {
    console.error('Error with maid calendar:', error);
    res.status(500).json({ error: error.message });
  }
};
