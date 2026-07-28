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

function dateFromToday(offsetDays, hour = 12) {
  const date = new Date(today);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  return date;
}

const cleaningTasks = [
  {
    id: 1,
    property_id: 'orange',
    booking_id: 1,
    scheduled_date: toIso(dateFromToday(1)),
    status: 'pending',
    cleaner_id: null,
    active: true
  },
  {
    id: 2,
    property_id: 'central',
    booking_id: 2,
    scheduled_date: toIso(dateFromToday(3)),
    status: 'pending',
    cleaner_id: 'cleaner-1',
    active: true
  },
  {
    id: 3,
    property_id: 'solo',
    booking_id: 3,
    scheduled_date: toIso(dateFromToday(15)),
    status: 'pending',
    cleaner_id: null,
    active: true
  },
  {
    id: 4,
    property_id: 'youth',
    booking_id: 4,
    scheduled_date: toIso(dateFromToday(2)),
    status: 'completed',
    cleaner_id: 'cleaner-1',
    active: true
  }
];

function statsMonthMap(value) {
  const months = {};
  for (let monthIndex = 3; monthIndex <= 10; monthIndex++) {
    months[`${today.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}`] = value + monthIndex;
  }
  return months;
}

function createStatsSnapshot(offsetDays, bookingCount, occupiedNights, guestCount, bookingKeys) {
  const capturedAt = dateFromToday(offsetDays);
  const snapshotDate = toIso(capturedAt);
  return {
    id: `snapshot-${snapshotDate}`,
    snapshot_date: snapshotDate,
    snapshot_key: `${today.getFullYear()}:${snapshotDate}`,
    captured_at: capturedAt.toISOString(),
    source: 'cron',
    season_year: today.getFullYear(),
    booking_count: bookingCount,
    occupied_nights: occupiedNights,
    guest_count: guestCount,
    occupancy_percent: Number(((occupiedNights / 2500) * 100).toFixed(1)),
    avg_stay: 3.4,
    monthly_nights: statsMonthMap(30),
    monthly_bookings: statsMonthMap(3),
    platform_counts: { booking: Math.round(bookingCount * 0.6), airbnb: Math.round(bookingCount * 0.4) },
    country_counts: { it: 18, us: 9, de: 7 },
    payload: {
      monthly_guests: statsMonthMap(7),
      booking_keys: bookingKeys,
      sellable_nights: 2500,
      unavailable_nights: 184,
      data_quality: { valid: true, source: 'ui_test' }
    }
  };
}

const statsSnapshots = [
  createStatsSnapshot(-2, 128, 835, 261, ['b1_alpha', 'b1_beta']),
  createStatsSnapshot(-1, 131, 847, 267, ['b1_alpha', 'b1_beta', 'b1_gamma'])
];

const dashboardPayload = JSON.stringify({
  meta: {
    complete: true,
    generated_at: new Date().toISOString(),
    dataset_version: 'ui-test',
    stats_included: false,
    range: { from: toIso(today), to: null },
    sync_health: {
      status: 'ok',
      run_status: 'success',
      stale: false,
      last_data_at: new Date().toISOString(),
      feed_error_count: 0,
      feed_errors: []
    }
  },
  properties,
  bookings,
  availability_markers: [{
    property_id: 'orange',
    start_date: toIso(dateFromToday(5)),
    end_date: toIso(dateFromToday(8))
  }],
  cleaning_tasks: cleaningTasks,
  cleaners: [{ id: 'cleaner-1', name: 'Test Cleaner', slug: 'test-cleaner', properties: [] }],
  stats_snapshots: []
});

const dashboardPayloadObject = JSON.parse(dashboardPayload);
const emptyDashboardPayload = JSON.stringify({
  ...dashboardPayloadObject,
  meta: {
    ...dashboardPayloadObject.meta,
    dataset_version: 'empty-confirmation-test',
    sync_health: {
      status: 'ok',
      run_status: 'success',
      stale: false,
      last_data_at: new Date().toISOString(),
      feed_error_count: 0,
      feed_errors: []
    }
  },
  bookings: [],
  availability_markers: []
});

