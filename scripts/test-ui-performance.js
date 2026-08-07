const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const publicRoot = path.join(__dirname, '..', 'frontend', 'public');
const themeStorageKey = 'atrani-theme-preference';
const adminThemeRoutes = [
  { path: '/', tab: 'calendar', sectionId: 'calendarTab', readySelector: '.booking-bar', surfaces: ['body', '.orbit-topbar', '.orbit-hero', '.calendar-toolbar', '.calendar-scroll-wrapper'] },
  { path: '/stats', tab: 'stats', sectionId: 'statsTab', readySelector: '#statsRadarGrid .stats-radar-metric', surfaces: ['body', '.orbit-topbar', '#statsDynamicsCard', '.stats-summary-card', '.stats-chart-card'] },
  { path: '/maid', tab: 'cleaners', sectionId: 'cleanersTab', readySelector: '#cleanersGrid .cleaner-card', surfaces: ['body', '.orbit-topbar', '.add-cleaner-form', '#cleanersGrid .cleaner-card'] },
  { path: '/tax', tab: 'tax', sectionId: 'taxTab', readySelector: '#taxList .tax-date-group', surfaces: ['body', '.orbit-topbar', '.tax-controls', '#taxList .tax-row'] },
  { path: '/reporting', tab: 'reporting', sectionId: 'reportingTab', readySelector: '#reportingUnits .reporting-unit', surfaces: ['body', '.orbit-topbar', '.reporting-alert', '#reportingUnits .reporting-unit', '.reporting-card'] }
];
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

