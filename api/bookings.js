// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

const { formatBooking } = require('./_helpers');
const { recordBookingStatsSnapshot } = require('../backend/src/stats-snapshots');

module.exports = async (req, res) => {
  try {
    // Initialize database connection
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.query.stats_snapshots === '1') {
      if (req.method === 'POST') {
        const snapshot = await recordBookingStatsSnapshot(db, { source: 'manual' });
        return res.status(200).json({ success: true, snapshot });
      }
      const snapshots = await db.getStatsSnapshots({
        seasonYear: req.query.season_year,
        limit: req.query.limit
      });
      return res.status(200).json(snapshots);
    }

    const { property_id, from_date } = req.query;
    const bookings = await db.getBookings(property_id, from_date);
    
    // Format dates to YYYY-MM-DD
    const formattedBookings = bookings.map(formatBooking);
    
    res.status(200).json(formattedBookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: error.message });
  }
};
