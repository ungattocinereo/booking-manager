const test = require('node:test');
const assert = require('node:assert/strict');
const { default: middleware } = require('../middleware.ts');
const { handleMobileTax } = require('../lib/mobile-dashboard');

test('production middleware reaches mobile tax auth without opening other write routes', async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    const url = 'https://booking-manager-mu.vercel.app/api/bookings';
    assert.equal(middleware(new Request(`${url}?widget=upcoming`)), undefined);
    assert.equal(middleware(new Request(`${url}?widget=tax`, { method: 'PATCH' })), undefined);
    for (const [query, method] of [['tax', 'GET'], ['tax', 'POST'], ['tax', 'DELETE'], ['upcoming', 'PATCH'], ['', 'PATCH']]) {
      assert.equal(middleware(new Request(`${url}?widget=${query}`, { method })).status, 404);
    }
    const db = new Proxy({}, { get() { throw new Error('Must authenticate before DB access'); } });
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { return body; } };
    await handleMobileTax({ method: 'PATCH', headers: {}, body: { booking_id: 42, tax_paid: true, expected_paid: false } }, res, db);
    assert.equal(res.code, 404);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