const turnoverStart = new Date(today);
turnoverStart.setDate(turnoverStart.getDate() + 42);
const turnoverDate = new Date(turnoverStart);
turnoverDate.setDate(turnoverDate.getDate() + 3);
const turnoverEnd = new Date(turnoverDate);
turnoverEnd.setDate(turnoverEnd.getDate() + 4);
bookings.push(
  {
    id: bookingId++,
    property_id: 'orange',
    platform: 'airbnb',
    start_date: toIso(turnoverStart),
    end_date: toIso(turnoverDate),
    raw_summary: 'Reservation',
    guest_name: 'Turnover departure',
    booking_type: 'reservation',
    tax_paid: false
  },
  {
    id: bookingId++,
    property_id: 'orange',
    platform: 'booking',
    start_date: toIso(turnoverDate),
    end_date: toIso(turnoverEnd),
    raw_summary: 'Reservation',
    guest_name: 'Turnover arrival',
    booking_type: 'reservation',
    tax_paid: false
  }
);

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
    if (url.pathname === '/api/reporting/istat' && url.searchParams.get('action') === 'status') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ configured: true, latest_date: '2026-06-30' }));
      return;
    }
    if (url.pathname === '/api/reporting/istat') {
      const month = url.searchParams.get('month') || '2026-06';
      const [year, monthNumber] = month.split('-').map(Number);
      const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({
        month,
        ready: true,
        errors: [],
        payload_hash: 'SAFE_HASH',
        giornate: Array.from({ length: days }, (_, index) => ({
          dataRilevazione: `${String(index + 1).padStart(2, '0')}${String(monthNumber).padStart(2, '0')}${year}`,
          camereOccupate: 0,
          strutturaChiusa: false,
          movimentazioni: []
        }))
      }));
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

    const relativePath = adminThemeRoutes.some(route => route.path === url.pathname)
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

  const metrics = await page.evaluate(expectedHandoverDate => {
    const outgoing = document.querySelector(`.booking-bar[data-property-id="orange"][data-end-date="${expectedHandoverDate}"]`);
    const incoming = document.querySelector(`.booking-bar[data-property-id="orange"][data-start-date="${expectedHandoverDate}"]`);
    const marker = document.querySelector(`.calendar-handover-marker[data-property-id="orange"][data-handover-date="${expectedHandoverDate}"]`);
    let handover = null;
    let handoverDivider = null;
    if (outgoing && incoming && marker) {
      const outgoingRect = outgoing.getBoundingClientRect();
      const incomingRect = incoming.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      const markerCenter = markerRect.left + markerRect.width / 2;
      handover = {
        gap: incomingRect.left - outgoingRect.right,
        outgoingToMarker: outgoingRect.right - markerCenter,
        incomingToMarker: incomingRect.left - markerCenter
      };
      const dividerStyle = getComputedStyle(marker, '::before');
      const diamondStyle = getComputedStyle(marker, '::after');
      handoverDivider = {
        markerHeight: markerRect.height,
        bookingHeight: outgoingRect.height,
        dividerHeight: parseFloat(dividerStyle.height),
        dividerBackground: dividerStyle.backgroundColor,
        dividerShadow: dividerStyle.boxShadow,
        diamondWidth: parseFloat(diamondStyle.width),
        diamondBackground: diamondStyle.backgroundColor
      };
    }
    return {
      nodes: document.getElementsByTagName('*').length,
      cells: document.querySelectorAll('.cal-cell').length,
      dayColumns: document.querySelectorAll('.cal-day-column').length,
      bookingBars: document.querySelectorAll('.booking-bar').length,
      handoverMarkers: document.querySelectorAll('.calendar-handover-marker').length,
      handover,
      handoverDivider,
      navButtons: document.querySelectorAll('nav .nav-item[type="button"]').length,
      chartLoaded: Boolean(document.querySelector('script[data-chart-js]')),
      freshnessState: document.getElementById('freshnessStatus')?.dataset.state,
      freshnessTitle: document.getElementById('freshnessTitle')?.textContent,
      heroSummary: (() => {
        const hero = document.querySelector('.orbit-hero');
        const copy = document.querySelector('.orbit-hero-copy');
        const date = document.querySelector('.orbit-date');
        const freshness = document.getElementById('freshnessStatus');
        const center = element => {
          const rect = element?.getBoundingClientRect();
          return rect ? rect.top + rect.height / 2 : null;
        };
        return {
          title: document.getElementById('orbitHeroTitle')?.textContent,
          subtitleDisplay: getComputedStyle(document.getElementById('orbitHeroSubtitle')).display,
          height: hero?.getBoundingClientRect().height || 0,
          centers: [center(copy), center(date), center(freshness)]
        };
      })(),
      timelineContrast: (() => {
        const parseRgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = value => {
          const channels = parseRgb(value).map(channel => {
            const normalized = channel / 255;
            return normalized <= .04045
              ? normalized / 12.92
              : ((normalized + .055) / 1.055) ** 2.4;
          });
          return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
        };
        const inspectBar = selector => {
          const bar = document.querySelector(selector);
          if (!bar) return null;
          const label = bar.querySelector('.bar-label') || bar;
          const background = getComputedStyle(bar).backgroundColor;
          const text = getComputedStyle(label).color;
          const lighter = Math.max(luminance(background), luminance(text));
          const darker = Math.min(luminance(background), luminance(text));
          return { background, text, ratio: (lighter + .05) / (darker + .05) };
        };
        return {
          airbnb: inspectBar('.booking-bar.airbnb:not(.completed):not(.not-available)'),
          booking: inspectBar('.booking-bar.booking:not(.completed):not(.not-available)')
        };
      })(),
      todayTreatment: (() => {
        const column = document.querySelector('.cal-day-column.today');
        const normalColumn = document.querySelector('.cal-day-column:not(.today)');
        const header = document.querySelector('.cal-day-header.today');
        if (!column || !normalColumn || !header) return null;
        const style = getComputedStyle(column);
        const headerStyle = getComputedStyle(header);
        return {
          width: column.getBoundingClientRect().width,
          normalWidth: normalColumn.getBoundingClientRect().width,
          background: style.backgroundColor,
          normalBackground: getComputedStyle(normalColumn).backgroundColor,
          boxShadow: style.boxShadow,
          centerDividerDisplay: getComputedStyle(column, '::after').display,
          headerBoxShadow: headerStyle.boxShadow
        };
      })(),
      monthRail: (() => {
        const header = document.querySelector('.cal-day-header');
        const bands = Array.from(document.querySelectorAll('.cal-month-band')).map(band => {
          const rect = band.getBoundingClientRect();
          return {
            text: band.textContent.trim(),
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            whiteSpace: getComputedStyle(band).whiteSpace
          };
        });
        return {
          bands,
          headerTop: header?.getBoundingClientRect().top ?? null
        };
      })(),
      summaryPresentation: (() => {
        const cards = Array.from(document.querySelectorAll('#statsBar .stat-card'))
          .filter(card => getComputedStyle(card).display !== 'none');
        const divider = cards[1] ? getComputedStyle(cards[1], '::before') : null;
        return {
          cards: cards.map(card => {
            const style = getComputedStyle(card);
            return {
              backgroundColor: style.backgroundColor,
              borderTopWidth: style.borderTopWidth,
              borderRadius: style.borderRadius
            };
          }),
          divider: divider ? {
            width: divider.width,
            backgroundImage: divider.backgroundImage
          } : null
        };
      })(),
      shellLayout: (() => {
        const readRect = selector => {
          const rect = document.querySelector(selector)?.getBoundingClientRect();
          return rect ? { left: rect.left, right: rect.right, width: rect.width } : null;
        };
        const visibleCards = Array.from(document.querySelectorAll('#statsBar .stat-card'))
          .filter(card => getComputedStyle(card).display !== 'none');
        const lastCardRect = visibleCards.at(-1)?.getBoundingClientRect();
        return {
          topbar: readRect('.orbit-topbar'),
          hero: readRect('.orbit-hero'),
          stats: readRect('#statsBar'),
          calendar: readRect('#calendarTab'),
          statsTrailingSpace: lastCardRect
            ? document.getElementById('statsBar').getBoundingClientRect().right - lastCardRect.right
            : null
        };
      })()
    };
  }, toIso(turnoverDate));

  assert.equal(metrics.cells, 0);
  assert.equal(metrics.navButtons, 5);
  assert.equal(metrics.chartLoaded, false);
  assert.equal(metrics.freshnessState, 'ok');
  assert.match(metrics.freshnessTitle, /актуальны/i);
  assert.equal(metrics.heroSummary.title, '6 заездов и ещё 5 выездов');
  assert.equal(metrics.heroSummary.subtitleDisplay, 'none');

  if (isMobile) {
    assert.equal(metrics.dayColumns, 0);
    assert.equal(metrics.bookingBars, 0);
    assert.ok(metrics.nodes < 800, `mobile DOM budget exceeded: ${metrics.nodes}`);
    await page.getByRole('button', { name: /Timeline/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.cal-day-column').length > 0);
    await page.getByRole('button', { name: /Список/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.cal-day-column').length === 0);
  } else {
    assert.ok(metrics.heroSummary.height <= 150, `desktop calendar hero is too tall: ${metrics.heroSummary.height}px`);
    assert.ok(Math.max(...metrics.heroSummary.centers) - Math.min(...metrics.heroSummary.centers) <= 1, 'desktop calendar hero items are not horizontally aligned');
    assert.ok(metrics.dayColumns > 0 && metrics.dayColumns <= 250);
    assert.ok(metrics.nodes < 1800, `desktop DOM budget exceeded: ${metrics.nodes}`);
    assert.ok(metrics.handoverMarkers > 0, 'desktop timeline did not render handover markers');
    assert.ok(metrics.handover, 'test checkout/check-in handover was not found');
    assert.ok(Math.abs(metrics.handover.gap) <= 0.01, `handover bars have a ${metrics.handover.gap}px gap`);
    assert.ok(Math.abs(metrics.handover.outgoingToMarker) <= 0.01, 'checkout does not end at the handover marker');
    assert.ok(Math.abs(metrics.handover.incomingToMarker) <= 0.01, 'check-in does not start at the handover marker');
    assert.ok(metrics.handoverDivider, 'handover divider styling was not rendered');
    assert.ok(metrics.handoverDivider.markerHeight > metrics.handoverDivider.bookingHeight, 'handover divider does not extend beyond the booking bar');
    assert.ok(metrics.handoverDivider.dividerHeight > metrics.handoverDivider.bookingHeight, 'handover divider line is not taller than the booking bar');
    assert.notEqual(metrics.handoverDivider.dividerBackground, 'rgba(0, 0, 0, 0)', 'handover divider line is transparent');
    assert.notEqual(metrics.handoverDivider.dividerShadow, 'none', 'handover divider lacks its light outline');
    assert.equal(metrics.handoverDivider.diamondWidth, 8, 'handover diamond changed size');
    assert.equal(metrics.handoverDivider.diamondBackground, 'rgb(109, 44, 252)', 'handover diamond lost the Orbit accent');
    assert.ok(metrics.todayTreatment, 'today column was not rendered');
    assert.ok(metrics.todayTreatment.width > metrics.todayTreatment.normalWidth, 'today column is no longer intentionally wide');
    assert.notEqual(metrics.todayTreatment.background, metrics.todayTreatment.normalBackground, 'today column has no color distinction');
    assert.equal(metrics.todayTreatment.boxShadow, 'none', 'today column still has a strong edge treatment');
    assert.equal(metrics.todayTreatment.centerDividerDisplay, 'none', 'today column still has a central divider');
    assert.equal(metrics.todayTreatment.headerBoxShadow, 'none', 'today header still has a strong underline or shadow');
    assert.ok(metrics.monthRail.bands.length >= 2, 'calendar month rail did not render visible months');
    assert.ok(metrics.monthRail.bands.some(band => band.text === 'Август 2026'), 'new month is missing from the month rail');
    for (const band of metrics.monthRail.bands) {
      assert.equal(band.whiteSpace, 'nowrap', 'month label can wrap onto two lines');
      assert.ok(band.height <= 27, `month rail is too tall: ${band.height}px`);
      assert.ok(Math.abs(band.bottom - metrics.monthRail.headerTop) <= 0.5, 'month label overlaps calendar day cells');
    }
    assert.equal(metrics.timelineContrast.airbnb?.background, 'rgb(199, 47, 82)', 'Airbnb timeline bar is not using its solid fill');
    assert.equal(metrics.timelineContrast.booking?.background, 'rgb(18, 87, 168)', 'Booking timeline bar is not using its solid fill');
    for (const [platform, contrast] of Object.entries(metrics.timelineContrast)) {
      assert.equal(contrast?.text, 'rgb(255, 255, 255)', `${platform} timeline label is not white`);
      assert.ok(contrast?.ratio >= 4.5, `${platform} timeline contrast is too low: ${contrast?.ratio}`);
    }
    const shellRects = [
      metrics.shellLayout.topbar,
      metrics.shellLayout.hero,
      metrics.shellLayout.stats,
      metrics.shellLayout.calendar
    ];
    for (const rect of shellRects.slice(1)) {
      assert.ok(Math.abs(rect.left - shellRects[0].left) <= 0.5, 'desktop shells do not share a left edge');
      assert.ok(Math.abs(rect.right - shellRects[0].right) <= 0.5, 'desktop shells do not share a right edge');
    }
    assert.ok(Math.abs(metrics.shellLayout.statsTrailingSpace) <= 0.5, 'calendar summary cards leave unused horizontal space');
    assert.ok(metrics.summaryPresentation.cards.length >= 4, 'calendar summary lost operational sections');
    for (const card of metrics.summaryPresentation.cards) {
      assert.equal(card.backgroundColor, 'rgba(0, 0, 0, 0)', 'calendar summary section still has a card background');
      assert.equal(card.borderTopWidth, '0px', 'calendar summary section still has a card border');
      assert.equal(card.borderRadius, '0px', 'calendar summary section still has rounded corners');
    }
    assert.equal(metrics.summaryPresentation.divider?.width, '1px', 'calendar summary divider is missing');
    assert.notEqual(metrics.summaryPresentation.divider?.backgroundImage, 'none', 'calendar summary divider has no visual treatment');

    const completeArrivalLists = await page.evaluate(({ todayIso, tomorrowIso, pastIso, nearestIso, nearestEndIso }) => {
      bookings = bookings.filter(booking => booking.start_date !== tomorrowIso);
      const movementProperties = ['awesome', 'central', 'orange', 'vingtage', 'youth'];
      movementProperties.forEach((propertyId, index) => {
        bookings.push({
          id: 900000 + index,
          property_id: propertyId,
          platform: 'airbnb',
          start_date: todayIso,
          end_date: nearestIso,
          raw_summary: 'Reservation',
          guest_name: `Complete arrival ${index}`,
          guest_count: 2,
          guest_country: 'it',
          booking_type: 'reservation'
        });
        bookings.push({
          id: 910000 + index,
          property_id: propertyId,
          platform: 'booking',
          start_date: pastIso,
          end_date: todayIso,
          raw_summary: 'Reservation',
          guest_name: `Complete departure ${index}`,
          guest_count: 2,
          guest_country: 'it',
          booking_type: 'reservation'
        });
      });
      bookings.push({
        id: 920000,
        property_id: 'royal',
        platform: 'airbnb',
        start_date: nearestIso,
        end_date: nearestEndIso,
        raw_summary: 'Reservation',
        guest_name: 'Nearest future arrival',
        guest_count: 2,
        guest_country: 'it',
        booking_type: 'reservation'
      });
      updateStats();
      const expectedToday = bookings.filter(booking =>
        isRealGuestBooking(booking, bookings) && booking.start_date === todayIso
      ).length;
      return {
        expectedToday,
        renderedToday: document.querySelectorAll('#statTodayList .stat-checkin-item').length,
        renderedTomorrow: document.querySelectorAll('#statNextList .stat-checkin-item').length,
        renderedNearest: document.querySelectorAll('#statNext2List .stat-checkin-item').length,
        hiddenSummaries: document.querySelectorAll('#statTodayList .stat-checkin-more, #statNextList .stat-checkin-more, #statNext2List .stat-checkin-more').length,
        todayLabel: document.getElementById('statTodayCount')?.textContent || '',
        tomorrowLabel: document.getElementById('statNextDate')?.textContent || '',
        nearestLabel: document.getElementById('statNext2Date')?.textContent || '',
        orbitArrivals: document.getElementById('orbitDateArrivals')?.textContent || '',
        topBarText: document.getElementById('statsBar')?.innerText || ''
      };
    }, {
      todayIso: toIso(today),
      tomorrowIso: toIso(dateFromToday(1)),
      pastIso: toIso(dateFromToday(-2)),
      nearestIso: toIso(dateFromToday(2)),
      nearestEndIso: toIso(dateFromToday(4))
    });
    assert.ok(completeArrivalLists.expectedToday >= 5, 'test did not create enough today arrivals');
    assert.equal(completeArrivalLists.renderedToday, completeArrivalLists.expectedToday, 'today card hides arrivals');
    assert.equal(Number(completeArrivalLists.orbitArrivals), completeArrivalLists.expectedToday, 'hero arrival badge does not match today arrivals');
    assert.equal(completeArrivalLists.renderedTomorrow, 0, 'tomorrow card shows arrivals after they were removed');
    assert.equal(completeArrivalLists.tomorrowLabel, 'Завтра заездов нет');
    assert.ok(completeArrivalLists.renderedNearest >= 1, 'nearest future arrival day is not shown');
    assert.match(completeArrivalLists.nearestLabel, /·\s*\d+$/);
    assert.equal(completeArrivalLists.hiddenSummaries, 0, 'arrival cards still collapse events behind a summary');
    assert.match(completeArrivalLists.todayLabel, /заезд/i);
    assert.doesNotMatch(completeArrivalLists.topBarText, /выезд/i);
    await captureUiScreenshot(page, 'orbit-calendar-arrivals-only');
  }

  await context.close();
  return metrics;
}

async function inspectWideSectionLayouts(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(/^https:/, route => route.abort());
  const page = await context.newPage();
  const errors = collectPageErrors(page);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('freshnessStatus')?.dataset.state === 'ok');

  const readSection = async selector => page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  });
  const topbar = await readSection('.orbit-topbar');

  await page.getByRole('button', { name: /Налоги/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('#taxList .tax-date-group').length > 1);
  const tax = await readSection('#taxTab');
  const taxLayout = await page.locator('#taxList').evaluate(element => {
    const group = element.querySelector('.tax-date-group');
    const header = group?.querySelector('.tax-date-header');
    const rows = group?.querySelector('.tax-date-rows');
    const groupStyle = group ? getComputedStyle(group) : null;
    const headerStyle = header ? getComputedStyle(header) : null;
    const rowsStyle = rows ? getComputedStyle(rows) : null;
    const previousScrollTop = element.scrollTop;
    element.scrollTop = Math.min(80, Math.max(0, (group?.scrollHeight || 0) - (header?.offsetHeight || 0) - 1));
    const stickyOffset = header
      ? Math.round(header.getBoundingClientRect().top - element.getBoundingClientRect().top)
      : null;
    element.scrollTop = previousScrollTop;
    return {
      groupColumns: groupStyle?.gridTemplateColumns.split(' ').filter(Boolean).length || 0,
      cardColumns: rowsStyle?.gridTemplateColumns.split(' ').filter(Boolean).length || 0,
      headerPosition: headerStyle?.position || '',
      headerTop: headerStyle?.top || '',
      stickyOffset,
      paidText: header?.querySelector('.tax-date-progress-total')?.textContent || ''
    };
  });
  await captureUiScreenshot(page, 'orbit-tax-wide');

  await page.getByRole('button', { name: /Гости/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('#reportingUnits .reporting-unit').length === 2);
  const reporting = await readSection('#reportingTab');
  const reportingLayout = await page.locator('.reporting-stack').evaluate(element => {
    const primaryGrid = element.querySelector('.reporting-primary-grid');
    const upload = primaryGrid?.querySelector('.reporting-card');
    const history = primaryGrid?.querySelector('#reportingHistoryFold');
    const istat = element.querySelector('.reporting-istat-area');
    const uploadRect = upload?.getBoundingClientRect();
    const historyRect = history?.getBoundingClientRect();
    const istatRect = istat?.getBoundingClientRect();
    return {
      columns: primaryGrid ? getComputedStyle(primaryGrid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      heightDifference: uploadRect && historyRect ? Math.abs(uploadRect.height - historyRect.height) : Infinity,
      istatBelowPrimary: Boolean(istatRect && uploadRect && historyRect && istatRect.top >= Math.max(uploadRect.bottom, historyRect.bottom))
    };
  });
  await captureUiScreenshot(page, 'orbit-reporting-wide');

  for (const section of [tax, reporting]) {
    assert.ok(Math.abs(section.left - topbar.left) <= 0.5, 'wide section does not share the shell left edge');
    assert.ok(Math.abs(section.right - topbar.right) <= 0.5, 'wide section does not share the shell right edge');
  }
  assert.equal(taxLayout.groupColumns, 2, 'wide tax group should split the date rail from payment cards');
  assert.equal(taxLayout.cardColumns, 2, 'wide tax payments should use two card columns');
  assert.equal(taxLayout.headerPosition, 'sticky', 'wide tax date rail should remain sticky');
  assert.equal(taxLayout.headerTop, '0px', 'wide tax date rail should stick to the top of the tax scroller');
  assert.ok(Math.abs(taxLayout.stickyOffset) <= 1, 'wide tax date rail should stay pinned while the tax list scrolls');
  assert.match(taxLayout.paidText, /оплачено из/);
  assert.equal(reportingLayout.columns, 2, 'wide guest-reporting workspace should use two primary columns');
  assert.ok(reportingLayout.heightDifference <= 1, 'TXT upload and history columns should have equal heights');
  assert.equal(reportingLayout.istatBelowPrimary, true, 'ISTAT should be a separate section below the primary columns');
  const overflow = await readHorizontalOverflow(page);
  assert.ok(overflow.document <= 1, `wide layout document overflows horizontally by ${overflow.document}px`);
  assert.ok(overflow.body <= 1, `wide layout body overflows horizontally by ${overflow.body}px`);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.consoleErrors, []);

  await context.close();
  return { topbar, tax, reporting, taxLayout, reportingLayout, overflow };
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
  assert.match(await page.locator('#reportingDropzone').innerText(), /Выбрать или перетащить TXT для Dragone/i);
  assert.match(await page.locator('#reportingHistoryTitle').innerText(), /Dragone/);
  assert.equal(await page.locator('.reporting-flow-step').count(), 3);
  assert.equal(await page.locator('#reportingBatchList').innerText(), '');
  assert.equal(await page.locator('#reportingHistoryFold').getAttribute('open'), null);
  assert.equal(await page.locator('#reportingIstatFold').getAttribute('open'), null);
  assert.match(await page.locator('#reportingIstatDeadline').innerText(), /4-го числа|ISTAT за/i);
  const reportingPositions = await page.evaluate(() => {
    const primary = document.querySelector('.reporting-primary-grid')?.getBoundingClientRect();
    const istat = document.querySelector('.reporting-istat-area')?.getBoundingClientRect();
    const upload = document.querySelector('.reporting-primary-grid > .reporting-card')?.getBoundingClientRect();
    const history = document.getElementById('reportingHistoryFold')?.getBoundingClientRect();
    return {
      istatBelowPrimary: Boolean(primary && istat && istat.top >= primary.bottom),
      equalPrimaryHeights: Boolean(upload && history && Math.abs(upload.height - history.height) <= 1)
    };
  });
  assert.equal(reportingPositions.istatBelowPrimary, true);
  assert.equal(reportingPositions.equalPrimaryHeights, true);

  await page.setViewportSize({ width:390, height:844 });
  const mobileReportingLayout = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector('.reporting-primary-grid')).gridTemplateColumns.split(' ').filter(Boolean).length,
    istatBelowPrimary: document.querySelector('.reporting-istat-area').getBoundingClientRect().top >= document.querySelector('.reporting-primary-grid').getBoundingClientRect().bottom,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  assert.equal(mobileReportingLayout.columns, 1);
  assert.equal(mobileReportingLayout.istatBelowPrimary, true);
  assert.ok(mobileReportingLayout.horizontalOverflow <= 1);
  await captureUiScreenshot(page, 'orbit-reporting-mobile');
  await page.setViewportSize({ width:1280, height:900 });

  const dragState = await page.evaluate(() => {
    const dropzone = document.getElementById('reportingDropzone');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['test'], 'guests.txt', { type:'text/plain' }));
    dropzone.dispatchEvent(new DragEvent('dragenter', { bubbles:true, cancelable:true, dataTransfer:transfer }));
    const activeAfterEnter = dropzone.classList.contains('drag-active');
    dropzone.dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer:transfer }));
    return { activeAfterEnter, activeAfterDrop:dropzone.classList.contains('drag-active') };
  });
  assert.equal(dragState.activeAfterEnter, true);
  assert.equal(dragState.activeAfterDrop, false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await page.getByRole('button', { name: /Carina/ }).click();
  await page.waitForFunction(() => document.getElementById('reportingCurrentUnitName')?.textContent === 'Carina');
  assert.match(await page.locator('#reportingDropzone').innerText(), /Выбрать или перетащить TXT для Carina/i);
  assert.match(await page.locator('#reportingHistoryTitle').innerText(), /Carina/);
  await page.locator('#reportingIstatFold > summary').click();
  await page.waitForFunction(() => document.querySelectorAll('.reporting-istat-table tbody tr').length > 0);
  const istatMonth = await page.locator('#reportingMonth').inputValue();
  const [istatYear, istatMonthNumber] = istatMonth.split('-').map(Number);
  assert.equal(await page.locator('.reporting-istat-table tbody tr').count(), new Date(Date.UTC(istatYear, istatMonthNumber, 0)).getUTCDate());
  assert.match(await page.locator('#reportingIstatDeadline').innerText(), /ISTAT|месяц|Срок/i);
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

function collectPageErrors(page, { ignoreResourceErrors = true } = {}) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (ignoreResourceErrors && /Failed to load resource|ERR_FAILED/i.test(text)) return;
    consoleErrors.push(text);
  });
  return { pageErrors, consoleErrors };
}

