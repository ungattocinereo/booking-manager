const { positiveNumber } = require('./sync-health');

async function checkApplicationHealth(db, options = {}) {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const staleMinutes = positiveNumber(
    options.staleMinutes ?? process.env.HEALTH_SYNC_STALE_MINUTES,
    26 * 60
  );

  try {
    if (!db.pool && !db.db) await db.init();
    await db.ping();
    const databaseLatencyMs = Date.now() - startedAt;
    const sync = await db.getSyncHealth({ staleMinutes });
    const healthy = sync.status === 'ok' || sync.status === 'warning';
    const { feed_errors: _privateFeedErrors, ...publicSync } = sync;

    return {
      httpStatus: healthy ? 200 : 503,
      body: {
        status: healthy ? (sync.status === 'warning' ? 'degraded' : 'ok') : 'unhealthy',
        timestamp,
        checks: {
          database: { status: 'ok', latency_ms: databaseLatencyMs },
          sync: publicSync
        }
      }
    };
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      httpStatus: 503,
      body: {
        status: 'unhealthy',
        timestamp,
        checks: {
          database: { status: 'error', latency_ms: Date.now() - startedAt },
          sync: { status: 'unknown' }
        }
      }
    };
  }
}

module.exports = { checkApplicationHealth };