function createServer(state = {
  statsMode: 'ok',
  statsRequests: 0,
  statsPaths: [],
  legacyStatsRequests: 0,
  dashboardMode: 'normal',
  dashboardRequests: 0,
  syncRequests: 0
}) {
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
    if (url.pathname === '/api/dashboard' && url.searchParams.get('stats_only') === '1') {
      state.statsRequests++;
      state.statsPaths = state.statsPaths || [];
      state.statsPaths.push(`${url.pathname}?stats_only=1`);
      if (state.statsMode === 'auth') {
        response.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><html><head><title>Error · Cloudflare Access</title></head><body><h1>Forbidden</h1><p>You do not have permission to view this page.</p></body></html>');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(statsSnapshots));
      return;
    }
    if (url.pathname === '/api/dashboard') {
      state.dashboardRequests++;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(state.dashboardMode === 'empty' ? emptyDashboardPayload : dashboardPayload);
      return;
    }
    if (url.pathname === '/api/reporting') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({
        external_send_enabled: false,
        units: [
          { id: 'dragone', name: 'Dragone', property_ids: ['awesome', 'central', 'orange', 'vingtage', 'youth', 'solo'], configured: { mapping: true, alloggiati: false, istat: false }, batch_count: 0, open_batches: 0 },
          { id: 'carina', name: 'Carina', property_ids: ['carina'], configured: { mapping: true, alloggiati: false, istat: false }, batch_count: 0, open_batches: 0 }
        ]
      }));
      return;
    }
    if (url.pathname === '/api/reporting/imports') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end('[]');
      return;
    }
    if (url.pathname === '/api/reporting/istat' && url.searchParams.get('action') === 'codes') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ province: [{ codiceIstat: '063', descrizione: 'Napoli' }], nazioni: [{ codiceIstat: '536', descrizione: 'Regno Unito' }] }));
      return;
    }
    if (url.pathname === '/api/sync' && request.method === 'POST') {
      state.syncRequests++;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ success: true, partial: false }));
      return;
    }
    if (url.pathname === '/api/bookings' && url.searchParams.get('stats_snapshots') === '1') {
      state.legacyStatsRequests = (state.legacyStatsRequests || 0) + 1;
      response.writeHead(410, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Legacy statistics route must not be used by the browser' }));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[]');
      return;
    }

    const relativePath = url.pathname === '/' || url.pathname === '/reporting'
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
    chartLoaded: Boolean(document.querySelector('script[data-chart-js]')),
    freshnessState: document.getElementById('freshnessStatus')?.dataset.state,
    freshnessTitle: document.getElementById('freshnessTitle')?.textContent
  }));

  assert.equal(metrics.cells, 0);
  assert.equal(metrics.navButtons, 5);
  assert.equal(metrics.chartLoaded, false);
  assert.equal(metrics.freshnessState, 'ok');
  assert.match(metrics.freshnessTitle, /актуальны/i);

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

