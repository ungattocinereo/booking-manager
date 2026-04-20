#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PROPERTIES, PROPERTY_IDS } = require('../lib/properties');
const { parseAirbnbCsv } = require('../lib/parse-airbnb-csv');

const ROOT = path.join(__dirname, '..');
const EXPORTS_DIR = path.join(ROOT, 'exports');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const MONITOR_PATH = path.join(DATA_DIR, 'monitor.json');
const IMPORTS_PATH = path.join(DATA_DIR, 'imports.json');

const UPSTREAM_API = process.env.UPSTREAM_API || 'https://b.amalfi.day/api/bookings';
const SINCE = process.env.SINCE || '2026-04-17';

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

function saveJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function nowIso() { return new Date().toISOString(); }

function bookingKey(propertyId, platform, startDate, endDate) {
  return `${propertyId}|${platform}|${startDate}|${endDate}`;
}

async function fetchUpstream(propertyId) {
  const url = `${UPSTREAM_API}?property_id=${encodeURIComponent(propertyId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${propertyId}: HTTP ${res.status}`);
  const rows = await res.json();
  return rows
    .filter(r => r.platform === 'airbnb' && r.booking_type !== 'blocked' && r.booking_type !== 'unavailable')
    .map(r => ({
      propertyId: r.property_id,
      platform: r.platform,
      startDate: String(r.start_date).slice(0, 10),
      endDate: String(r.end_date).slice(0, 10),
      guestName: r.guest_name,
      reservationUrl: r.reservation_url,
      bookingCreatedAt: r.created_at,
      bookingKey: bookingKey(r.property_id, r.platform, String(r.start_date).slice(0,10), String(r.end_date).slice(0,10))
    }));
}

async function fetchAllUpstream() {
  const all = [];
  for (const id of PROPERTY_IDS) {
    try {
      const rows = await fetchUpstream(id);
      all.push(...rows);
    } catch (err) {
      console.error(`upstream fetch failed for ${id}:`, err.message);
    }
  }
  return all;
}

function readExports() {
  if (!fs.existsSync(EXPORTS_DIR)) return [];
  const files = fs.readdirSync(EXPORTS_DIR).filter(f => /\.csv$/i.test(f));
  return files.map(filename => {
    const filePath = path.join(EXPORTS_DIR, filename);
    const buf = fs.readFileSync(filePath);
    return { filename, checksum: sha256(buf), content: buf.toString('utf8') };
  });
}

function buildLiveFromEvents(events) {
  const byKey = new Map();
  for (const ev of events) {
    byKey.set(ev.bookingKey, ev);
  }
  return byKey;
}

