// Debug endpoint for testing cleaning task creation
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

module.exports = async (req, res) => {
  try {
    // Initialize database
    if (!db.pool && !db.db) {
      await db.init();
    }

    // Get one booking
    const bookings = await db.getBookings(null, '2026-03-28');
    const testBooking = bookings[0];
    
    if (!testBooking) {
      return res.status(404).json({ error: 'No bookings found' });
    }

    // Try to create a cleaning task
    console.log('Creating task for:', testBooking.property_id, testBooking.end_date);
    const result = await db.createCleaningTask(
      testBooking.property_id,
      testBooking.end_date,
      'checkout_cleaning'
    );

    res.status(200).json({
      success: true,
      booking: testBooking,
      result: result
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
};
