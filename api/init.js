// Vercel Serverless Function - Initialize cleaners and their properties
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

module.exports = async (req, res) => {
  try {
    // Initialize database connection
    if (!db.pool && !db.db) {
      await db.init();
    }

    // Create default cleaners
    const cleaners = [
      {
        id: 'cleaner_a',
        name: 'Уборщица А',
        properties: ['vingtage', 'orange', 'solo']
      },
      {
        id: 'cleaner_b',
        name: 'Уборщица Б',
        properties: ['orange', 'solo', 'youth']
      }
    ];

    for (const cleaner of cleaners) {
      await db.createCleaner(cleaner.id, cleaner.name);
      
      // Assign properties to cleaner
      for (const propId of cleaner.properties) {
        await db.assignCleanerToProperty(cleaner.id, propId);
      }
    }

    // Generate cleaning tasks for all bookings
    const today = new Date().toISOString().split('T')[0];
    const bookings = await db.getBookings(null, today);
    
    let tasksCreated = 0;
    for (const booking of bookings) {
      try {
        await db.createCleaningTask(booking.property_id, booking.end_date, 'checkout_cleaning');
        tasksCreated++;
      } catch (err) {
        // Task might already exist, skip
      }
    }

    res.status(200).json({
      success: true,
      message: 'Cleaners and tasks initialized',
      cleaners_created: cleaners.length,
      tasks_created: tasksCreated
    });
  } catch (error) {
    console.error('Error initializing cleaners:', error);
    res.status(500).json({ error: error.message });
  }
};
