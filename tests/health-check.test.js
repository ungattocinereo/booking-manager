const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkApplicationHealth } = require('../lib/health-check');

test('health check verifies database access and latest durable sync result', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-health-'));
  process.env.SQLITE_DB_PATH = path.join(tempDir, 'bookings.db');
  delete require.cache[require.resolve('../backend/src/database')];
  const db = require('../backend/src/database');

  try {
    await db.init();
    const unknown = await checkApplicationHealth(db, { staleMinutes: 60 });
    assert.equal(unknown.httpStatus, 503);
    assert.equal(unknown.body.checks.database.status, 'ok');

    const successfulRun = await db.startSyncRun('test');
    await db.finishSyncRun(successfulRun, { status: 'success', eventsSynced: 12 });
    const healthy = await checkApplicationHealth(db, { staleMinutes: 60 });
    assert.equal(healthy.httpStatus, 200);
    assert.equal(healthy.body.status, 'ok');
    assert.equal(healthy.body.checks.sync.events_synced, 12);

    const failedRun = await db.startSyncRun('test');
    await db.finishSyncRun(failedRun, { status: 'failed', errorMessage: 'test failure' });
    const unhealthy = await checkApplicationHealth(db, { staleMinutes: 60 });
    assert.equal(unhealthy.httpStatus, 503);
    assert.equal(unhealthy.body.checks.sync.run_status, 'failed');
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  }
});