async function captureUiScreenshot(page, name) {
  if (!process.env.UI_SCREENSHOT_DIR) return;
  const outputDir = path.resolve(process.env.UI_SCREENSHOT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
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

async function waitForAdminThemeRoute(page, route) {
  await page.waitForFunction(({ sectionId, tab }) => {
    const section = document.getElementById(sectionId);
    const activeTab = document.querySelector('.nav-item.active')?.dataset.tab;
    return document.getElementById('freshnessStatus')?.dataset.state === 'ok' &&
      section && getComputedStyle(section).display !== 'none' && activeTab === tab;
  }, { sectionId: route.sectionId, tab: route.tab });
  if (route.tab === 'stats') await waitForStatsReady(page, 'ok');
  else await page.waitForSelector(route.readySelector);
}

async function readThemeState(page) {
  return page.evaluate(storageKey => ({
    preference: document.documentElement.dataset.themePreference,
    resolved: document.documentElement.dataset.colorScheme,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    inlineColorScheme: document.documentElement.style.colorScheme,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content || null,
    storedPreference: localStorage.getItem(storageKey),
    controls: Array.from(document.querySelectorAll('[data-theme-option]')).map(control => ({
      option: control.dataset.themeOption,
      pressed: control.getAttribute('aria-pressed'),
      active: control.classList.contains('active'),
      label: control.getAttribute('aria-label') || ''
    }))
  }), themeStorageKey);
}

function assertThemeState(state, {
  preference,
  resolved,
  themeColor,
  storedPreference = preference === 'system' ? null : preference,
  label
}) {
  assert.equal(state.preference, preference, `${label}: wrong theme preference`);
  assert.equal(state.resolved, resolved, `${label}: wrong resolved theme`);
  assert.equal(state.inlineColorScheme, resolved, `${label}: inline color-scheme was not updated`);
  assert.match(state.colorScheme, new RegExp(`(^|\\s)${resolved}(\\s|$)`), `${label}: computed color-scheme was not updated`);
  assert.equal(state.themeColor?.toLowerCase(), themeColor, `${label}: browser theme-color was not updated`);
  assert.equal(state.storedPreference, storedPreference, `${label}: persisted preference is incorrect`);
  assert.deepEqual(state.controls.map(control => control.option).sort(), ['dark', 'light', 'system'], `${label}: theme controls are incomplete`);
  assert.equal(state.controls.filter(control => control.pressed === 'true').length, 1, `${label}: exactly one theme control must be aria-pressed`);
  for (const control of state.controls) {
    const selected = control.option === preference;
    assert.equal(control.pressed, selected ? 'true' : 'false', `${label}: ${control.option} has wrong aria-pressed state`);
    assert.equal(control.active, selected, `${label}: ${control.option} has wrong active state`);
    assert.ok(control.label, `${label}: ${control.option} is missing an accessible label`);
  }
}

async function readDarkVisualAudit(page, surfaceSelectors) {
  return page.evaluate(selectors => {
    const parseColor = value => {
      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const channels = match[1].split(',').map(part => Number.parseFloat(part));
      return {
        red: channels[0],
        green: channels[1],
        blue: channels[2],
        alpha: channels.length > 3 ? channels[3] : 1
      };
    };
    const isNearWhite = value => {
      const color = parseColor(value);
      return Boolean(color && color.alpha >= .9 && Math.min(color.red, color.green, color.blue) >= 242);
    };
    const isRendered = element => {
      if (!element || !element.getClientRects().length) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    };
    const describe = element => {
      const classes = Array.from(element.classList || []).slice(0, 3).join('.');
      return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${classes ? `.${classes}` : ''}`;
    };
    const readSurface = selector => {
      const element = Array.from(document.querySelectorAll(selector)).find(isRendered);
      if (!element) return { selector, missing: true };
      const style = getComputedStyle(element);
      return {
        selector,
        node: describe(element),
        backgroundColor: style.backgroundColor,
        nearWhite: isNearWhite(style.backgroundColor)
      };
    };
    const suspiciousWhiteSurfaces = Array.from(document.body.querySelectorAll('*'))
      .filter(isRendered)
      .map(element => {
        const rect = element.getBoundingClientRect();
        const backgroundColor = getComputedStyle(element).backgroundColor;
        return { element, rect, backgroundColor };
      })
      .filter(({ rect, backgroundColor }) =>
        rect.width >= 120 && rect.height >= 36 && rect.width * rect.height >= 6000 && isNearWhite(backgroundColor)
      )
      .map(({ element, rect, backgroundColor }) => ({
        node: describe(element),
        backgroundColor,
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }));
    return {
      rootBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      rootNearWhite: isNearWhite(getComputedStyle(document.documentElement).backgroundColor),
      bodyNearWhite: isNearWhite(getComputedStyle(document.body).backgroundColor),
      surfaces: selectors.map(readSurface),
      suspiciousWhiteSurfaces,
      overflow: {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth
      }
    };
  }, surfaceSelectors);
}

function assertDarkVisualAudit(audit, label) {
  assert.equal(audit.rootNearWhite, false, `${label}: root remains a light surface (${audit.rootBackground})`);
  assert.equal(audit.bodyNearWhite, false, `${label}: body remains a light surface (${audit.bodyBackground})`);
  for (const surface of audit.surfaces) {
    assert.equal(surface.missing, undefined, `${label}: required surface ${surface.selector} was not rendered`);
    assert.equal(surface.nearWhite, false, `${label}: ${surface.node} remains a white surface (${surface.backgroundColor})`);
  }
  assert.deepEqual(audit.suspiciousWhiteSurfaces, [], `${label}: large white surface islands remain in dark mode`);
  assert.ok(audit.overflow.document <= 1, `${label}: document overflows horizontally by ${audit.overflow.document}px`);
  assert.ok(audit.overflow.body <= 1, `${label}: body overflows horizontally by ${audit.overflow.body}px`);
}

async function readNarrowThemeControlAudit(page, shellSelector) {
  return page.evaluate(selector => {
    const switcher = document.querySelector('.theme-switcher');
    const controls = Array.from(document.querySelectorAll('[data-theme-option]')).map(control => {
      const rect = control.getBoundingClientRect();
      return {
        option: control.dataset.themeOption,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right
      };
    });
    const activeControl = document.querySelector('[data-theme-option][aria-pressed="true"]');
    const switcherRect = switcher?.getBoundingClientRect() || null;
    const activeRect = activeControl?.getBoundingClientRect() || null;
    const switcherStyle = switcher ? getComputedStyle(switcher) : null;
    const thumbStyle = switcher ? getComputedStyle(switcher, '::before') : null;
    const thumbMatrix = thumbStyle?.transform && thumbStyle.transform !== 'none'
      ? new DOMMatrixReadOnly(thumbStyle.transform)
      : { m41: 0 };
    const thumbLeft = thumbStyle ? Number.parseFloat(thumbStyle.left) + thumbMatrix.m41 : null;
    const activeLeft = switcherRect && activeRect ? activeRect.left - switcherRect.left : null;
    const thumbWidth = thumbStyle ? Number.parseFloat(thumbStyle.width) : null;
    const shellRect = document.querySelector(selector)?.getBoundingClientRect() || null;
    return {
      controls,
      activeOption: activeControl?.dataset.themeOption || null,
      switcher: switcherRect && switcherStyle ? {
        width: switcherRect.width,
        height: switcherRect.height,
        borderWidth: Number.parseFloat(switcherStyle.borderTopWidth)
      } : null,
      thumb: thumbStyle && activeRect ? {
        width: thumbWidth,
        height: Number.parseFloat(thumbStyle.height),
        backgroundColor: thumbStyle.backgroundColor,
        transitionDuration: thumbStyle.transitionDuration,
        aligned: Math.abs(thumbLeft - activeLeft) <= 1 && Math.abs(thumbWidth - activeRect.width) <= 1
      } : null,
      shell: shellRect ? { left: shellRect.left, right: shellRect.right, width: shellRect.width } : null,
      viewportWidth: innerWidth,
      overflow: {
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth
      }
    };
  }, shellSelector);
}

function assertNarrowThemeControlAudit(audit, label) {
  assert.equal(audit.controls.length, 3, `${label}: expected three theme controls`);
  for (const control of audit.controls) {
    assert.ok(control.width >= 44, `${label}: ${control.option} target is only ${control.width}px wide`);
    assert.ok(control.height >= 44, `${label}: ${control.option} target is only ${control.height}px high`);
    assert.ok(control.left >= -1 && control.right <= audit.viewportWidth + 1, `${label}: ${control.option} target is clipped`);
  }
  assert.ok(audit.switcher, `${label}: theme rail is missing`);
  assert.equal(audit.switcher.borderWidth, 0, `${label}: theme rail still has a decorative outline`);
  assert.ok(audit.thumb, `${label}: moving theme thumb is missing`);
  assert.equal(audit.thumb.aligned, true, `${label}: theme thumb is not aligned with ${audit.activeOption}`);
  assert.ok(audit.thumb.width >= 44 && audit.thumb.height >= 44, `${label}: theme thumb is smaller than its target`);
  assert.notEqual(audit.thumb.backgroundColor, 'rgba(0, 0, 0, 0)', `${label}: theme thumb is invisible`);
  assert.notEqual(audit.thumb.transitionDuration, '0s', `${label}: theme thumb has no motion`);
  assert.ok(audit.shell, `${label}: header shell is missing`);
  assert.ok(audit.shell.left >= -1 && audit.shell.right <= audit.viewportWidth + 1, `${label}: header shell is clipped`);
  assert.ok(audit.overflow.document <= 1, `${label}: document overflows horizontally by ${audit.overflow.document}px`);
  assert.ok(audit.overflow.body <= 1, `${label}: body overflows horizontally by ${audit.overflow.body}px`);
}

async function inspectNarrowThemeControls(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 800 },
    isMobile: true,
    colorScheme: 'dark'
  });
  await installStatsBrowserMocks(context);
  const page = await context.newPage();
  const errors = collectPageErrors(page, { ignoreResourceErrors: false });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    document.getElementById('freshnessStatus')?.dataset.state === 'ok' &&
    document.querySelector('.nav-item.active')?.dataset.tab === 'calendar' &&
    getComputedStyle(document.getElementById('calendarTab')).display !== 'none'
  );
  await page.waitForSelector('.mobile-agenda-card');
  const adminSystem = await readNarrowThemeControlAudit(page, '.orbit-topbar');
  assertNarrowThemeControlAudit(adminSystem, '320px admin system theme switcher');
  assert.equal(adminSystem.activeOption, 'system');
  await page.locator('[data-theme-option="dark"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.themePreference === 'dark');
  await page.waitForTimeout(220);
  const adminDark = await readNarrowThemeControlAudit(page, '.orbit-topbar');
  assertNarrowThemeControlAudit(adminDark, '320px admin dark theme switcher');
  assert.equal(adminDark.activeOption, 'dark');
  await captureUiScreenshot(page, 'theme-dark-narrow-admin');

  await page.goto(new URL('/maid/test-cleaner', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.header .theme-switcher');
  const maid = await readNarrowThemeControlAudit(page, '.header');
  assertNarrowThemeControlAudit(maid, '320px maid theme switcher');
  assert.equal(maid.activeOption, 'dark');
  await captureUiScreenshot(page, 'theme-dark-narrow-maid');

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const reducedMotion = await readNarrowThemeControlAudit(page, '.header');
  assert.equal(reducedMotion.thumb.transitionDuration, '0s', 'reduced motion did not disable the theme thumb animation');

  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.consoleErrors, []);
  await context.close();
  return { adminSystem, adminDark, maid, reducedMotionDuration: reducedMotion.thumb.transitionDuration };
}

async function inspectThemePreferences(browser, baseUrl) {
  const initialSystem = {};
  for (const systemScheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: systemScheme
    });
    await installStatsBrowserMocks(context);
    const page = await context.newPage();
    const errors = collectPageErrors(page, { ignoreResourceErrors: false });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForAdminThemeRoute(page, adminThemeRoutes[0]);
    const state = await readThemeState(page);
    assertThemeState(state, {
      preference: 'system',
      resolved: systemScheme,
      themeColor: systemScheme === 'dark' ? '#10111b' : '#eef0f6',
      label: `initial system ${systemScheme}`
    });
    assert.deepEqual(errors.pageErrors, []);
    assert.deepEqual(errors.consoleErrors, []);
    initialSystem[systemScheme] = state;
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light'
  });
  await installStatsBrowserMocks(context);
  const page = await context.newPage();
  const errors = collectPageErrors(page, { ignoreResourceErrors: false });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForAdminThemeRoute(page, adminThemeRoutes[0]);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.colorScheme === 'dark');
  const liveSystemDark = await readThemeState(page);
  assertThemeState(liveSystemDark, {
    preference: 'system',
    resolved: 'dark',
    themeColor: '#10111b',
    label: 'live system dark'
  });

  await page.locator('[data-theme-option="light"]').click();
  await page.waitForFunction(storageKey =>
    document.documentElement.dataset.themePreference === 'light' &&
    document.documentElement.dataset.colorScheme === 'light' &&
    localStorage.getItem(storageKey) === 'light', themeStorageKey);
  const explicitLight = await readThemeState(page);
  assertThemeState(explicitLight, {
    preference: 'light',
    resolved: 'light',
    themeColor: '#eef0f6',
    label: 'explicit light override on dark OS'
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAdminThemeRoute(page, adminThemeRoutes[0]);
  const reloadedLight = await readThemeState(page);
  assertThemeState(reloadedLight, {
    preference: 'light',
    resolved: 'light',
    themeColor: '#eef0f6',
    label: 'reloaded explicit light'
  });

  await page.goto(new URL('/maid/test-cleaner', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.header .theme-switcher');
  const maidLight = await readThemeState(page);
  assertThemeState(maidLight, {
    preference: 'light',
    resolved: 'light',
    themeColor: '#f8f9fb',
    label: 'maid persisted explicit light'
  });

  await page.locator('[data-theme-option="dark"]').click();
  await page.waitForFunction(storageKey =>
    document.documentElement.dataset.themePreference === 'dark' &&
    document.documentElement.dataset.colorScheme === 'dark' &&
    localStorage.getItem(storageKey) === 'dark', themeStorageKey);
  const maidDark = await readThemeState(page);
  assertThemeState(maidDark, {
    preference: 'dark',
    resolved: 'dark',
    themeColor: '#0d1518',
    label: 'maid explicit dark'
  });

  await page.goto(new URL('/stats', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await waitForAdminThemeRoute(page, adminThemeRoutes.find(route => route.tab === 'stats'));
  const persistedDark = await readThemeState(page);
  assertThemeState(persistedDark, {
    preference: 'dark',
    resolved: 'dark',
    themeColor: '#10111b',
    label: 'admin persisted explicit dark'
  });
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.consoleErrors, []);
  await context.close();
  return {
    initialSystem: Object.fromEntries(Object.entries(initialSystem).map(([scheme, state]) => [scheme, state.resolved])),
    liveSystemSwitch: `${initialSystem.light.resolved}->${liveSystemDark.resolved}`,
    explicitLightOverride: explicitLight.resolved,
    explicitLightReloaded: reloadedLight.resolved,
    maidSharedPreference: `${maidLight.preference}->${maidDark.preference}`,
    adminPersistedPreference: persistedDark.preference
  };
}

async function inspectDarkThemeRoutes(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark'
  });
  await installStatsBrowserMocks(context);
  const page = await context.newPage();
  const errors = collectPageErrors(page, { ignoreResourceErrors: false });
  const routes = {};

  for (const route of adminThemeRoutes) {
    await page.goto(new URL(route.path, baseUrl).href, { waitUntil: 'domcontentloaded' });
    await waitForAdminThemeRoute(page, route);
    assert.equal(new URL(page.url()).pathname, route.path, `${route.path}: direct route was not preserved`);
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru', `${route.path}: direct route did not serve the admin index shell`);
    assert.equal(await page.locator(`#${route.sectionId}`).isVisible(), true, `${route.path}: expected admin tab is hidden`);
    const state = await readThemeState(page);
    assertThemeState(state, {
      preference: 'system',
      resolved: 'dark',
      themeColor: '#10111b',
      label: `${route.path} dark route`
    });
    const visual = await readDarkVisualAudit(page, route.surfaces);
    assertDarkVisualAudit(visual, `${route.path} dark route`);
    await captureUiScreenshot(page, `theme-dark-${route.tab}`);
    routes[route.path] = {
      tab: route.tab,
      resolved: state.resolved,
      whiteSurfaceIslands: visual.suspiciousWhiteSurfaces.length,
      overflow: visual.overflow
    };
  }

  await page.goto(new URL('/maid/test-cleaner', baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.header .theme-switcher');
  assert.equal(new URL(page.url()).pathname, '/maid/test-cleaner');
  assert.equal(await page.locator('html').getAttribute('lang'), 'it');
  const maidState = await readThemeState(page);
  assertThemeState(maidState, {
    preference: 'system',
    resolved: 'dark',
    themeColor: '#0d1518',
    label: 'public maid dark route'
  });
  const maidVisual = await readDarkVisualAudit(page, [
    'body',
    '.header',
    '.properties-bar',
    '.quick-nav',
    '.event-card, .empty-month'
  ]);
  assertDarkVisualAudit(maidVisual, 'public maid dark route');
  await captureUiScreenshot(page, 'theme-dark-maid-public');

  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.consoleErrors, []);
  await context.close();
  return {
    routes,
    maid: {
      resolved: maidState.resolved,
      whiteSurfaceIslands: maidVisual.suspiciousWhiteSurfaces.length,
      overflow: maidVisual.overflow
    }
  };
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

  const surfaceHierarchy = await page.evaluate(() => {
    const readSurface = selector => {
      const node = document.querySelector(selector);
      const style = getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderTopWidth: style.borderTopWidth,
        borderRadius: style.borderRadius
      };
    };
    const history = document.querySelector('#statsHistoryStatus');
    const radar = document.querySelector('.stats-radar-card');
    const dynamics = document.querySelector('#statsDynamicsCard');
    return {
      history: readSurface('#statsHistoryStatus'),
      radar: readSurface('.stats-radar-card'),
      metric: readSurface('#statsRadarGrid .stats-radar-metric'),
      dynamics: readSurface('#statsDynamicsCard'),
      dynamicsStartsCards: Boolean(history && radar && dynamics &&
        history.compareDocumentPosition(radar) & Node.DOCUMENT_POSITION_FOLLOWING &&
        radar.compareDocumentPosition(dynamics) & Node.DOCUMENT_POSITION_FOLLOWING)
    };
  });
  for (const [name, surface] of Object.entries({
    history: surfaceHierarchy.history,
    radar: surfaceHierarchy.radar,
    metric: surfaceHierarchy.metric
  })) {
    assert.equal(surface.backgroundColor, 'rgba(0, 0, 0, 0)', `${name} still has a card background`);
    assert.equal(surface.borderTopWidth, '0px', `${name} still has a card border`);
    assert.equal(surface.borderRadius, '0px', `${name} still has rounded card corners`);
  }
  assert.notEqual(surfaceHierarchy.dynamics.backgroundImage, 'none', 'season dynamics lost its card surface');
  assert.notEqual(surfaceHierarchy.dynamics.borderRadius, '0px', 'season dynamics no longer starts the card hierarchy');
  assert.equal(surfaceHierarchy.dynamicsStartsCards, true, 'operational strip no longer precedes season dynamics');

  const initialThemeResolution = await page.evaluate(() => document.documentElement.dataset.colorScheme);
  const firstThemeTarget = initialThemeResolution === 'dark' ? 'light' : 'dark';
  const themeTargets = [firstThemeTarget, firstThemeTarget === 'dark' ? 'light' : 'dark', firstThemeTarget];
  const themeLifecycle = [];
  for (const target of themeTargets) {
    const before = await page.evaluate(() => ({ ...globalThis.__statsChartMock }));
    await page.locator(`[data-theme-option="${target}"]`).click();
    await page.waitForFunction(({ expected, createdBefore }) =>
      document.documentElement.dataset.themePreference === expected &&
      document.documentElement.dataset.colorScheme === expected &&
      !document.getElementById('statsTab')?.hasAttribute('aria-busy') &&
      globalThis.__statsChartMock.created > createdBefore,
    { expected: target, createdBefore: before.created });
    const after = await page.evaluate(() => ({ ...globalThis.__statsChartMock }));
    assert.ok(after.created > before.created, `${target} theme did not recreate statistics charts`);
    assert.ok(after.destroyed - before.destroyed >= before.active, `${target} theme did not destroy every active chart`);
    assert.ok(after.active > 0 && after.active <= 7, `${target} theme leaked chart instances: ${after.active}`);
    assert.equal(after.created - after.destroyed, after.active, `${target} theme chart accounting is inconsistent`);
    const state = await readThemeState(page);
    assertThemeState(state, {
      preference: target,
      resolved: target,
      themeColor: target === 'dark' ? '#10111b' : '#eef0f6',
      label: `${isMobile ? 'mobile' : 'desktop'} stats ${target} switch`
    });
    themeLifecycle.push({
      target,
      created: after.created - before.created,
      destroyed: after.destroyed - before.destroyed,
      active: after.active
    });
  }

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

  await page.locator('#statsRadar7').click();
  await page.waitForFunction(() => document.getElementById('statsRadar7')?.getAttribute('aria-pressed') === 'true');
  await captureUiScreenshot(page, isMobile ? 'orbit-stats-mobile' : 'orbit-stats-desktop');

  await context.close();
  return { historyTitle, radar7, radar30, surfaceHierarchy, overflow, charts, themeLifecycle };
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
    heroTitle: await page.locator('#orbitHeroTitle').innerText(),
    confirmationRequests: serverState.dashboardRequests - requestsBefore
  };
  assert.equal(result.confirmedBookings, '0');
  assert.equal(result.heroTitle, 'Нет заездов и нет выездов');
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
    const themePreferences = await inspectThemePreferences(browser, baseUrl);
    const narrowThemeControls = await inspectNarrowThemeControls(browser, baseUrl);
    const darkThemeRoutes = await inspectDarkThemeRoutes(browser, baseUrl);
    const desktop = await inspectPage(browser, baseUrl, { width: 1440, height: 1000 }, false);
    const mobile = await inspectPage(browser, baseUrl, { width: 390, height: 844 }, true);
    const statsDesktop = await inspectStatsPage(browser, baseUrl, { width: 1440, height: 1000 }, false);
    const statsMobile = await inspectStatsPage(browser, baseUrl, { width: 390, height: 844 }, true);
    const statsWithoutChart = await inspectStatsWithoutChart(browser, baseUrl);
    const reporting = await inspectReportingPage(browser, baseUrl);
    const wideLayouts = await inspectWideSectionLayouts(browser, baseUrl);
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
      themePreferences,
      narrowThemeControls,
      darkThemeRoutes,
      desktop,
      mobile,
      statsDesktop,
      statsMobile,
      statsWithoutChart,
      reporting,
      wideLayouts,
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
