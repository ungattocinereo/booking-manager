const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('./database-postgres')
  : require('./database');
const { syncCalendars, generateCleaningTasks } = require('./sync-calendars');
const { enrichFromExports } = require('./enrich-from-exports');
const { recordBookingStatsSnapshot } = require('./stats-snapshots');
const { acquireSyncLockWithRetry } = require('../../lib/sync-lock-retry');

class SyncInProgressError extends Error {
  constructor() {
    super('Calendar sync is already running');
    this.name = 'SyncInProgressError';
    this.code = 'SYNC_IN_PROGRESS';
  }
}

let activeSyncPromise = null;

async function executeSync(source, options = {}) {
  await db.init();
  let announcedLockWait = false;
  const lock = typeof db.acquireSyncLock === 'function'
    ? await acquireSyncLockWithRetry(
      () => db.acquireSyncLock(),
      {
        waitMs: options.lockWaitMs,
        retryMs: options.lockRetryMs,
        onRetry: ({ remainingMs }) => {
          if (announcedLockWait) return;
          announcedLockWait = true;
          console.warn(`Another calendar sync is running; waiting up to ${Math.ceil(remainingMs / 1000)}s for it to finish`);
        }
      }
    )
    : true;
  if (!lock) throw new SyncInProgressError();

  let runId = null;
  try {
    if (typeof db.startSyncRun === 'function') runId = await db.startSyncRun(source);
    const syncResult = await syncCalendars();
    const enrichResult = await enrichFromExports(db, Boolean(USE_POSTGRES));
    const tasksCount = await generateCleaningTasks();
    const failures = syncResult.failures || [];
    const statsSnapshot = await recordBookingStatsSnapshot(db, {
      source,
      syncStatus: failures.length ? 'partial' : 'success',
      feedErrorCount: failures.length
    });

    const result = {
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
        occupancy_percent: statsSnapshot.occupancy_percent,
        saved: statsSnapshot.storage?.saved !== false
      },
      timestamp: new Date().toISOString()
    };
    if (runId && typeof db.finishSyncRun === 'function') {
      await db.finishSyncRun(runId, {
        status: result.partial ? 'partial' : 'success',
        eventsSynced: result.events_synced,
        feedErrors: result.feed_errors
      });
    }
    return result;
  } catch (error) {
    if (runId && typeof db.finishSyncRun === 'function') {
      await db.finishSyncRun(runId, {
        status: 'failed',
        errorMessage: String(error?.message || 'Sync failed').slice(0, 500)
      }).catch(logError => console.error('Failed to record sync failure:', logError.message));
    }
    throw error;
  } finally {
    if (typeof db.releaseSyncLock === 'function') await db.releaseSyncLock(lock);
  }
}

async function runSync({ source = 'manual', lockWaitMs = 0, lockRetryMs = 1000 } = {}) {
  if (activeSyncPromise) throw new SyncInProgressError();
  activeSyncPromise = executeSync(source, { lockWaitMs, lockRetryMs });
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
