// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

const { syncAll } = require('../backend/src/sync-calendars');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 Starting calendar sync...');
    
    // Sync calendars
    await syncAll();
    
    // Generate cleaning tasks
    console.log('🧹 Generating cleaning tasks...');
    const today = new Date().toISOString().split('T')[0];
    const bookings = await db.getBookings(null, today);
    
    let tasksCreated = 0;
    for (const booking of bookings) {
      try {
        await db.createCleaningTask(booking.property_id, booking.end_date, 'checkout_cleaning');
        tasksCreated++;
      } catch (err) {
        // Task already exists, skip
      }
    }
    
    console.log(`✅ Created ${tasksCreated} cleaning tasks`);
    
    res.status(200).json({
      success: true,
      message: 'Calendars synced successfully',
      tasks_created: tasksCreated,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
