const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('./database-postgres')
  : require('./database');
const { syncCalendars, generateCleaningTasks } = require('./sync-calendars');
const { enrichFromExports } = require('./enrich-from-exports');
const { recordBookingStatsSnapshot } = require('./stats-snapshots');

class SyncInProgressError extends Error {
  constructor() {
    super('Calendar sync is already running');
    this.name = 'SyncInProgressError';
    this.code = 'SYNC_IN_PROGRESS';
  }
}

let activeSyncPromise = null;

async function executeSync(source) {
  await db.init();
  const lock = typeof db.acquireSyncLock === 'function'
    ? await db.acquireSyncLock()
    : true;
  if (!lock) throw new SyncInProgressError();

  try {
    const syncResult = await syncCalendars();
    const enrichResult = await enrichFromExports(db, Boolean(USE_POSTGRES));
    const tasksCount = await generateCleaningTasks();
    const statsSnapshot = await recordBookingStatsSnapshot(db, { source });
    const failures = syncResult.failures || [];

    return {
      success: true,
      partial: failures.length > 0,
      message: failures.length ? `Sync completed with ${failures.length} feed error(s)` : 'Calendars synced successfully',
      events_synced: syncResult.totalEvents,
      stale_archived: syncResult.totalArchived || 0,
      stale_removed: 0,
      tasks_created: tasksCount,
      enriched: enrichResult,
      feed_errors: failures,
      stats_snapshot: {
        season_year: statsSnapshot.season_year,
        booking_count: statsSnapshot.booking_count,
        occupied_nights: statsSnapshot.occupied_nights,
        occupancy_percent: statsSnapshot.occupancy_percent
      },
      timestamp: new Date().toISOString()
    };
  } finally {
    if (typeof db.releaseSyncLock === 'function') await db.releaseSyncLock(lock);
  }
}

async function runSync({ source = 'manual' } = {}) {
  if (activeSyncPromise) throw new SyncInProgressError();
  activeSyncPromise = executeSync(source);
  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

module.exports = {
  runSync,
  SyncInProgressError
};
