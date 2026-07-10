const DAY_MS = 86400000;
const { isRealGuestBooking } = require('../../lib/booking-normalization');
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

function computeBookingStatsSnapshot({ bookings, properties = [], source = 'sync', seasonYear, capturedAt } = {}) {
  const season = seasonRange(seasonYear);
  const realBookings = (bookings || [])
    .filter(booking => isRealGuestBooking(booking, bookings || []))
    .filter(booking => overlapsRange(booking, season.start, season.end));

  const propertyCount = properties.length || new Set(realBookings.map(booking => booking.property_id).filter(Boolean)).size;
  const potentialNights = season.days * Math.max(propertyCount, 1);
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
  const propertyOccupiedNights = {};
  let occupiedNights = 0;
  for (const [propertyId, dates] of occupiedNightSets.entries()) {
    propertyOccupiedNights[propertyId] = dates.size;
    occupiedNights += dates.size;
    for (const date of dates) {
      const monthKey = date.slice(0, 7);
      if (monthlyNights[monthKey] !== undefined) monthlyNights[monthKey]++;
    }
  }

  const occupancyPercent = potentialNights > 0
    ? Number(((occupiedNights / potentialNights) * 100).toFixed(2))
    : 0;
  const avgStay = realBookings.length ? Number((stayTotal / realBookings.length).toFixed(2)) : 0;
  const avgGuests = bookingsWithGuests ? Number((guestCount / bookingsWithGuests).toFixed(2)) : 0;

  return {
    captured_at: capturedAt || new Date().toISOString(),
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
      potential_nights: potentialNights,
      avg_guests: avgGuests,
      checkin_days: checkinDays,
      stay_buckets: stayBuckets,
      monthly_guests: monthlyGuests,
      property_occupied_nights: propertyOccupiedNights
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
    capturedAt: options.capturedAt
  });
  await db.createStatsSnapshot(snapshot);
  return snapshot;
}

module.exports = {
  buildOccupiedNightSets,
  computeBookingStatsSnapshot,
  recordBookingStatsSnapshot
};
