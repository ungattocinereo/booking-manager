const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-stats-'));
process.env.SQLITE_DB_PATH = path.join(tempDir, 'bookings.db');
const db = require('../backend/src/database');

function snapshot(overrides = {}) {
  return {
    captured_at: '2026-07-10T08:00:00.000Z',
    source: 'sync',
    season_year: 2026,
    booking_count: 10,
    occupied_nights: 30,
    guest_count: 20,
    occupancy_percent: 12.5,
    avg_stay: 3,
    monthly_nights: {},
    monthly_bookings: {},
    platform_counts: {},
    country_counts: {},
    payload: {
      snapshot_date: '2026-07-10',
      data_quality: { valid: true },
      sync_status: 'success'
    },
    ...overrides
  };
}

test('SQLite storage upserts a Rome day and protects success from partial data', async () => {
  try {
    await db.init();
    await db.createStatsSnapshot(snapshot());
    const skipped = await db.createStatsSnapshot(snapshot({
      captured_at: '2026-07-10T12:00:00.000Z',
      booking_count: 2,
      payload: {
        snapshot_date: '2026-07-10',
        data_quality: { valid: true },
        sync_status: 'partial',
        feed_error_count: 3
      }
    }));
    assert.equal(skipped.skipped, true);

    await db.createStatsSnapshot(snapshot({
      captured_at: '2026-07-10T13:00:00.000Z',
      booking_count: 12
    }));

    const raw = await db.get(
      'SELECT COUNT(*) AS count, MAX(booking_count) AS booking_count FROM booking_stats_snapshots'
    );
    assert.equal(raw.count, 1);
    assert.equal(raw.booking_count, 12);

    const history = await db.getStatsSnapshots({ seasonYear: 2026, limit: 100 });
    assert.equal(history.length, 1);
    assert.equal(history[0].booking_count, 12);
    assert.equal(history[0].snapshot_date, '2026-07-10');

    const emptyCandidate = snapshot({
      captured_at: '2026-07-11T08:00:00.000Z',
      booking_count: 0,
      occupied_nights: 0,
      guest_count: 0,
      payload: {
        snapshot_date: '2026-07-11',
        property_count: 1,
        feed_error_count: 0,
        sync_status: 'success',
        data_quality: { valid: false, status: 'empty', warnings: ['no_guest_bookings'] }
      }
    });
    const quarantined = await db.createStatsSnapshot(emptyCandidate);
    assert.equal(quarantined.quarantined, true);
    assert.equal((await db.getStatsSnapshots({ seasonYear: 2026, limit: 100 })).length, 1);

    const confirmed = await db.createStatsSnapshot({
      ...emptyCandidate,
      captured_at: '2026-07-11T09:00:00.000Z'
    });
    assert.equal(confirmed.confirmed, true);
    const confirmedHistory = await db.getStatsSnapshots({ seasonYear: 2026, limit: 100 });
    assert.equal(confirmedHistory.length, 2);
    assert.equal(confirmedHistory[1].booking_count, 0);
    assert.equal(confirmedHistory[1].payload.data_quality.status, 'empty_confirmed');
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
