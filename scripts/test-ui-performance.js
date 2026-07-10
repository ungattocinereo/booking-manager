const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const publicRoot = path.join(__dirname, '..', 'frontend', 'public');
const propertyIds = ['awesome', 'central', 'orange', 'vingtage', 'youth', 'solo', 'carina', 'royal', 'harmony', 'susy', 'carmela'];
const properties = propertyIds.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
const today = new Date();
today.setHours(0, 0, 0, 0);

function toIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const bookings = [];
let bookingId = 1;
for (let propertyIndex = 0; propertyIndex < propertyIds.length; propertyIndex++) {
  for (let bookingIndex = -4; bookingIndex < 10; bookingIndex++) {
    const start = new Date(today);
    start.setDate(start.getDate() + bookingIndex * 4 + (propertyIndex % 2));
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    bookings.push({
      id: bookingId++,
      property_id: propertyIds[propertyIndex],
      platform: bookingIndex % 3 === 0 ? 'airbnb' : 'booking',
      start_date: toIso(start),
      end_date: toIso(end),
      raw_summary: 'Reservation',
      guest_name: `Test guest ${propertyIndex}-${bookingIndex}`,
      guest_country: 'it',
      guest_count: 2,
      booking_type: 'reservation',
      tax_paid: false
    });
  }
}

const dashboardPayload = JSON.stringify({
  meta: {
    complete: true,
    generated_at: new Date().toISOString(),
    dataset_version: 'ui-test',
    stats_included: false,
    range: { from: toIso(today), to: null }
  },
  properties,
  bookings,
  cleaning_tasks: [],
  cleaners: [],
  stats_snapshots: []
});

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/maid/test-cleaner') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        cleaner: { id: 'test', name: 'Test Cleaner', slug: 'test-cleaner' },
        properties: [{ id: 'orange', name: 'Orange' }],
        bookings: [{
          id: 1,
          property_id: 'orange',
          platform: 'booking',
          start_date: '2026-12-31',
          end_date: '2027-01-01',
          guest_name: 'New Year Guest',
          guest_count: 2,
          guest_country: 'it',
          booking_type: 'reservation'
        }]
      }));
      return;
    }
    if (url.pathname === '/api/dashboard') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(dashboardPayload);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[]');
      return;
    }

    const relativePath = url.pathname === '/'
      ? 'index.html'
      : url.pathname === '/maid/test-cleaner'
        ? 'maid.html'
        : url.pathname.slice(1);
    const filePath = path.join(publicRoot, relativePath);
    if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const contentTypes = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
    response.writeHead(200, { 'content-type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function inspectPage(browser, baseUrl, viewport, isMobile) {
  const context = await browser.newContext({ viewport, isMobile });
  await context.route(/^https:/, route => route.abort());
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.agenda-item,.booking-bar').length > 0);

  const metrics = await page.evaluate(() => ({
    nodes: document.getElementsByTagName('*').length,
    cells: document.querySelectorAll('.cal-cell').length,
    dayColumns: document.querySelectorAll('.cal-day-column').length,
    bookingBars: document.querySelectorAll('.booking-bar').length,
    navButtons: document.querySelectorAll('nav .nav-item[type="button"]').length,
    chartLoaded: Boolean(document.querySelector('script[data-chart-js]'))
  }));

  assert.equal(metrics.cells, 0);
  assert.equal(metrics.navButtons, 4);
  assert.equal(metrics.chartLoaded, false);

  if (isMobile) {
    assert.equal(metrics.dayColumns, 0);
    assert.equal(metrics.bookingBars, 0);
    assert.ok(metrics.nodes < 800, `mobile DOM budget exceeded: ${metrics.nodes}`);
    await page.getByRole('button', { name: /Timeline/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.cal-day-column').length > 0);
    await page.getByRole('button', { name: /Список/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.cal-day-column').length === 0);
  } else {
    assert.ok(metrics.dayColumns > 0 && metrics.dayColumns <= 250);
    assert.ok(metrics.nodes < 1800, `desktop DOM budget exceeded: ${metrics.nodes}`);
  }

  await context.close();
  return metrics;
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true });

  try {
    const desktop = await inspectPage(browser, baseUrl, { width: 1440, height: 1000 }, false);
    const mobile = await inspectPage(browser, baseUrl, { width: 390, height: 844 }, true);
    const maidContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await maidContext.route(/^https:/, route => route.abort());
    const maidPage = await maidContext.newPage();
    await maidPage.addInitScript(() => {
      const RealDate = Date;
      const fixedNow = RealDate.parse('2026-12-31T12:00:00Z');
      class FixedDate extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }
        static now() { return fixedNow; }
      }
      globalThis.Date = FixedDate;
    });
    await maidPage.goto(`${baseUrl}maid/test-cleaner`, { waitUntil: 'domcontentloaded' });
    await maidPage.getByRole('button', { name: /Domani/ }).click();
    await maidPage.waitForFunction(() => document.body.innerText.includes('New Year Guest'));
    const maidText = await maidPage.locator('body').innerText();
    assert.match(maidText, /Partenza/i);
    await maidContext.close();

    console.log(JSON.stringify({ desktop, mobile, maidYearBoundary: true }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
