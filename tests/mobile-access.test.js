const test = require('node:test');
const assert = require('node:assert/strict');
const { isPublicWidgetApiRequest } = require('../lib/request-access');
const { handleMobileTax } = require('../lib/mobile-dashboard');

test('mobile middleware exception is scoped and still requires handler authentication', async () => {
  const pathname = '/api/bookings';
  assert.equal(isPublicWidgetApiRequest({ pathname, method: 'GET', widget: 'upcoming' }), true);
  assert.equal(isPublicWidgetApiRequest({ pathname, method: 'PATCH', widget: 'tax' }), true);
  assert.equal(isPublicWidgetApiRequest({ pathname: '/api/tax', method: 'PATCH', widget: 'tax' }), false);
  for (const [widget, method] of [['tax', 'GET'], ['tax', 'POST'], ['tax', 'DELETE'], ['upcoming', 'PATCH'], ['', 'PATCH']]) {
    assert.equal(isPublicWidgetApiRequest({ pathname, method, widget }), false);
  }
  assert.equal(isPublicWidgetApiRequest({ pathname, method: 'PATCH', widget: 'tax', widgetCount: 2 }), false);
  const db = new Proxy({}, { get() { throw new Error('Must authenticate before DB access'); } });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { return body; } };
  await handleMobileTax({ method: 'PATCH', headers: {}, body: { booking_id: 42, tax_paid: true, expected_paid: false } }, res, db);
  assert.equal(res.code, 404);
});
