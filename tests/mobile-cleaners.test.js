const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { handleMobileCleaners } = require('../lib/mobile-cleaners');
const { isPublicWidgetApiRequest } = require('../lib/request-access');
const { getMaidCalendar } = require('../lib/cleaners-service');
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });

test('mobile cleaner access is scoped and fails before database access', async () => {
  const token = process.env.WIDGET_TOKEN;
  process.env.WIDGET_TOKEN = 'cleaners-test';
  const db = new Proxy({}, { get() { throw new Error('Unexpected DB access'); } });
  try {
    for (const method of ['GET', 'POST', 'PUT']) {
      assert.equal(isPublicWidgetApiRequest({ pathname: '/api/bookings', widget: 'cleaners', method }), true);
      const res = response();
      await handleMobileCleaners({ method, headers: {}, body: {} }, res, db);
      assert.equal(res.code, 404);
      assert.match(res.headers['Cache-Control'], /no-store/);
    }
    for (const method of ['PATCH', 'DELETE']) {
      assert.equal(isPublicWidgetApiRequest({ pathname: '/api/bookings', widget: 'cleaners', method }), false);
    }
    assert.equal(isPublicWidgetApiRequest({ pathname: '/api/bookings', widget: 'cleaners', method: 'POST', widgetCount: 2 }), false);
    for (const body of [{}, { name: '' }, { name: 'Anna', id: 'anna', slug: 'bad/link', property_ids: [] }]) {
      const res = response();
      await handleMobileCleaners({ method: 'PUT', headers: { 'x-widget-token': 'cleaners-test' }, body }, res, db);
      assert.equal(res.code, 400);
    }
  } finally { if (token === undefined) delete process.env.WIDGET_TOKEN; else process.env.WIDGET_TOKEN = token; }
});

test('native cleaner creation, assignments and link use the website records and roll back together', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-cleaners-'));
  process.env.SQLITE_DB_PATH = path.join(folder, 'test.db');
  const token = process.env.WIDGET_TOKEN;
  process.env.WIDGET_TOKEN = 'cleaners-test';
  const db = require('../backend/src/database');
  const call = async (method, body = {}) => {
    const res = response();
    await handleMobileCleaners({ method, headers: { 'x-widget-token': 'cleaners-test' }, body }, res, db);
    return res;
  };
  try {
    await db.init();
    await db.createProperty('orange', 'Orange Room');
    await db.createProperty('royal', 'Royal');
    const created = await call('POST', { name: 'Anna' });
    assert.equal(created.code, 201);
    assert.equal(created.body.created_id, 'anna');
    const cleaner = created.body.cleaners[0];
    assert.match(cleaner.slug, /^cleaner-[a-f0-9]{16}$/);
    assert.equal(created.body.public_base_url, 'https://b.amalfi.day');
    assert.equal((await call('POST', { name: 'Anna' })).code, 409);
    const saved = await call('PUT', { id: 'anna', name: 'Anna Maria', slug: cleaner.slug, property_ids: ['orange'] });
    assert.equal(saved.code, 200);
    const web = await getMaidCalendar(db, cleaner.slug);
    assert.equal(web.cleaner.name, 'Anna Maria');
    assert.deepEqual(web.properties.map(p => p.id), ['orange']);
    assert.equal(saved.body.properties.length, 2);
    assert.equal(saved.body.properties[0].ical_url, undefined);
    assert.equal((await call('PUT', { id: 'anna', name: 'Changed', slug: cleaner.slug, property_ids: ['unknown'] })).code, 400);
    assert.equal((await db.getCleanerBySlug(cleaner.slug)).name, 'Anna Maria');
    await db.createCleaner('other', 'Other', 'occupied-link');
    assert.equal((await call('PUT', { id: 'anna', name: 'Wrong', slug: 'occupied-link', property_ids: ['royal'] })).code, 409);
    assert.deepEqual((await db.getCleanerProperties('anna')).map(p => p.id), ['orange']);
    await assert.rejects(db.saveMobileCleaner('anna', 'Wrong', cleaner.slug, ['missing']));
    assert.equal((await db.getCleanerBySlug(cleaner.slug)).name, 'Anna Maria');
    assert.deepEqual((await db.getCleanerProperties('anna')).map(p => p.id), ['orange']);
    const cleared = await call('PUT', { id: 'anna', name: 'Anna Maria', slug: 'anna-new', property_ids: [] });
    assert.equal(cleared.code, 200);
    assert.equal((await db.getCleanerProperties('anna')).length, 0);
    assert.equal(await db.getCleanerBySlug(cleaner.slug), undefined);
  } finally {
    await db.close();
    fs.rmSync(folder, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    if (token === undefined) delete process.env.WIDGET_TOKEN; else process.env.WIDGET_TOKEN = token;
  }
});
