// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

const { syncCalendars, generateCleaningTasks } = require('../backend/src/sync-calendars');
const { enrichFromExports } = require('../backend/src/enrich-from-exports');
const { recordBookingStatsSnapshot } = require('../backend/src/stats-snapshots');

module.exports = async (req, res) => {
  // Allow POST (manual) and GET (Vercel Cron)
  if (req.method === 'GET') {
    // Verify cron secret if set
    if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 Starting calendar sync...');
    
    // Sync calendars (doesn't close connection)
    const syncResult = await syncCalendars();

    // Generate cleaning tasks
    const tasksCount = await generateCleaningTasks();

    // Enrich bookings from Airbnb CSV exports
    const enrichResult = await enrichFromExports(db, !!USE_POSTGRES);

    // Persist aggregate statistics for the history slider/trend charts.
    const statsSnapshot = await recordBookingStatsSnapshot(db, { source: req.method === 'GET' ? 'cron' : 'manual' });

    res.status(200).json({
      success: true,
      message: 'Calendars synced successfully',
      events_synced: syncResult.totalEvents,
      stale_removed: syncResult.totalDeleted,
      tasks_created: tasksCount,
      enriched: enrichResult,
      stats_snapshot: {
        season_year: statsSnapshot.season_year,
        booking_count: statsSnapshot.booking_count,
        occupied_nights: statsSnapshot.occupied_nights,
        occupancy_percent: statsSnapshot.occupancy_percent
      },
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
