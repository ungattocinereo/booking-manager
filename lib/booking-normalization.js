const DAY_MS = 86400000;
const BOOKING_FALLBACK_MAX_NIGHTS = 31;

function dateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const italian = value.trim().match(/^(\d{2})\/?(\d{2})\/?(\d{4})$/);
    if (italian) return `${italian[3]}-${italian[2]}-${italian[1]}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function dateMs(value) {
  const parts = dateOnly(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const aStartMs = dateMs(aStart);
  const aEndMs = dateMs(aEnd);
  const bStartMs = dateMs(bStart);
  const bEndMs = dateMs(bEnd);
  if ([aStartMs, aEndMs, bStartMs, bEndMs].some(value => value == null)) return false;
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

function nightsBetween(startDate, endDate) {
  const startMs = dateMs(startDate);
  const endMs = dateMs(endDate);
  if (startMs == null || endMs == null) return null;
  const nights = Math.round((endMs - startMs) / DAY_MS);
  return nights > 0 ? nights : null;
}

function isUnavailableBooking(booking) {
  const summary = String(booking?.raw_summary || '').toLowerCase();
  const type = String(booking?.booking_type || '').toLowerCase();
  return summary.includes('not available') ||
    summary.includes('closed') ||
    type === 'blocked' ||
    type === 'unavailable';
}

function hasGuestDetails(booking) {
  return Boolean(String(booking?.guest_name || '').trim()) || Number(booking?.guest_count) > 0;
}

function isUnavailableMarker(booking) {
  return isUnavailableBooking(booking) && !hasGuestDetails(booking);
}

function isOperationalBookingFallback(booking) {
  return booking?.operational_fallback === true;
}

function isActiveBooking(booking) {
  const active = booking?.active;
  return active !== false && active !== 0 && active !== '0' && String(active).toLowerCase() !== 'false';
}

function sameBookingIdentity(a, b) {
  if (a === b) return true;
  if (a?.id != null && b?.id != null) return String(a.id) === String(b.id);
  return false;
}

function isGroupedBookingClosure(booking, allBookings = []) {
  if (String(booking?.platform || '').toLowerCase() !== 'booking' || !isUnavailableMarker(booking)) return false;
  return allBookings.some(other =>
    !sameBookingIdentity(other, booking) &&
    other?.property_id === booking.property_id &&
    String(other?.platform || '').toLowerCase() === 'booking' &&
    dateOnly(other?.start_date) === dateOnly(booking?.start_date) &&
    dateOnly(other?.end_date) === dateOnly(booking?.end_date) &&
    isUnavailableMarker(other)
  );
}

function isRealReservationCandidate(booking, allBookings = []) {
  if (!booking || !isActiveBooking(booking) || isGroupedBookingClosure(booking, allBookings)) return false;
  if (isUnavailableMarker(booking)) return false;
  return true;
}

function hasOverlappingRealBooking(booking, allBookings = []) {
  if (!booking?.property_id) return false;
  return allBookings.some(other =>
    !sameBookingIdentity(other, booking) &&
    other?.property_id === booking.property_id &&
    isRealReservationCandidate(other, allBookings) &&
    dateRangesOverlap(booking.start_date, booking.end_date, other.start_date, other.end_date)
  );
}

function isBookingFallbackCandidate(booking, allBookings = []) {
  if (isOperationalBookingFallback(booking)) return true;
  if (!isActiveBooking(booking)) return false;
  if (String(booking?.platform || '').toLowerCase() !== 'booking') return false;
  if (!isUnavailableMarker(booking) || isGroupedBookingClosure(booking, allBookings)) return false;

  const nights = nightsBetween(booking.start_date, booking.end_date);
  if (!nights || nights > BOOKING_FALLBACK_MAX_NIGHTS) return false;
  return !hasOverlappingRealBooking(booking, allBookings);
}

function shouldHideBookingForDisplay(booking, allBookings = []) {
  if (!isUnavailableMarker(booking)) return false;
  return !isBookingFallbackCandidate(booking, allBookings);
}

function normalizeBookingsForDisplay(bookings = []) {
  const visible = [];
  for (const booking of bookings) {
    if (shouldHideBookingForDisplay(booking, bookings)) continue;
    visible.push(isBookingFallbackCandidate(booking, bookings)
      ? { ...booking, operational_fallback: true }
      : booking);
  }
  return visible;
}

function isRealGuestBooking(booking, allBookings = []) {
  if (isOperationalBookingFallback(booking) || isBookingFallbackCandidate(booking, allBookings)) return false;
  if (shouldHideBookingForDisplay(booking, allBookings)) return false;
  if (isUnavailableMarker(booking)) return false;
  return true;
}

function auditBookingRows(bookings = []) {
  const exactKeys = new Map();
  const overlaps = [];
  let hiddenMarkers = 0;
  let unavailableMarkers = 0;

  for (const booking of bookings) {
    const key = [
      booking.property_id,
      booking.platform,
      dateOnly(booking.start_date),
      dateOnly(booking.end_date),
    ].join('|');
    exactKeys.set(key, (exactKeys.get(key) || 0) + 1);
    if (isUnavailableMarker(booking)) unavailableMarkers++;
    if (shouldHideBookingForDisplay(booking, bookings)) hiddenMarkers++;
  }

  const exactDuplicates = [...exactKeys.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));

  for (let i = 0; i < bookings.length - 1; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const a = bookings[i];
      const b = bookings[j];
      if (a.property_id !== b.property_id) continue;
      if (!dateRangesOverlap(a.start_date, a.end_date, b.start_date, b.end_date)) continue;
      overlaps.push({ a, b });
    }
  }

  return {
    total: bookings.length,
    visible: normalizeBookingsForDisplay(bookings).length,
    hiddenMarkers,
    unavailableMarkers,
    exactDuplicates,
    overlaps,
  };
}

module.exports = {
  dateOnly,
  dateMs,
  dateRangesOverlap,
  nightsBetween,
  isUnavailableBooking,
  hasGuestDetails,
  isUnavailableMarker,
  isOperationalBookingFallback,
  isGroupedBookingClosure,
  hasOverlappingRealBooking,
  isBookingFallbackCandidate,
  shouldHideBookingForDisplay,
  normalizeBookingsForDisplay,
  isRealGuestBooking,
  auditBookingRows,
};
