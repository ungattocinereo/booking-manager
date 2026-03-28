// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

const { formatBooking, formatCleaningTask } = require('./_helpers');

module.exports = async (req, res) => {
  try {
    // Initialize database connection
    if (!db.pool && !db.db) {
      await db.init();
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Fetch all data
    const [properties, bookings, cleaningTasks, cleaners] = await Promise.all([
      db.getProperties(),
      db.getBookings(null, today),
      db.getCleaningTasks(null, today),
      db.getCleaners()
    ]);

    // Format dates to YYYY-MM-DD
    const formattedBookings = bookings.map(formatBooking);
    const formattedTasks = cleaningTasks.map(formatCleaningTask);

    // Calculate stats
    const stats = {
      total_properties: properties.length,
      total_bookings: formattedBookings.length,
      total_cleaning_tasks: formattedTasks.length,
      pending_cleaning_tasks: formattedTasks.filter(t => t.status === 'pending').length,
      total_cleaners: cleaners.length
    };

    // Group bookings by property
    const byProperty = {};
    for (const booking of formattedBookings) {
      if (!byProperty[booking.property_id]) {
        byProperty[booking.property_id] = [];
      }
      byProperty[booking.property_id].push(booking);
    }

    res.status(200).json({
      stats,
      properties,
      bookings: formattedBookings,
      bookings_by_property: byProperty,
      cleaning_tasks: formattedTasks,
      cleaners
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: error.message });
  }
};
