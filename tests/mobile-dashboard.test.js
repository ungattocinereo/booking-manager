const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMobileDashboard, handleMobileDashboard, hasMobileAccess } = require('../lib/mobile-dashboard');

test('mobile access requires the header and fails closed without a configured token', () => {
  assert.equal(hasMobileAccess({ headers: { 'x-widget-token': 'secret' } }, 'secret'), true);
  assert.equal(hasMobileAccess({ headers: { 'x-widget-token': 'wrong' } }, 'secret'), false);
  assert.equal(hasMobileAccess({ headers: {} }, ''), false);
  assert.equal(hasMobileAccess({ headers: {}, query: { token: 'secret' } }, 'secret'), false);
});

test('mobile payload preserves unnamed arrivals, removes closures and exports only app fields', async () => {
  let requestedFrom;
  const result = await buildMobileDashboard({
    getProperties: async () => [{ id: 'orange', name: 'Orange', ical_url: 'private-feed' }],
    getBookings: async (_, from) => {
      requestedFrom = from;
      return [
        { id: 1, property_id: 'orange', start_date: '2026-10-25', end_date: '2026-10-28', platform: 'airbnb', guest_name: '', raw_description: 'private', reservation_url: 'javascript:alert(1)' },
        { id: 2, property_id: 'orange', start_date: '2026-11-01', end_date: '2026-11-03', platform: 'airbnb', booking_type: 'blocked' },
        { id: 3, property_id: 'orange', start_date: '2026-11-04', end_date: '2026-11-06', platform: 'airbnb', active: false },
      ];
    },
    getCleaningTasks: async () => [{ id: 8, property_id: 'orange', scheduled_date: '2026-10-28', notes: 'private' }],
  }, undefined, '2026-10-23');
  assert.equal(requestedFrom, '2026-07-25');
  assert.deepEqual(result.bookings.map(b => b.id), ['1']);
  assert.equal(result.bookings[0].guest_name, null);
  assert.equal(result.bookings[0].reservation_url, null);
  assert.equal(result.bookings[0].raw_description, undefined);
  assert.equal(result.properties[0].ical_url, undefined);
  assert.equal(result.cleaning_tasks[0].notes, undefined);
});

test('unauthenticated and non-GET mobile requests cannot initialize or read the database', async () => {
  const db = new Proxy({}, { get() { throw new Error('Database must not be accessed'); } });
  for (const method of ['GET', 'POST', 'DELETE']) {
    const headers = {};
    const res = { setHeader(k, v) { headers[k] = v; }, status(code) { this.code = code; return this; }, json(value) { return value; } };
    await handleMobileDashboard({ method, headers: {}, query: {} }, res, db);
    assert.equal(res.code, method === 'GET' ? 404 : 405);
    assert.match(headers['Cache-Control'], /no-store/);
  }
});
