const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { handleMobileTax, buildMobileDashboard } = require('../lib/mobile-dashboard');

const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return body; } });
const booking = { id: 42, property_id: 'orange', start_date: '2026-11-21', end_date: '2026-11-25', platform: 'airbnb', tax_paid: false, active: true };

test('mobile tax fails closed before DB access and validates mutation input', async () => {
  const original = process.env.WIDGET_TOKEN;
  process.env.WIDGET_TOKEN = 'test-mobile-token';
  const db = new Proxy({}, { get() { throw new Error('Unexpected database access'); } });
  try {
    for (const [method, token, body, status] of [
      ['PATCH', '', {}, 404], ['GET', 'test-mobile-token', {}, 405],
      ['PATCH', 'test-mobile-token', { booking_id: -1, tax_paid: true, expected_paid: false }, 400],
      ['PATCH', 'test-mobile-token', { booking_id: 42, tax_paid: 'true', expected_paid: false }, 400],
      ['PATCH', 'test-mobile-token', { booking_id: 42, tax_paid: true }, 400],
    ]) {
      const res = response();
      await handleMobileTax({ method, headers: { 'x-widget-token': token }, body }, res, db);
      assert.equal(res.code, status);
      assert.match(res.headers['Cache-Control'], /no-store/);
    }
  } finally { if (original === undefined) delete process.env.WIDGET_TOKEN; else process.env.WIDGET_TOKEN = original; }
});

test('mobile tax persists in the same SQLite fields used by the web and detects conflicts', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-mobile-tax-'));
  process.env.SQLITE_DB_PATH = path.join(directory, 'test.db');
  const token = process.env.WIDGET_TOKEN;
  process.env.WIDGET_TOKEN = 'test-mobile-token';
  const db = require('../backend/src/database');
  const update = async (paid, expected, id = 42) => {
    const res = response();
    await handleMobileTax({ method: 'PATCH', headers: { 'x-widget-token': 'test-mobile-token' }, body: { booking_id: id, tax_paid: paid, expected_paid: expected } }, res, db);
    return res;
  };
  try {
    await db.init();
    await db.createProperty('orange', 'Orange Room');
    await db.run("INSERT INTO bookings (id, property_id, start_date, end_date, platform, guest_count) VALUES (42, 'orange', '2026-11-21', '2026-11-25', 'airbnb', 2)");
    const marked = await update(true, false);
    assert.equal(marked.code, 200);
    assert.equal(marked.body.tax_paid, true);
    let stored = (await db.getBookings())[0];
    assert.equal(stored.tax_paid, 1);
    assert.ok(stored.tax_paid_at);
    const duplicate = await update(true, false);
    assert.equal(duplicate.body.tax_paid_at, marked.body.tax_paid_at);
    const conflict = await update(false, false);
    assert.equal(conflict.code, 409);
    const dashboard = await buildMobileDashboard(db, undefined, '2026-11-22');
    assert.equal(dashboard.bookings[0].tax_paid, true);
    assert.equal(dashboard.bookings[0].tax_applicable, true);
    assert.equal((await update(false, true)).code, 200);
    stored = (await db.getBookings())[0];
    assert.equal(stored.tax_paid, 0);
    assert.equal(stored.tax_paid_at, null);
    await db.run('UPDATE bookings SET active = 0 WHERE id = 42');
    assert.equal((await update(true, false)).code, 404);
    assert.equal((await update(true, false, 999)).code, 404);
  } finally {
    await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    if (token === undefined) delete process.env.WIDGET_TOKEN; else process.env.WIDGET_TOKEN = token;
  }
});

test('technical occupancy cannot receive a mobile tax mark', async () => {
  const old = process.env.WIDGET_TOKEN;
  process.env.WIDGET_TOKEN = 'test-mobile-token';
  try {
    const res = response();
    await handleMobileTax({ method: 'PATCH', headers: { 'x-widget-token': 'test-mobile-token' }, body: { booking_id: 42, tax_paid: true, expected_paid: false } }, res, {
      db: true, getBookings: async () => [{ ...booking, platform: 'booking', booking_type: 'blocked', raw_summary: 'CLOSED - Not available' }],
      updateMobileTaxPaid() { throw new Error('Must not mutate a calendar closure'); },
    });
    assert.ok([404, 422].includes(res.code));
  } finally { if (old === undefined) delete process.env.WIDGET_TOKEN; else process.env.WIDGET_TOKEN = old; }
});

test('quiet seasons include seven previous arrivals beyond the normal 90-day window', async () => {
  const past = Array.from({ length: 10 }, (_, i) => ({ ...booking, id: i + 1, start_date: `2025-01-${String(i + 1).padStart(2, '0')}`, end_date: `2025-01-${String(i + 2).padStart(2, '0')}` }));
  const data = await buildMobileDashboard({ getProperties: async () => [], getBookings: async (_, from) => from ? [booking] : [...past, booking], getCleaningTasks: async () => [] }, undefined, '2026-11-20');
  assert.deepEqual(data.bookings.map(b => b.id), ['42', '10', '9', '8', '7', '6', '5', '4']);
});
