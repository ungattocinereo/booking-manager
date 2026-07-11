const DAY_MS = 86400000;
const crypto = require('crypto');
const { isRealGuestBooking, isUnavailableMarker } = require('../../lib/booking-normalization');
const { todayInRome } = require('../../api/_helpers');

const STATS_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10];

function parseLocalDate(iso) {
  if (iso instanceof Date) {
    const date = new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseCapturedAt(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const raw = String(value).trim();
  // SQLite CURRENT_TIMESTAMP and Postgres TIMESTAMP values are stored as UTC in
  // this project, but neither necessarily carries an explicit offset.
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function romeDateKey(value = new Date()) {
  const date = parseCapturedAt(value) || new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function toLocalIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

function seasonRange(year = Number(todayInRome().slice(0, 4))) {
  const start = new Date(year, 3, 1);
  const end = new Date(year, 11, 1);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { year, start, end, days: daysBetween(start, end) };
}

function overlapsRange(booking, rangeStart, rangeEnd) {
  const start = parseLocalDate(booking.start_date);
  const end = parseLocalDate(booking.end_date);
  return start < rangeEnd && end > rangeStart;
}

function clippedNights(booking, rangeStart, rangeEnd) {
  const start = parseLocalDate(booking.start_date);
  const end = parseLocalDate(booking.end_date);
  const clippedStart = start > rangeStart ? start : rangeStart;
  const clippedEnd = end < rangeEnd ? end : rangeEnd;
  return daysBetween(clippedStart, clippedEnd);
}

function nightsBetween(startDate, endDate) {
  return daysBetween(parseLocalDate(startDate), parseLocalDate(endDate));
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function stayBucket(nights) {
  if (nights <= 1) return '1';
  if (nights === 2) return '2';
  if (nights === 3) return '3';
  if (nights <= 6) return '4-6';
  return '7+';
}

function buildOccupiedNightSets(bookings, rangeStart, rangeEnd) {
  const byProperty = new Map();

  for (const booking of bookings) {
    if (!booking.property_id) continue;
    const start = parseLocalDate(booking.start_date);
    const end = parseLocalDate(booking.end_date);
    const clippedStart = new Date(Math.max(start.getTime(), rangeStart.getTime()));
    const clippedEnd = new Date(Math.min(end.getTime(), rangeEnd.getTime()));
    if (clippedEnd <= clippedStart) continue;

    if (!byProperty.has(booking.property_id)) byProperty.set(booking.property_id, new Set());
    const occupiedDates = byProperty.get(booking.property_id);
    for (const day = new Date(clippedStart); day < clippedEnd; day.setDate(day.getDate() + 1)) {
      occupiedDates.add(toLocalIso(day));
    }
  }

  return byProperty;
}

function positiveMetric(value) {
  return Number(value) > 0;
}

function snapshotQualityRank(snapshot) {
  const quality = snapshot?.payload?.data_quality;
  const hasPositiveMetrics = [snapshot?.booking_count, snapshot?.occupied_nights, snapshot?.guest_count]
    .some(positiveMetric);
  // A structurally valid empty season remains usable, but it must never replace
  // a meaningful snapshot from the same day. This is the guard against a
  // temporarily empty upstream/database state recreating the historical zero
  // spikes that prompted this fix.
  if (quality?.valid === true) return hasPositiveMetrics ? 3 : 1;
  if (quality?.valid === false) return 0;
  return hasPositiveMetrics ? 2 : 0;
}

function syncStatusRank(snapshot) {
  switch (String(snapshot?.payload?.sync_status || '').toLowerCase()) {
    case 'success': return 3;
    case 'partial': return 1;
    case 'failed': return 0;
    // Manual snapshots are considered complete unless the caller explicitly
    // marks them partial/failed.
    default: return 3;
  }
}

function capturedAtMs(snapshot) {
  return parseCapturedAt(snapshot?.captured_at)?.getTime() || 0;
}

function compareSnapshotPriority(a, b) {
  const qualityA = snapshotQualityRank(a);
  const qualityB = snapshotQualityRank(b);

  // An invalid snapshot can never beat a usable one. Once both snapshots are
  // usable, sync completeness is more important than the presence of the new
  // explicit quality metadata: a partial sync must not replace a meaningful
  // legacy snapshot from the same day.
  if ((qualityA === 0) !== (qualityB === 0)) return qualityA - qualityB;
  if ((qualityA >= 2) !== (qualityB >= 2)) return qualityA - qualityB;

  const statusDelta = syncStatusRank(a) - syncStatusRank(b);
  if (statusDelta !== 0) return statusDelta;

  const qualityDelta = qualityA - qualityB;
  if (qualityDelta !== 0) return qualityDelta;

  return capturedAtMs(a) - capturedAtMs(b) || Number(a?.id || 0) - Number(b?.id || 0);
}

function shouldReplaceDailySnapshot(existing, incoming) {
  if (!existing) return true;
  return compareSnapshotPriority(incoming, existing) >= 0;
}

function isEmptyStatsSnapshot(snapshot) {
  return ![snapshot?.booking_count, snapshot?.occupied_nights, snapshot?.guest_count].some(positiveMetric);
}

function prepareEmptySnapshotWrite(existing, incoming) {
  const quality = incoming?.payload?.data_quality || {};
  const warnings = Array.isArray(quality.warnings) ? quality.warnings : [];
  const confirmable = isEmptyStatsSnapshot(incoming) &&
    quality.valid === false &&
    String(incoming?.payload?.sync_status || '').toLowerCase() === 'success' &&
    Number(incoming?.payload?.feed_error_count || 0) === 0 &&
    Number(incoming?.payload?.property_count || 0) > 0 &&
    !warnings.includes('missing_property_inventory') &&
    !warnings.includes('unknown_booking_properties');

  if (!confirmable) return { snapshot: incoming, confirmed: false, quarantined: false };

  const previousCandidate = Number(existing?.payload?.empty_candidate?.count) ||
    (existing && isEmptyStatsSnapshot(existing) && existing?.payload?.data_quality?.valid === false ? 1 : 0);
  const candidate = {
    count: previousCandidate + 1,
    last_at: incoming.captured_at,
    source: incoming.source || 'sync'
  };

  if (previousCandidate >= 1) {
    return {
      confirmed: true,
      quarantined: false,
      snapshot: {
        ...incoming,
        payload: {
          ...(incoming.payload || {}),
          empty_candidate: { ...candidate, confirmed: true },
          data_quality: {
            ...quality,
            valid: true,
            status: 'empty_confirmed',
            empty_expected: true
          }
        }
      }
    };
  }

  if (existing) {
    return {
      snapshot: incoming,
      confirmed: false,
      quarantined: true,
      existingPayload: { ...(existing.payload || {}), empty_candidate: candidate }
    };
  }

  return {
    confirmed: false,
    quarantined: true,
    snapshot: {
      ...incoming,
      payload: { ...(incoming.payload || {}), empty_candidate: candidate }
    }
  };
}

/**
 * Collapse legacy snapshot history without deleting production data.
 *
 * Rows explicitly marked valid by the new writer win over legacy rows. Within
 * the same quality tier, the latest snapshot for the Rome calendar day wins.
 * Legacy all-zero rows are hidden only when the season has useful/explicitly
 * valid history; a new explicitly-valid empty snapshot remains visible.
 */
function canonicalizeStatsSnapshots(rows = [], options = {}) {
  const groups = new Map();

  for (const row of rows.filter(Boolean)) {
    const snapshotDate = String(
      row.snapshot_date || row.payload?.snapshot_date || romeDateKey(row.captured_at)
    ).slice(0, 10);
    const snapshot = { ...row, snapshot_date: snapshotDate };
    const groupKey = `${snapshot.season_year ?? 'unknown'}:${snapshotDate}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(snapshot);
  }

  const canonical = [...groups.values()].map(group => group
    .slice()
    .sort((a, b) => compareSnapshotPriority(b, a))[0]);

  const hasUsefulHistory = canonical.some(snapshot => snapshotQualityRank(snapshot) > 0);
  const ignoredLegacyZeroSnapshots = hasUsefulHistory
    ? rows.filter(snapshot => snapshotQualityRank(snapshot) === 0 && snapshot?.payload?.data_quality?.valid !== true).length
    : 0;
  const filtered = hasUsefulHistory
    ? canonical.filter(snapshot => snapshotQualityRank(snapshot) > 0)
    : canonical;

  filtered.sort((a, b) => capturedAtMs(a) - capturedAtMs(b) || String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
  const limit = Math.max(1, Number(options.limit) || filtered.length || 1);
  const limited = filtered.slice(-limit);

  if (limited.length > 0) {
    const lastIndex = limited.length - 1;
    const last = limited[lastIndex];
    limited[lastIndex] = {
      ...last,
      payload: {
        ...(last.payload || {}),
        history_quality: {
          raw_snapshots: rows.length,
          canonical_days: filtered.length,
          collapsed_duplicates: Math.max(0, rows.length - groups.size),
          ignored_legacy_zero_snapshots: ignoredLegacyZeroSnapshots
        }
      }
    };
  }

  return limited;
}

function stableBookingKey(booking) {
  const identity = [
    booking?.property_id || '',
    String(booking?.platform || 'other').toLowerCase(),
    String(booking?.start_date || '').slice(0, 10),
    String(booking?.end_date || '').slice(0, 10)
  ].join('|');
  return `b1_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
}

function isActiveProperty(property) {
  return property?.active !== false && Number(property?.active) !== 0;
}

function computeBookingStatsSnapshot({
  bookings,
  properties = [],
  source = 'sync',
  seasonYear,
  capturedAt,
  syncStatus,
  feedErrorCount,
  allowEmpty = false
} = {}) {
  const season = seasonRange(seasonYear);
  const allBookings = bookings || [];
  const configuredPropertyIds = new Set(
    (properties || []).filter(isActiveProperty).map(property => property.id).filter(Boolean)
  );
  const bookingPropertyIds = new Set(allBookings.map(booking => booking.property_id).filter(Boolean));
  const unknownPropertyIds = [...bookingPropertyIds].filter(propertyId => !configuredPropertyIds.has(propertyId));
  // Never hide booking rows merely because property configuration is damaged.
  // The union keeps the denominator conservative while data_quality marks the
  // snapshot invalid so it cannot replace trusted history.
  const inventoryPropertyIds = new Set([...configuredPropertyIds, ...bookingPropertyIds]);
  const inventoryBookings = allBookings
    .filter(booking => inventoryPropertyIds.has(booking.property_id));
  const realBookings = inventoryBookings
    .filter(booking => isRealGuestBooking(booking, allBookings))
    .filter(booking => overlapsRange(booking, season.start, season.end));
  const unavailableBookings = inventoryBookings
    .filter(booking => isUnavailableMarker(booking))
    .filter(booking => overlapsRange(booking, season.start, season.end));

  const propertyCount = inventoryPropertyIds.size;
  const grossNights = season.days * propertyCount;
  const monthlyNights = {};
  const monthlyBookings = {};
  const monthlyGuests = {};
  const platformCounts = {};
  const countryCounts = {};
  const checkinDays = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  const stayBuckets = { '1': 0, '2': 0, '3': 0, '4-6': 0, '7+': 0 };
  let guestCount = 0;
  let bookingsWithGuests = 0;
  let stayTotal = 0;

  for (const month of STATS_MONTHS) {
    const key = `${season.year}-${String(month + 1).padStart(2, '0')}`;
    monthlyNights[key] = 0;
    monthlyBookings[key] = 0;
    monthlyGuests[key] = 0;
  }

  for (const booking of realBookings) {
    increment(platformCounts, booking.platform || 'other');

    const country = String(booking.guest_country || '').trim().toLowerCase();
    if (country) increment(countryCounts, country);

    const guests = Number(booking.guest_count) || 0;
    if (guests > 0) {
      guestCount += guests;
      bookingsWithGuests++;
    }

    const stayNights = nightsBetween(booking.start_date, booking.end_date);
    if (stayNights > 0) {
      stayTotal += stayNights;
      increment(stayBuckets, stayBucket(stayNights));
    }

    const start = parseLocalDate(booking.start_date);
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    increment(checkinDays, dayKeys[start.getDay()]);

    for (const month of STATS_MONTHS) {
      const key = `${season.year}-${String(month + 1).padStart(2, '0')}`;
      const monthStart = new Date(season.year, month, 1);
      const monthEnd = new Date(season.year, month + 1, 1);
      const monthNights = clippedNights(booking, monthStart, monthEnd);
      if (monthNights > 0) monthlyGuests[key] += guests;
    }

    const startMonthKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyBookings[startMonthKey] !== undefined) monthlyBookings[startMonthKey]++;
  }

  const occupiedNightSets = buildOccupiedNightSets(realBookings, season.start, season.end);
  const unavailableNightSets = buildOccupiedNightSets(unavailableBookings, season.start, season.end);
  const propertyOccupiedNights = {};
  const propertyUnavailableNights = {};
  const propertySellableNights = {};
  let occupiedNights = 0;
  for (const [propertyId, dates] of occupiedNightSets.entries()) {
    propertyOccupiedNights[propertyId] = dates.size;
    occupiedNights += dates.size;
    for (const date of dates) {
      const monthKey = date.slice(0, 7);
      if (monthlyNights[monthKey] !== undefined) monthlyNights[monthKey]++;
    }
  }

  let unavailableNights = 0;
  for (const propertyId of inventoryPropertyIds) {
    const blockedDates = unavailableNightSets.get(propertyId) || new Set();
    const occupiedDates = occupiedNightSets.get(propertyId) || new Set();
    let blockedOnlyCount = 0;
    for (const date of blockedDates) {
      // A guest reservation is authoritative when a stale technical block
      // overlaps it; subtract only genuinely unsellable, unoccupied nights.
      if (!occupiedDates.has(date)) blockedOnlyCount++;
    }
    propertyUnavailableNights[propertyId] = blockedOnlyCount;
    propertySellableNights[propertyId] = Math.max(0, season.days - blockedOnlyCount);
    unavailableNights += blockedOnlyCount;
  }

  const sellableNights = Math.max(0, grossNights - unavailableNights);

  const occupancyPercent = sellableNights > 0
    ? Number(((occupiedNights / sellableNights) * 100).toFixed(2))
    : 0;
  const avgStay = realBookings.length ? Number((stayTotal / realBookings.length).toFixed(2)) : 0;
  const avgGuests = bookingsWithGuests ? Number((guestCount / bookingsWithGuests).toFixed(2)) : 0;

  const resolvedCapturedAt = capturedAt || new Date().toISOString();
  const snapshotDate = romeDateKey(resolvedCapturedAt);
  const warnings = [];
  if (realBookings.length === 0) warnings.push('no_guest_bookings');
  if (configuredPropertyIds.size === 0) warnings.push('missing_property_inventory');
  if (unknownPropertyIds.length > 0) warnings.push('unknown_booking_properties');
  if (String(syncStatus || '').toLowerCase() === 'partial' || Number(feedErrorCount) > 0) {
    warnings.push('partial_sync');
  }
  if (unavailableNights > grossNights) warnings.push('unavailable_exceeds_inventory');
  const structurallyValid = configuredPropertyIds.size > 0 &&
    unknownPropertyIds.length === 0 && sellableNights >= occupiedNights;
  const valid = structurallyValid && (realBookings.length > 0 || allowEmpty === true);

  return {
    captured_at: resolvedCapturedAt,
    snapshot_date: snapshotDate,
    source,
    season_year: season.year,
    booking_count: realBookings.length,
    occupied_nights: occupiedNights,
    guest_count: guestCount,
    occupancy_percent: occupancyPercent,
    avg_stay: avgStay,
    monthly_nights: monthlyNights,
    monthly_bookings: monthlyBookings,
    platform_counts: platformCounts,
    country_counts: countryCounts,
    payload: {
      season_start: toLocalIso(season.start),
      season_end: toLocalIso(new Date(season.end.getTime() - DAY_MS)),
      property_count: propertyCount,
      // Keep potential_nights for old clients, but make it the corrected
      // sellable denominator used by occupancy_percent.
      potential_nights: sellableNights,
      gross_nights: grossNights,
      sellable_nights: sellableNights,
      unavailable_nights: unavailableNights,
      calculation_version: 2,
      denominator: 'sellable_nights',
      avg_guests: avgGuests,
      checkin_days: checkinDays,
      stay_buckets: stayBuckets,
      monthly_guests: monthlyGuests,
      property_occupied_nights: propertyOccupiedNights,
      property_unavailable_nights: propertyUnavailableNights,
      property_sellable_nights: propertySellableNights,
      booking_keys: [...new Set(realBookings.map(stableBookingKey))].sort(),
      snapshot_date: snapshotDate,
      sync_status: syncStatus || null,
      feed_error_count: Math.max(0, Number(feedErrorCount) || 0),
      data_quality: {
        valid,
        status: valid ? (warnings.length ? 'warning' : 'ok') : (realBookings.length === 0 ? 'empty' : 'invalid'),
        warnings,
        empty_expected: allowEmpty === true,
        input_rows: allBookings.length,
        guest_booking_rows: realBookings.length,
        unavailable_rows: unavailableBookings.length,
        unknown_property_ids: unknownPropertyIds.sort()
      }
    }
  };
}

async function recordBookingStatsSnapshot(db, options = {}) {
  const [bookings, properties] = await Promise.all([
    db.getBookings(),
    db.getProperties()
  ]);
  const snapshot = computeBookingStatsSnapshot({
    bookings,
    properties,
    source: options.source || 'sync',
    seasonYear: options.seasonYear,
    capturedAt: options.capturedAt,
    syncStatus: options.syncStatus,
    feedErrorCount: options.feedErrorCount,
    allowEmpty: options.allowEmpty
  });
  const storageResult = await db.createStatsSnapshot(snapshot);
  const storedSnapshot = storageResult?.snapshot || snapshot;
  return {
    ...storedSnapshot,
    storage: {
      saved: !storageResult?.skipped && !storageResult?.quarantined,
      skipped: Boolean(storageResult?.skipped),
      quarantined: Boolean(storageResult?.quarantined),
      confirmed_empty: Boolean(storageResult?.confirmed),
      existing_id: storageResult?.existingId || storageResult?.rows?.[0]?.id || storageResult?.lastID || null
    }
  };
}

module.exports = {
  buildOccupiedNightSets,
  canonicalizeStatsSnapshots,
  computeBookingStatsSnapshot,
  isEmptyStatsSnapshot,
  prepareEmptySnapshotWrite,
  romeDateKey,
  recordBookingStatsSnapshot,
  shouldReplaceDailySnapshot
};
