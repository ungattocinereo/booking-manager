const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSyncHealth } = require('../lib/sync-health');

const now = new Date('2026-07-10T12:00:00Z');

test('sync health reports fresh successful runs as healthy', () => {
  const health = buildSyncHealth({
    now,
    staleMinutes: 120,
    lastRun: {
      status: 'success',
      completed_at: '2026-07-10T11:30:00Z',
      events_synced: 42,
      feed_errors: []
    }
  });

  assert.equal(health.status, 'ok');
  assert.equal(health.stale, false);
  assert.equal(health.age_minutes, 30);
  assert.equal(health.events_synced, 42);
});

test('sync health distinguishes partial and stale data', () => {
  const partial = buildSyncHealth({
    now,
    staleMinutes: 120,
    lastRun: {
      status: 'partial',
      completed_at: '2026-07-10T11:45:00Z',
      feed_errors: [{ property_id: 'orange', platform: 'booking', error: 'timeout' }]
    }
  });
  assert.equal(partial.status, 'warning');
  assert.equal(partial.feed_error_count, 1);

  const stale = buildSyncHealth({
    now,
    staleMinutes: 60,
    lastRun: { status: 'success', completed_at: '2026-07-10T08:00:00Z' }
  });
  assert.equal(stale.status, 'error');
  assert.equal(stale.stale, true);
});