function pushEvent(events, ev) {
  events.push({ ...ev, detectedAt: ev.detectedAt || nowIso() });
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const state = loadJson(STATE_PATH, { events: [], imports: [], bootstrappedAt: null });
  const isBootstrap = state.events.length === 0;

  // --- (A) Snapshot-diff from upstream bookings API ---
  const upstream = await fetchAllUpstream();
  const currentByKey = new Map(upstream.map(r => [r.bookingKey, r]));

  const activeLive = new Map();
  const lastByKey = new Map();
  for (const ev of state.events) {
    lastByKey.set(ev.bookingKey, ev);
    if (ev.eventType === 'cancelled') activeLive.delete(ev.bookingKey);
    else activeLive.set(ev.bookingKey, ev);
  }

  let createdByApi = 0, cancelledByApi = 0;

  for (const [key, cur] of currentByKey) {
    if (!activeLive.has(key)) {
      pushEvent(state.events, {
        eventType: 'created',
        bookingKey: key,
        propertyId: cur.propertyId,
        platform: cur.platform,
        startDate: cur.startDate,
        endDate: cur.endDate,
        guestName: cur.guestName,
        reservationUrl: cur.reservationUrl,
        confirmationCode: null,
        source: 'upstream_api',
        sourceRef: isBootstrap ? 'bootstrap' : 'hourly_sync',
        bookingCreatedAt: cur.bookingCreatedAt,
        detectedAt: isBootstrap ? cur.bookingCreatedAt : nowIso()
      });
      createdByApi++;
    }
  }

  for (const [key, last] of activeLive) {
    if (last.source !== 'upstream_api' && last.source !== 'export_airbnb_csv') continue;
    if (last.platform !== 'airbnb') continue;
    if (!PROPERTY_IDS.includes(last.propertyId)) continue;
    if (currentByKey.has(key)) continue;
    pushEvent(state.events, {
      eventType: 'cancelled',
      bookingKey: key,
      propertyId: last.propertyId,
      platform: last.platform,
      startDate: last.startDate,
      endDate: last.endDate,
      guestName: last.guestName,
      reservationUrl: last.reservationUrl,
      confirmationCode: last.confirmationCode,
      source: 'upstream_api',
      sourceRef: 'hourly_sync',
      bookingCreatedAt: last.bookingCreatedAt,
      detectedAt: nowIso()
    });
    cancelledByApi++;
  }

  // --- (B) Ingest CSV exports ---
  const exports = readExports();
  const importsLog = state.imports || [];
  const seenImports = new Set(importsLog.map(i => `${i.filename}|${i.checksum}`));
  const newImports = [];

  // Refresh live state after (A)
  const lastAfterA = new Map();
  const activeAfterA = new Map();
  for (const ev of state.events) {
    lastAfterA.set(ev.bookingKey, ev);
    if (ev.eventType === 'cancelled') activeAfterA.delete(ev.bookingKey);
    else activeAfterA.set(ev.bookingKey, ev);
  }

  for (const exp of exports) {
    const sig = `${exp.filename}|${exp.checksum}`;
    if (seenImports.has(sig)) continue;

    const parsed = parseAirbnbCsv(exp.content);
    let cCreated = 0, cCancelled = 0, cUpdated = 0;

    for (const row of parsed) {
      const key = row.bookingKey;
      const lastEv = lastAfterA.get(key);
      const isActiveLive = lastEv && lastEv.eventType !== 'cancelled';

      if (row.status === 'cancelled') {
        if (isActiveLive) {
          pushEvent(state.events, {
            eventType: 'cancelled',
            bookingKey: key,
            propertyId: row.propertyId,
            platform: row.platform,
            startDate: row.startDate,
            endDate: row.endDate,
            guestName: row.guestName,
            reservationUrl: lastEv.reservationUrl,
            confirmationCode: row.confirmationCode || lastEv.confirmationCode,
            source: 'export_airbnb_csv',
            sourceRef: exp.filename,
            bookingCreatedAt: lastEv.bookingCreatedAt,
            detectedAt: nowIso()
          });
          lastAfterA.set(key, { ...lastEv, eventType: 'cancelled' });
          cCancelled++;
        }
        continue;
      }

      if (!isActiveLive) {
        pushEvent(state.events, {
          eventType: 'created',
          bookingKey: key,
          propertyId: row.propertyId,
          platform: row.platform,
          startDate: row.startDate,
          endDate: row.endDate,
          guestName: row.guestName,
          reservationUrl: null,
          confirmationCode: row.confirmationCode,
          source: 'export_airbnb_csv',
          sourceRef: exp.filename,
          bookingCreatedAt: row.bookedAt ? `${row.bookedAt}T00:00:00.000Z` : null,
          detectedAt: isBootstrap && row.bookedAt ? `${row.bookedAt}T00:00:00.000Z` : nowIso()
        });
        cCreated++;
        lastAfterA.set(key, { bookingKey: key, eventType: 'created' });
        continue;
      }

      const enrichedCode = row.confirmationCode && row.confirmationCode !== lastEv.confirmationCode;
      const enrichedGuest = row.guestName && row.guestName !== lastEv.guestName;
      if (enrichedCode || enrichedGuest) {
        pushEvent(state.events, {
          eventType: 'updated',
          bookingKey: key,
          propertyId: row.propertyId,
          platform: row.platform,
          startDate: row.startDate,
          endDate: row.endDate,
          guestName: row.guestName || lastEv.guestName,
          reservationUrl: lastEv.reservationUrl,
          confirmationCode: row.confirmationCode || lastEv.confirmationCode,
          source: 'export_airbnb_csv',
          sourceRef: exp.filename,
          bookingCreatedAt: lastEv.bookingCreatedAt || (row.bookedAt ? `${row.bookedAt}T00:00:00.000Z` : null),
          detectedAt: nowIso()
        });
        cUpdated++;
      }
    }

    newImports.push({
      filename: exp.filename,
      checksum: exp.checksum,
      source: 'airbnb',
      importedAt: nowIso(),
      records: parsed.length,
      created: cCreated,
      cancelled: cCancelled,
      updated: cUpdated
    });
  }

  state.imports = [...importsLog, ...newImports];
  if (isBootstrap) state.bootstrappedAt = nowIso();
  saveJson(STATE_PATH, state);

  // --- Build monitor.json (UI-ready) ---
  const agg = new Map();
  for (const ev of state.events) {
    let a = agg.get(ev.bookingKey);
    if (!a) {
      a = {
        bookingKey: ev.bookingKey,
        propertyId: ev.propertyId,
        platform: ev.platform,
        startDate: ev.startDate,
        endDate: ev.endDate,
        guestName: ev.guestName,
        reservationUrl: ev.reservationUrl,
        confirmationCode: ev.confirmationCode,
        bookingCreatedAt: ev.bookingCreatedAt,
        firstSeenAt: ev.detectedAt,
        lastEvent: ev.eventType,
        cancelledAt: null,
        sources: new Set([ev.source])
      };
      agg.set(ev.bookingKey, a);
    } else {
      a.lastEvent = ev.eventType;
      if (ev.eventType === 'cancelled') a.cancelledAt = ev.detectedAt;
      if (ev.eventType !== 'cancelled' && ev.guestName) a.guestName = ev.guestName;
      if (ev.reservationUrl) a.reservationUrl = ev.reservationUrl;
      if (ev.confirmationCode) a.confirmationCode = ev.confirmationCode;
      if (ev.bookingCreatedAt) a.bookingCreatedAt = ev.bookingCreatedAt;
      a.sources.add(ev.source);
    }
  }

  const sinceDate = new Date(`${SINCE}T00:00:00.000Z`);

  function linkFor(a) {
    if (a.reservationUrl) return a.reservationUrl;
    if (a.platform !== 'airbnb') return null;
    const p = PROPERTIES.find(p => p.id === a.propertyId);
    if (!p) return null;
    return `https://www.airbnb.com/hosting/listings/${p.listingId}/calendar${a.startDate ? `?date=${a.startDate}` : ''}`;
  }

  const bookings = [];
  for (const a of agg.values()) {
    const firstSeen = a.bookingCreatedAt || a.firstSeenAt;
    if (!firstSeen) continue;
    const firstSeenDate = new Date(firstSeen);
    const inRange = firstSeenDate >= sinceDate ||
      (a.lastEvent === 'cancelled' && a.cancelledAt && new Date(a.cancelledAt) >= sinceDate);
    if (!inRange) continue;
    bookings.push({
      bookingKey: a.bookingKey,
      propertyId: a.propertyId,
      platform: a.platform,
      startDate: a.startDate,
      endDate: a.endDate,
      guestName: a.guestName,
      confirmationCode: a.confirmationCode,
      firstSeenAt: firstSeen,
      status: a.lastEvent === 'cancelled' ? 'cancelled' : 'active',
      cancelledAt: a.cancelledAt,
      link: linkFor(a),
      sources: [...a.sources]
    });
  }
  bookings.sort((x, y) => new Date(y.firstSeenAt) - new Date(x.firstSeenAt));

  const groups = PROPERTIES.map(p => ({
    id: p.id,
    name: p.name,
    accent: p.accent,
    icon: p.icon,
    events: bookings.filter(b => b.propertyId === p.id)
  }));

  const availableDates = [...new Set(state.events.map(e => (e.detectedAt || '').slice(0, 10)).filter(Boolean))].sort().reverse().slice(0, 90);

  const monitor = {
    since: SINCE,
    generated_at: nowIso(),
    available_dates: availableDates,
    properties: groups,
    events: state.events,
    imports_log: state.imports.slice(-20).reverse()
  };
  saveJson(MONITOR_PATH, monitor);
  saveJson(IMPORTS_PATH, state.imports.slice(-50));

  console.log(JSON.stringify({
    bootstrapped: isBootstrap,
    upstream_rows: upstream.length,
    created_by_api: createdByApi,
    cancelled_by_api: cancelledByApi,
    new_imports: newImports.length,
    total_events: state.events.length,
    bookings_in_card: bookings.length
  }, null, 2));
}

main().catch(err => {
  console.error('sync failed:', err);
  process.exit(1);
});
