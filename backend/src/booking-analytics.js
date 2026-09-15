const { createHash } = require('node:crypto');
const { normalizeBookingsForDisplay, isRealGuestBooking, isUnavailableMarker } = require('../../lib/booking-normalization');
const { romeDateKey } = require('./stats-snapshots');
const { transaction, readAnalytics } = require('./analytics-store');
const DAY = 86400000;
const iso = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const active = b => b.active !== false && b.active !== 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const datesKey = b => `${b.property_id}|${b.platform}|${iso(b.start_date)}|${iso(b.end_date)}`;
const sourceKey = b => `${b.property_id}|${b.platform}`;
const time = day => Date.parse(`${day}T00:00:00Z`);
const dateAt = ms => new Date(ms).toISOString().slice(0, 10);
const round = n => Math.round(n * 10) / 10;
function clean(b) {
  return { property_id: b.property_id, platform: b.platform, start_date: iso(b.start_date), end_date: iso(b.end_date), guest_count: Number(b.guest_count) > 0 ? Number(b.guest_count) : null, guest_country: b.guest_country ? String(b.guest_country).toLowerCase() : null };
}
function reservationRows(rows) {
  const live = rows.filter(active);
  const seen = new Set();
  return normalizeBookingsForDisplay(live).filter(b => {
    const key = datesKey(b);
    if (!isRealGuestBooking(b, live) || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function availabilityRows(rows) { return rows.filter(b => active(b) && isUnavailableMarker(b)).map(clean); }
function sourceObservation(rows, feed, previous = null, capturedAt = new Date().toISOString()) {
  const previousBookings = previous?.bookings || {};
  const observed = feed.events || [];
  const current = {};
  const used = new Set();
  const events = [];
  const supersededRows = new Set(previous?.superseded_rows || []);
  const gaps = (previous?.gaps || []).map(g => ({ ...g, end: g.end || capturedAt }));
  if (previous?.last_observed_at && Date.parse(capturedAt) - Date.parse(previous.last_observed_at) > 90 * 60000 && !gaps.some(g => g.start <= previous.last_observed_at && g.end >= capturedAt)) {
    gaps.push({ start: previous.last_observed_at, end: capturedAt });
  }
  const today = romeDateKey(capturedAt);
  const byIdentity = event => event.uid ? hash(`${feed.property_id}|${feed.platform}|uid|${event.uid}`) : null;
  const explicitCancelled = new Set(observed.filter(e => e.status === 'CANCELLED').map(byIdentity).filter(Boolean));
  const append = (kind, key, before, after) => {
    events.push({ id: hash(`${sourceKey(feed)}|${key}|${capturedAt}|${kind}`), occurred_at: capturedAt, kind, property_id: feed.property_id, platform: feed.platform, booking_key: key, before: before || null, after: after || null });
  };
  const candidates = reservationRows(rows).filter(b => sourceKey(b) === sourceKey(feed)).sort((a, b) => {
    const seen = row => observed.some(e => e.startDate === iso(row.start_date) && e.endDate === iso(row.end_date));
    return Number(seen(b)) - Number(seen(a));
  });
  for (const b of candidates) {
    const data = clean(b);
    const matching = observed.filter(e => e.startDate === data.start_date && e.endDate === data.end_date);
    const event = matching.length === 1 ? matching[0] : null;
    const external = event && byIdentity(event);
    const oldMatches = Object.entries(previousBookings).filter(([, old]) => old.row_id === String(b.id) || datesKey(old) === datesKey(data));
    let key = external;
    // Keep the original analytic identity when a legacy row first acquires a UID.
    if (!key || !previousBookings[key]) {
      if (oldMatches.length === 1 && (!external || !oldMatches[0][1].source_identity || oldMatches[0][1].source_identity === external)) key = oldMatches[0][0];
    }
    if (!key) key = b.reservation_url ? hash(`${sourceKey(b)}|reservation|${b.reservation_url}`) : hash(datesKey(b));
    // If dates changed, use the previously linked UID instead of creating a second booking.
    const uidMatch = external && Object.entries(previousBookings).find(([, old]) => old.source_identity === external);
    if (uidMatch) key = uidMatch[0];
    if (used.has(key)) continue;
    used.add(key);
    const before = previousBookings[key];
    const sourceIdentity = external || before?.source_identity || null;
    const cancelled = (sourceIdentity && explicitCancelled.has(sourceIdentity)) || (before?.status === 'cancelled' && !event);
    const after = { ...data, row_id: String(b.id), source_identity: sourceIdentity, status: cancelled ? 'cancelled' : 'active' };
    current[key] = after;
    if (before && before.row_id !== after.row_id) supersededRows.add(before.row_id);
    if (!previous?.started_at) continue;
    if (!before) { if (!cancelled) append('created', key, null, after); }
    else if (cancelled && before.status !== 'cancelled') append(before.status === 'active' ? 'cancelled' : 'cancellation_confirmed', key, before, after);
    else if (!cancelled && before.status !== 'active') append('restored', key, before, after);
    else if (!cancelled && datesKey(before) !== datesKey(after)) append('changed', key, before, after);
  }
  for (const [key, before] of Object.entries(previousBookings)) {
    if (used.has(key)) continue;
    const cancelled = before.source_identity && explicitCancelled.has(before.source_identity);
    // Old rows superseded by the same UID are represented by the new canonical dates above.
    let status = before.status;
    if (cancelled) status = 'cancelled';
    else if (before.status === 'active' && before.end_date >= today) status = 'removed';
    // Feed expiry of completed stays never counts as a cancellation.
    current[key] = { ...before, status };
    if (status !== before.status) append(cancelled ? (before.status === 'active' ? 'cancelled' : 'cancellation_confirmed') : 'removed', key, before, current[key]);
  }
  return { state: { id: sourceKey(feed), property_id: feed.property_id, platform: feed.platform, started_at: previous?.started_at || capturedAt, last_observed_at: capturedAt, gaps, superseded_rows: [...supersededRows], bookings: current, availability: availabilityRows(rows).filter(b => sourceKey(b) === sourceKey(feed)) }, events };
}
async function recordAnalytics(db, { feeds = [], failures = [], capturedAt = new Date().toISOString() } = {}) {
  const rows = await db.getBookings(null, null, { includeInactive: true });
  const properties = await db.getProperties();
  feeds = [...feeds, ...properties.filter(p => !feeds.some(f => f.property_id === p.id && f.platform === 'direct')).map(p => ({ property_id: p.id, platform: 'direct', events: [] }))];
  const healthy = feeds.filter(feed => !failures.some(f => sourceKey(f) === sourceKey(feed)) && (feed.platform === 'direct' || feed.events?.length));
  return transaction(db, async io => {
    const saved = await io.all('SELECT payload FROM booking_analytics_state');
    const states = new Map(saved.map(r => { const s = JSON.parse(r.payload); return [s.id, s]; }));
    let count = 0;
    const unobserved = [...failures, ...feeds.filter(f => f.platform !== 'direct' && !f.events?.length)];
    for (const f of unobserved) {
      const id = sourceKey(f);
      const prior = states.get(id) || { id, property_id: f.property_id, platform: f.platform, started_at: null, last_observed_at: null, bookings: {}, availability: [], gaps: [] };
      if (!prior.gaps?.some(g => !g.end)) prior.gaps = [...(prior.gaps || []), { start: prior.last_observed_at || capturedAt, end: null }];
      states.set(id, prior);
      await io.run('INSERT INTO booking_analytics_state (id, payload) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET payload = excluded.payload', [id, JSON.stringify(prior)]);
    }
    for (const feed of healthy) {
      const { state, events } = sourceObservation(rows, feed, states.get(sourceKey(feed)), capturedAt);
      for (const e of events) {
        await io.run('INSERT INTO booking_analytics_events (id, occurred_at, kind, property_id, platform, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', [e.id, e.occurred_at, e.kind, e.property_id, e.platform, JSON.stringify({ booking_key: e.booking_key, before: e.before, after: e.after })]);
        count++;
      }
      await io.run('INSERT INTO booking_analytics_state (id, payload) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET payload = excluded.payload', [state.id, JSON.stringify(state)]);
      states.set(state.id, state);
    }
    // A partial observation must not overwrite a complete daily snapshot.
    if (!failures.length && healthy.length && healthy.length === feeds.length) {
      const stateValues = [...states.values()];
      const payload = { version: 1, properties: properties.map(p => ({ id: p.id, name: p.name })), bookings: stateValues.flatMap(s => Object.values(s.bookings).filter(b => b.status === 'active').map(clean)), availability: stateValues.flatMap(s => s.availability), coverage: stateValues.map(s => ({ property_id: s.property_id, platform: s.platform, started_at: s.started_at, last_observed_at: s.last_observed_at })) };
      await io.run('INSERT INTO booking_analytics_snapshots (snapshot_date, captured_at, payload) VALUES (?, ?, ?) ON CONFLICT (snapshot_date) DO UPDATE SET captured_at = excluded.captured_at, payload = excluded.payload', [romeDateKey(capturedAt), capturedAt, JSON.stringify(payload)]);
    }
    return { events: count, observed_sources: healthy.length };
  });
}
function optionsFromQuery(query = {}, now = new Date().toISOString()) {
  const year = query.year == null ? Number(romeDateKey(now).slice(0, 4)) : Number(query.year);
  const period = query.period || 'year', group = query.group || 'month';
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !['year', 'season'].includes(period) || !['month', 'week', 'day'].includes(group) || (query.platform && !['airbnb', 'booking', 'direct'].includes(query.platform))) {
    const e = new Error('Invalid analytics filters'); e.statusCode = 400; throw e;
  }
  return { year, period, group, property: query.property || '', platform: query.platform || '', now };
}
const matches = (b, o) => (!o.property || b.property_id === o.property) && (!o.platform || b.platform === o.platform);
function range(o) { return { start: `${o.year}-${o.period === 'season' ? '04' : '01'}-01`, end: o.period === 'season' ? `${o.year}-12-01` : `${o.year + 1}-01-01` }; }
function aggregate(bookings, availability, properties, o) {
  const { start, end } = range(o);
  const props = properties.filter(p => !o.property || p.id === o.property);
  const propIds = new Set(props.map(p => p.id));
  const selected = bookings.filter(b => matches(b, o) && propIds.has(b.property_id) && b.start_date < end && b.end_date > start);
  // Availability describes property inventory, irrespective of the selected sales channel.
  const blocked = availability.filter(b => propIds.has(b.property_id) && b.start_date < end && b.end_date > start);
  const occupied = new Set(), unavailable = new Set();
  const fill = (rows, target) => { for (const b of rows) for (let d = Math.max(time(b.start_date), time(start)); d < Math.min(time(b.end_date), time(end)); d += DAY) target.add(`${b.property_id}|${dateAt(d)}`); };
  fill(selected, occupied); fill(blocked, unavailable);
  // A reservation takes precedence over overlapping channel blocks.
  for (const key of occupied) unavailable.delete(key);
  const monthKeys = Array.from({ length: o.period === 'season' ? 8 : 12 }, (_, i) => `${o.year}-${String(i + (o.period === 'season' ? 4 : 1)).padStart(2, '0')}`);
  const months = monthKeys.map(month => {
    const inMonth = selected.filter(b => b.start_date.slice(0, 7) === month);
    const [y, m] = month.split('-').map(Number);
    const inventory = props.length * new Date(Date.UTC(y, m, 0)).getUTCDate();
    const nights = [...occupied].filter(k => k.split('|')[1].startsWith(month)).length;
    const closed = [...unavailable].filter(k => k.split('|')[1].startsWith(month)).length;
    return { month, arrivals: inMonth.length, nights, sellable: inventory - closed, occupancy: inventory > closed ? round(nights / (inventory - closed) * 100) : null, guests: inMonth.some(b => b.guest_count) ? inMonth.reduce((s, b) => s + (b.guest_count || 0), 0) : null, guests_known: inMonth.filter(b => b.guest_count).length, platforms: Object.fromEntries(['airbnb', 'booking', 'direct'].map(p => [p, inMonth.filter(b => b.platform === p).length])) };
  });
  const checkins = selected.filter(b => b.start_date >= start && b.start_date < end);
  const countries = {}, weekdays = Array(7).fill(0), stayBuckets = { '1': 0, '2': 0, '3': 0, '4–6': 0, '7+': 0 };
  for (const b of checkins) {
    const country = b.guest_country || 'unknown'; countries[country] = (countries[country] || 0) + 1;
    weekdays[(new Date(time(b.start_date)).getUTCDay() + 6) % 7]++;
    const n = Math.round((time(b.end_date) - time(b.start_date)) / DAY);
    stayBuckets[n <= 3 ? String(n) : n <= 6 ? '4–6' : '7+']++;
  }
  const matrix = props.map(p => ({ property_id: p.id, name: p.name, months: monthKeys.map(month => {
    const [y, m] = month.split('-').map(Number);
    const nights = [...occupied].filter(k => k.startsWith(`${p.id}|${month}`)).length;
    const closed = [...unavailable].filter(k => k.startsWith(`${p.id}|${month}`)).length;
    const sellable = new Date(Date.UTC(y, m, 0)).getUTCDate() - closed;
    return { month, nights, sellable, occupancy: sellable ? round(nights / sellable * 100) : null };
  }), avg_stay: (() => { const a = checkins.filter(b => b.property_id === p.id); return a.length ? round(a.reduce((s, b) => s + (time(b.end_date) - time(b.start_date)) / DAY, 0) / a.length) : null; })() }));
  const sellable = months.reduce((s, m) => s + m.sellable, 0);
  return { bookings: selected.length, arrivals: checkins.length, nights: occupied.size, sellable, occupancy: sellable ? round(occupied.size / sellable * 100) : null, guests: checkins.some(b => b.guest_count) ? checkins.reduce((s, b) => s + (b.guest_count || 0), 0) : null, guests_known: checkins.filter(b => b.guest_count).length, months, matrix, countries, weekdays, stay_buckets: stayBuckets };
}
function bucketKey(day, group) {
  if (group === 'month') return day.slice(0, 7);
  if (group === 'day') return day;
  const d = new Date(time(day)); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return iso(d);
}
function movement(events, states, o) {
  const { start, end } = range(o), today = romeDateKey(o.now);
  const selectedSources = states.filter(s => matches(s, o));
  const initialized = selectedSources.filter(s => s.started_at && s.last_observed_at);
  const coverageStart = initialized.length ? initialized.map(s => romeDateKey(s.started_at)).sort()[0] : null;
  const lastObserved = initialized.length ? initialized.map(s => romeDateKey(s.last_observed_at)).sort().at(-1) : null;
  const completeStart = initialized.length === selectedSources.length && initialized.length ? initialized.map(s => romeDateKey(s.started_at)).sort().at(-1) : null;
  const completeThrough = initialized.length ? initialized.map(s => romeDateKey(s.last_observed_at)).sort()[0] : null;
  const buckets = new Map();
  for (let d = time(start); d < time(end); d += DAY) {
    const day = dateAt(d), key = bucketKey(day, o.group);
    if (!buckets.has(key)) buckets.set(key, { period: key, start: day, end: day, created: 0, restored: 0, cancelled: 0, removed: 0, changed: 0, cancellation_confirmed: 0, net: 0, coverage: 'none' });
    const b = buckets.get(key); b.end = day;
  }
  for (const b of buckets.values()) {
    if (coverageStart && b.end >= coverageStart && b.start <= today && b.start <= lastObserved) b.coverage = !completeStart || b.start < completeStart || b.end > completeThrough ? 'partial' : 'observed';
    if (b.coverage !== 'none' && selectedSources.some(s => (s.gaps || []).some(g => romeDateKey(g.start) <= b.end && (!g.end || romeDateKey(g.end) >= b.start)))) b.coverage = 'partial';
  }
  const cancellationsByArrival = new Map();
  for (const e of events) {
    if (!matches(e, o)) continue;
    const day = romeDateKey(e.occurred_at);
    if (day >= start && day < end) { const b = buckets.get(bucketKey(day, o.group)); if (b && e.kind in b) b[e.kind]++; }
    if (['cancelled', 'removed', 'cancellation_confirmed'].includes(e.kind)) {
      const arrival = (e.before || e.after)?.start_date;
      if (arrival >= start && arrival < end) {
        const month = arrival.slice(0, 7);
        if (!cancellationsByArrival.has(month)) cancellationsByArrival.set(month, { month, cancelled: 0, removed: 0 });
        const b = cancellationsByArrival.get(month);
        if (e.kind === 'cancellation_confirmed') { b.cancelled++; b.removed = Math.max(0, b.removed - 1); } else b[e.kind]++;
      }
    }
  }
  for (const b of buckets.values()) b.net = b.created + b.restored - b.cancelled - b.removed;
  const totals = [...buckets.values()].reduce((a, b) => { for (const k of Object.keys(a)) a[k] += b[k]; return a; }, { created: 0, restored: 0, cancelled: 0, removed: 0, changed: 0, cancellation_confirmed: 0, net: 0 });
  return { buckets: [...buckets.values()], totals, cancellations_by_arrival: [...cancellationsByArrival.values()], coverage_start: coverageStart, last_observed: lastObserved, sources: selectedSources.map(s => ({ property_id: s.property_id, platform: s.platform, started_at: s.started_at, last_observed_at: s.last_observed_at })) };
}
function compareMonths(events, states, o) {
  const { start, end } = range(o);
  const today = romeDateKey(o.now);
  if (today < start) return null;
  const anchor = today < end ? today : dateAt(time(end) - DAY);
  const [year, month, day] = anchor.split('-').map(Number);
  const currentStart = dateAt(Date.UTC(year, month - 1, 1));
  const previousStart = dateAt(Date.UTC(year, month - 2, 1));
  const elapsed = today < end ? day - 1 : day;
  const count = Math.min(elapsed, new Date(Date.UTC(year, month - 1, 0)).getUTCDate());
  if (!count || currentStart < start) return null;
  const selectedSources = states.filter(s => matches(s, o));
  const period = from => {
    const to = dateAt(time(from) + count * DAY);
    const available = selectedSources.length > 0 && selectedSources.every(s => s.started_at && s.last_observed_at && romeDateKey(s.started_at) <= from && romeDateKey(s.last_observed_at) >= dateAt(time(to) - DAY) && !(s.gaps || []).some(g => romeDateKey(g.start) < to && (!g.end || romeDateKey(g.end) >= from)));
    const totals = { created: 0, cancelled: 0, removed: 0, restored: 0, net: 0 };
    for (const e of events) {
      const date = romeDateKey(e.occurred_at);
      if (matches(e, o) && date >= from && date < to && Object.hasOwn(totals, e.kind)) totals[e.kind]++;
    }
    totals.net = totals.created + totals.restored - totals.cancelled - totals.removed;
    return { from, through: dateAt(time(to) - DAY), available, totals };
  };
  return { days: count, current: period(currentStart), previous: period(previousStart) };
}
async function getAnalytics(db, query = {}, now = new Date().toISOString()) {
  const options = optionsFromQuery(query, now);
  const [rows, properties, history] = await Promise.all([db.getBookings(null, null, { includeInactive: true }), db.getProperties(), readAnalytics(db)]);
  if (options.property && !properties.some(p => p.id === options.property)) { const e = new Error('Unknown property'); e.statusCode = 400; throw e; }
  const superseded = new Set(history.states.flatMap(s => s.superseded_rows || []));
  const current = reservationRows(rows).filter(b => !superseded.has(String(b.id))).map(clean);
  const cancelled = new Set(history.states.flatMap(s => Object.values(s.bookings).filter(b => b.status === 'cancelled').map(datesKey)));
  const overview = aggregate(current.filter(b => !cancelled.has(datesKey(b))), availabilityRows(rows), properties, options);
  const snapshots = history.snapshots.map(s => ({ date: s.snapshot_date, captured_at: s.captured_at, version: s.version, ...aggregate(s.bookings, s.availability, s.properties, options) }));
  const years = [...new Set([Number(romeDateKey(now).slice(0, 4)), ...rows.map(b => Number(iso(b.start_date).slice(0, 4))), ...history.events.map(e => Number(romeDateKey(e.occurred_at).slice(0, 4)))])].filter(Number.isFinite).sort();
  const legacy = typeof db.getStatsSnapshots === 'function' ? await db.getStatsSnapshots({ seasonYear: options.year, limit: 1000 }) : [];
  return { version: 1, generated_at: now, options, years, properties: properties.map(p => ({ id: p.id, name: p.name })), overview, movement: movement(history.events, history.states, options), movement_monthly: movement(history.events, history.states, { ...options, group: 'month' }), comparison: compareMonths(history.events, history.states, options), snapshots, legacy_snapshots: !options.property && !options.platform ? legacy : [], coverage: { journal_started_at: history.states.filter(s => s.started_at).map(s => s.started_at).sort()[0] || null, historical_inventory: false } };
}
async function handleAnalytics(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method && req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  try { return res.status(200).json(await getAnalytics(db, req.query)); }
  catch (e) { return res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Analytics unavailable' }); }
}
module.exports = { clean, reservationRows, sourceObservation, aggregate, movement, compareMonths, optionsFromQuery, recordAnalytics, getAnalytics, handleAnalytics };
