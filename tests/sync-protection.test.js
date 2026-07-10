const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.ICAL_URLS = '[]';
const { fetchCalendar } = require('../backend/src/sync-calendars');

test('calendar fetch retries transient failures without exposing the full URL', async () => {
  let calls = 0;
  const body = await fetchCalendar('https://calendar.example/private-token/calendar.ics', {
    retries: 1,
    timeoutMs: 100,
    sleep: async () => {},
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, text: async () => '' };
      return { ok: true, status: 200, text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR' };
    }
  });

  assert.equal(calls, 2);
  assert.match(body, /VCALENDAR/);
});

test('calendar fetch aborts a stalled source', async () => {
  await assert.rejects(
    () => fetchCalendar('https://calendar.example/stalled.ics', {
      retries: 0,
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      })
    }),
    /timed out/
  );
});

test('missing bookings are quarantined before becoming inactive', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-quarantine-'));
  process.env.SQLITE_DB_PATH = path.join(tempDir, 'bookings.db');
  process.env.BOOKING_STALE_GRACE_HOURS = '6';
  delete require.cache[require.resolve('../backend/src/database')];
  const db = require('../backend/src/database');

  try {
    await db.init();
    await db.createProperty('orange', 'Orange');
    await db.upsertBooking('orange', 'airbnb', '2026-08-10', '2026-08-12', 'Guest', {
      bookingType: 'reservation'
    });

    const feedKeys = [{ startDate: '2026-08-20', endDate: '2026-08-22' }];
    const first = await db.archiveStaleBookings('orange', 'airbnb', feedKeys, '2026-07-01');
    const quarantined = await db.get(
      `SELECT active, missing_since FROM bookings WHERE property_id = 'orange' AND start_date = '2026-08-10'`
    );
    assert.equal(first.changes, 0);
    assert.equal(Number(quarantined.active), 1);
    assert.ok(quarantined.missing_since);

    await db.run(
      `UPDATE bookings SET missing_since = datetime('now', '-7 hours')
       WHERE property_id = 'orange' AND start_date = '2026-08-10'`
    );
    const second = await db.archiveStaleBookings('orange', 'airbnb', feedKeys, '2026-07-01');
    const archived = await db.get(
      `SELECT active FROM bookings WHERE property_id = 'orange' AND start_date = '2026-08-10'`
    );
    assert.equal(second.changes, 1);
    assert.equal(Number(archived.active), 0);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.BOOKING_STALE_GRACE_HOURS;
  }
});
