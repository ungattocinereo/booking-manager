// Add missing UNIQUE constraint to cleaning_tasks table
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

    // Add UNIQUE constraint if it doesn't exist
    const migrationSQL = `
      -- Drop existing constraint if any
      ALTER TABLE cleaning_tasks DROP CONSTRAINT IF EXISTS cleaning_tasks_property_id_scheduled_date_task_type_key;
      
      -- Add UNIQUE constraint
      ALTER TABLE cleaning_tasks 
      ADD CONSTRAINT cleaning_tasks_property_id_scheduled_date_task_type_key 
      UNIQUE (property_id, scheduled_date, task_type);
    `;

    await db.execute(migrationSQL);

    res.status(200).json({
      success: true,
      message: 'Migration applied successfully'
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message });
  }
};