async function inspectReportingPage(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route(/^https:/, route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}reporting`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#reportingUnits .reporting-unit').length === 2);
  assert.equal(await page.locator('#reportingTab').isVisible(), true);
  assert.match(await page.locator('#reportingUnits').innerText(), /Dragone/);
  assert.equal(await page.locator('#reportingUnits .reporting-unit-icon').count(), 2);
  assert.equal(await page.locator('#reportingCurrentUnitName').innerText(), 'Dragone');
  assert.match(await page.locator('#reportingAlert').innerText(), /отправки пока отключены/i);
  assert.match(await page.locator('#reportingDropzone').innerText(), /Выбрать TXT для Dragone/i);
  assert.match(await page.locator('#reportingHistoryTitle').innerText(), /Dragone/);
  assert.equal(await page.locator('.reporting-flow-step').count(), 3);
  assert.equal(await page.locator('#reportingBatchList').innerText(), '');
  assert.equal(await page.locator('#reportingHistoryFold').getAttribute('open'), null);
  assert.equal(await page.locator('#reportingIstatFold').getAttribute('open'), null);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await page.getByRole('button', { name: /Carina/ }).click();
  await page.waitForFunction(() => document.getElementById('reportingCurrentUnitName')?.textContent === 'Carina');
  assert.match(await page.locator('#reportingDropzone').innerText(), /Выбрать TXT для Carina/i);
  assert.match(await page.locator('#reportingHistoryTitle').innerText(), /Carina/);
  assert.deepEqual(errors, []);
  await context.close();
  return { units: 2, externalSendDisabled: true };
}

async function installStatsBrowserMocks(context, cachedHistory = null) {
  await context.addInitScript(({ cacheKey, cacheValue }) => {
    const chartState = { created: 0, destroyed: 0, active: 0 };
    globalThis.__statsChartMock = chartState;
    globalThis.Chart = class MockChart {
      constructor(_canvas, config = {}) {
        this.data = config.data || { labels: [], datasets: [] };
        this.options = config.options || {};
        this.destroyed = false;
        chartState.created++;
        chartState.active++;
      }

      update() {}

      destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        chartState.destroyed++;
        chartState.active--;
      }
    };
    globalThis.lucide = { createIcons() {} };
    if (cacheKey && cacheValue) localStorage.setItem(cacheKey, cacheValue);
  }, cachedHistory ? {
    cacheKey: `atrani-stats-history-v2:${today.getFullYear()}`,
    cacheValue: JSON.stringify({
      seasonYear: today.getFullYear(),
      savedAt: Date.now() - 5 * 60 * 1000,
      rows: statsSnapshots
    })
  } : { cacheKey: null, cacheValue: null });

  await context.route(/^https:/, async route => {
    const url = route.request().url();
    if (url.includes('lucide')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'globalThis.lucide = globalThis.lucide || { createIcons() {} };'
      });
      return;
    }
    if (url.includes('fonts.googleapis.com')) {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }
    await route.abort();
  });
}

async function installUnavailableChartBrowserMocks(context) {
  await context.addInitScript(() => {
    globalThis.lucide = { createIcons() {} };
  });
  await context.route(/^https:/, async route => {
    const url = route.request().url();
    if (url.includes('lucide')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'globalThis.lucide = globalThis.lucide || { createIcons() {} };'
      });
      return;
    }
    if (url.includes('fonts.googleapis.com')) {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }
    await route.abort();
  });
}

function collectPageErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource|ERR_FAILED/i.test(text)) return;
    consoleErrors.push(text);
  });
  return { pageErrors, consoleErrors };
}

async function waitForStatsReady(page, expectedState) {
  await page.waitForFunction(state => {
    const tab = document.getElementById('statsTab');
    const history = document.getElementById('statsHistoryStatus');
    const radarMetrics = document.querySelectorAll('#statsRadarGrid .stats-radar-metric');
    return tab && history &&
      tab.style.display !== 'none' &&
      !tab.hasAttribute('aria-busy') &&
      history.dataset.state === state &&
      radarMetrics.length === 6;
  }, expectedState);
}

async function readRadar(page) {
  return page.locator('#statsRadarGrid .stats-radar-metric').evaluateAll(cards =>
    Object.fromEntries(cards.map(card => [
      card.querySelector('.stats-radar-label')?.textContent.trim(),
      card.querySelector('.stats-radar-value')?.textContent.trim()
    ]))
  );
}

async function readHorizontalOverflow(page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth
  }));
}

async function inspectStatsPage(browser, baseUrl, viewport, isMobile) {
  const context = await browser.newContext({ viewport, isMobile });
  await installStatsBrowserMocks(context);
  const page = await context.newPage();
  const errors = collectPageErrors(page);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('freshnessStatus')?.dataset.state === 'ok');
  await page.getByRole('button', { name: /Статистика/ }).click();
  await waitForStatsReady(page, 'ok');

  const historyTitle = await page.locator('#statsHistoryTitle').innerText();
  const historyDetail = await page.locator('#statsHistoryDetail').innerText();
  assert.match(historyTitle, /история статистики актуальна/i);
  assert.match(historyDetail, /ежедневн/i);

  const radar7 = await readRadar(page);
  for (const label of ['Заезды', 'Выезды', 'Уборки', 'Без уборщицы', 'Забронировано']) {
    assert.ok(Object.hasOwn(radar7, label), `missing 7-day radar metric: ${label}`);
  }
  assert.ok(Object.keys(radar7).some(label => label.startsWith('Налог')), 'missing 7-day tax radar metric');
  assert.equal(Object.keys(radar7).length, 6);
  assert.equal(radar7['Уборки'], '2');
  assert.equal(radar7['Без уборщицы'], '1');
  assert.match(radar7['Забронировано'], /^\d+(?:[.,]\d+)?%$/);
  assert.match(await page.locator('#statsRadarGaps').innerText(), /технического закрытия/i);

  await page.locator('#statsRadar30').click();
  await page.waitForFunction(() => document.getElementById('statsRadar30')?.getAttribute('aria-pressed') === 'true');
  const radar30 = await readRadar(page);
  assert.equal(radar30['Уборки'], '3');
  assert.equal(radar30['Без уборщицы'], '2');
  assert.notEqual(radar30['Заезды'], radar7['Заезды']);
  assert.match(await page.locator('#statsRadarRange').innerText(), /30 дней/);

  for (let iteration = 0; iteration < 3; iteration++) {
    await page.getByRole('button', { name: /Календарь/ }).click();
    await page.getByRole('button', { name: /Статистика/ }).click();
    await waitForStatsReady(page, 'ok');
  }

  const overflow = await readHorizontalOverflow(page);
  assert.ok(overflow.document <= 1, `${isMobile ? 'mobile' : 'desktop'} document overflows horizontally by ${overflow.document}px`);
  assert.ok(overflow.body <= 1, `${isMobile ? 'mobile' : 'desktop'} body overflows horizontally by ${overflow.body}px`);
  assert.equal(await page.locator('#statsTab').getAttribute('aria-busy'), null);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.consoleErrors, []);

  const charts = await page.evaluate(() => globalThis.__statsChartMock);
  assert.ok(charts.created > 0, 'statistics did not create any charts');
  assert.ok(charts.destroyed > 0, 'repeated tab switches did not dispose old charts');
  assert.ok(charts.active <= 7, `chart instances accumulated after repeated switches: ${charts.active}`);

  await context.close();
  return { historyTitle, radar7, radar30, overflow, charts };
}

async function inspectCachedStatsAuthFallback(browser, baseUrl, serverState) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await installStatsBrowserMocks(context, statsSnapshots);
  const page = await context.newPage();
  const errors = collectPageErrors(page);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('freshnessStatus')?.dataset.state === 'ok');
  await page.getByRole('button', { name: /Статистика/ }).click();
  await waitForStatsReady(page, 'cached');

  assert.match(await page.locator('#statsHistoryTitle').innerText(), /показана сохранённая история/i);
  assert.match(await page.locator('#statsHistoryDetail').innerText(), /доступ к истории статистики отклонён/i);
  assert.equal(await page.locator('#statsHistoryActions').getByRole('button', { name: /Обновить сессию/ }).count(), 0);
  const retry = page.locator('#statsHistoryActions').getByRole('button', { name: /Повторить/ });
  await retry.waitFor();
  serverState.statsMode = 'ok';
  await retry.click();
  await waitForStatsReady(page, 'ok');
  assert.match(await page.locator('#statsHistoryTitle').innerText(), /история статистики актуальна/i);

  const cachedBookings = await page.locator('#statsDynamicBookings').innerText();
  assert.notEqual(cachedBookings, '0');
  const priorityOrder = await page.evaluate(() => {
    const now = Date.now();
    const shared = {
      season_year: new Date(now).getFullYear(),
      booking_count: 10,
      occupied_nights: 30,
      guest_count: 20,
      payload: { data_quality: { valid: true }, sync_status: 'success' }
    };
    const olderDashboard = { ...shared, source: 'cached_current', captured_at: new Date(now - 2 * 3600000).toISOString() };
    const newerHistory = {
      ...shared,
      source: 'cron',
      snapshot_date: new Date(now - 3600000).toISOString().slice(0, 10),
      captured_at: new Date(now - 3600000).toISOString()
    };
    return {
      older: statsSnapshotPreference(olderDashboard),
      newer: statsSnapshotPreference(newerHistory)
    };
  });
  assert.ok(priorityOrder.newer > priorityOrder.older, 'newer persisted history lost to an older dashboard cache');
  assert.equal(await page.locator('#statsTab').getAttribute('aria-busy'), null);
  const overflow = await readHorizontalOverflow(page);
  assert.ok(overflow.document <= 1, `cached stats document overflows horizontally by ${overflow.document}px`);
  assert.ok(overflow.body <= 1, `cached stats body overflows horizontally by ${overflow.body}px`);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.consoleErrors, []);

  const charts = await page.evaluate(() => globalThis.__statsChartMock);
  assert.ok(charts.active <= 7, `cached fallback accumulated chart instances: ${charts.active}`);
  await context.close();
  return { state: 'recovered', cachedBookings, overflow, charts };
}

async function inspectStatsWithoutChart(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await installUnavailableChartBrowserMocks(context);
  const page = await context.newPage();
  const errors = collectPageErrors(page);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('freshnessStatus')?.dataset.state === 'ok');
  await page.getByRole('button', { name: /Статистика/ }).click();
  await waitForStatsReady(page, 'ok');

  assert.equal(await page.evaluate(() => typeof globalThis.Chart), 'undefined');
  assert.equal(await page.locator('#statsTab').getAttribute('aria-busy'), null);
  assert.equal(await page.locator('#statsHistoryStatus').getAttribute('data-state'), 'ok');
  assert.equal(await page.locator('#statsRadarGrid .stats-radar-metric').count(), 6);
  assert.equal(await page.locator('#statsSummary .stats-summary-card').count(), 4);
  assert.equal(await page.locator('#statsChartsStatus').isVisible(), true);
  assert.match(await page.locator('#statsChartsStatus').innerText(), /модуль графиков не загрузился/i);
  assert.equal(await page.locator('#statsGrid').getAttribute('hidden'), '');
  assert.equal(await page.locator('#statsGrid').isVisible(), false);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.consoleErrors, []);

  const overflow = await readHorizontalOverflow(page);
  assert.ok(overflow.document <= 1, `chart fallback document overflows horizontally by ${overflow.document}px`);
  assert.ok(overflow.body <= 1, `chart fallback body overflows horizontally by ${overflow.body}px`);
  await context.close();
  return { history: 'ok', radarMetrics: 6, summaryCards: 4, chartsStatusVisible: true, chartsGridHidden: true, overflow };
}

async function inspectConfirmedEmptyDashboard(browser, baseUrl, serverState) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await installStatsBrowserMocks(context);
  const page = await context.newPage();
  const errors = collectPageErrors(page);

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Number(document.getElementById('statBookings')?.textContent) > 0);
  await page.waitForFunction(() => dashboardLoadInFlight === false);
  const initialBookings = await page.locator('#statBookings').innerText();
  const requestsBefore = serverState.dashboardRequests;

  serverState.dashboardMode = 'empty';
  await page.evaluate(() => loadData({ silent: true }));
  await page.waitForFunction(() => document.getElementById('statBookings')?.textContent === '0');

  const result = {
    initialBookings,
    confirmedBookings: await page.locator('#statBookings').innerText(),
    confirmationRequests: serverState.dashboardRequests - requestsBefore
  };
  assert.equal(result.confirmedBookings, '0');
  assert.ok(result.confirmationRequests >= 2, 'empty dashboard was accepted without a confirming request');
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.consoleErrors, []);
  serverState.dashboardMode = 'normal';
  await context.close();
  return result;
}

async function main() {
  const serverState = {
    statsMode: 'ok',
    statsRequests: 0,
    statsPaths: [],
    legacyStatsRequests: 0,
    dashboardMode: 'normal',
    dashboardRequests: 0,
    syncRequests: 0
  };
  const server = createServer(serverState);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true });

  try {
    const desktop = await inspectPage(browser, baseUrl, { width: 1440, height: 1000 }, false);
    const mobile = await inspectPage(browser, baseUrl, { width: 390, height: 844 }, true);
    const statsDesktop = await inspectStatsPage(browser, baseUrl, { width: 1440, height: 1000 }, false);
    const statsMobile = await inspectStatsPage(browser, baseUrl, { width: 390, height: 844 }, true);
    const statsWithoutChart = await inspectStatsWithoutChart(browser, baseUrl);
    const reporting = await inspectReportingPage(browser, baseUrl);
    assert.ok(serverState.syncRequests > 0, 'admin UI did not start automatic calendar sync');
    assert.ok(serverState.statsRequests >= 3, `statistics history endpoint was requested only ${serverState.statsRequests} time(s)`);
    assert.deepEqual([...new Set(serverState.statsPaths)], ['/api/dashboard?stats_only=1']);
    assert.equal(serverState.legacyStatsRequests, 0, 'browser still requested the service-token /api/bookings statistics route');

    const requestsBeforeAuthFallback = serverState.statsRequests;
    serverState.statsMode = 'auth';
    const cachedAuthFallback = await inspectCachedStatsAuthFallback(browser, baseUrl, serverState);
    assert.ok(
      serverState.statsRequests >= requestsBeforeAuthFallback + 2,
      'cached auth fallback did not retry the protected statistics endpoint'
    );
    const confirmedEmptyDashboard = await inspectConfirmedEmptyDashboard(browser, baseUrl, serverState);

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

    console.log(JSON.stringify({
      desktop,
      mobile,
      statsDesktop,
      statsMobile,
      statsWithoutChart,
      reporting,
      cachedAuthFallback,
      confirmedEmptyDashboard,
      statsEndpoint: [...new Set(serverState.statsPaths)],
      legacyStatsRequests: serverState.legacyStatsRequests,
      statsRequests: serverState.statsRequests,
      dashboardRequests: serverState.dashboardRequests,
      syncRequests: serverState.syncRequests,
      maidYearBoundary: true
    }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
