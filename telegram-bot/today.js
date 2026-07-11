const ROME_TIME_ZONE = 'Europe/Rome';

const PROPERTY_NAMES = Object.freeze({
  orange: 'Orange Room',
  solo: 'Solo Room',
  youth: 'Youth Room',
  vingtage: 'Vingtage Room',
  awesome: 'Awesome Apartments',
  central: 'Central Room',
  carina: 'Carina',
  harmony: 'Harmony',
  royal: 'Royal',
  susy: 'Villa Susy',
  carmela: 'Carmela'
});

const TODAY_COMMAND_RE = /^\/today(?:@\w+)?$/i;
const TODAY_DETAILS_COMMAND_RE = /^\/today(?:-|_)details(?:@\w+)?$/i;

function dateOnlyInTimeZone(value = new Date(), timeZone = ROME_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function shiftDateOnly(iso, days) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function getRomeDate(daysOffset = 0, now = new Date()) {
  return shiftDateOnly(dateOnlyInTimeZone(now), daysOffset);
}

function dateOnlyMs(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function nightsBetween(start, end) {
  const startMs = dateOnlyMs(start);
  const endMs = dateOnlyMs(end);
  if (startMs == null || endMs == null) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 86400000));
}

function fmtDate(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(iso || '—');
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]}`;
}

function pluralNights(nights) {
  const abs = Math.abs(Number(nights) || 0);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'ночей';
  if (last === 1) return 'ночь';
  if (last >= 2 && last <= 4) return 'ночи';
  return 'ночей';
}

function platformIcon(platform) {
  const normalized = String(platform || '').toLowerCase();
  if (normalized.includes('airbnb')) return '🩷';
  if (normalized.includes('booking')) return '🔵';
  return '⬜';
}

function countryToFlag(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return '';
  return String.fromCodePoint(...[...normalized].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hasGuestDetails(booking) {
  return Boolean(String(booking?.guest_name || '').trim()) || Number(booking?.guest_count) > 0;
}

function isUnavailableMarker(booking) {
  const type = String(booking?.booking_type || '').toLowerCase();
  const summary = String(booking?.raw_summary || '').toLowerCase();
  const unavailable = type === 'blocked' || type === 'unavailable' ||
    summary.includes('not available') || summary.includes('closed');
  return unavailable && !hasGuestDetails(booking);
}

function filterRealBookings(bookings = []) {
  return (Array.isArray(bookings) ? bookings : []).filter(booking => {
    if (!booking) return false;
    const active = booking.active;
    if (active === false || active === 0 || active === '0' || String(active).toLowerCase() === 'false') return false;
    if (isUnavailableMarker(booking)) return false;
    const start = String(booking.start_date || '').slice(0, 10);
    const end = String(booking.end_date || '').slice(0, 10);
    return Boolean(dateOnlyMs(start) != null && dateOnlyMs(end) != null && start < end);
  });
}

function classifyTodayBookings(bookings, today) {
  const realBookings = filterRealBookings(bookings);
  return {
    arrivals: realBookings.filter(booking => booking.start_date === today),
    checkouts: realBookings.filter(booking => booking.end_date === today),
    staying: realBookings.filter(booking => booking.start_date < today && booking.end_date > today)
  };
}

function sortByProperty(bookings) {
  return [...bookings].sort((a, b) => {
    const aName = PROPERTY_NAMES[a.property_id] || a.property_id || '';
    const bName = PROPERTY_NAMES[b.property_id] || b.property_id || '';
    return aName.localeCompare(bName, 'ru');
  });
}

function guestSuffix(booking) {
  const flag = countryToFlag(booking.guest_country);
  const guest = String(booking.guest_name || '').trim();
  return guest ? ` — ${escapeHtml(guest)}${flag ? ` ${flag}` : ''}` : '';
}

function formatTodayLine(booking, detail) {
  const propertyName = PROPERTY_NAMES[booking.property_id] || booking.property_id || 'Неизвестный объект';
  return `${platformIcon(booking.platform)} ${escapeHtml(propertyName)} (${escapeHtml(detail)})${guestSuffix(booking)}`;
}

function formatSection(title, bookings, formatter, emptyText) {
  const lines = [`<b>${title}</b>`];
  if (!bookings.length) {
    lines.push(emptyText);
    return lines.join('\n');
  }
  for (const booking of sortByProperty(bookings)) lines.push(formatter(booking));
  return lines.join('\n');
}

function formatTodayArrivals(bookings, today) {
  const { arrivals } = classifyTodayBookings(bookings, today);
  const lines = [`📥 <b>Заезды сегодня (${fmtDate(today)})</b>`];
  if (!arrivals.length) {
    lines.push('', 'Заездов сегодня нет');
    return lines.join('\n');
  }
  lines.push('');
  for (const booking of sortByProperty(arrivals)) {
    const nights = nightsBetween(booking.start_date, booking.end_date);
    lines.push(formatTodayLine(
      booking,
      `${nights} ${pluralNights(nights)}, выезд ${fmtDate(booking.end_date)}`
    ));
  }
  return lines.join('\n').trim();
}

function formatTodayDetails(bookings, today) {
  const { arrivals, checkouts, staying } = classifyTodayBookings(bookings, today);
  return [
    `🏠 <b>Сегодня подробно (${fmtDate(today)})</b>`,
    formatSection('Заезды', arrivals, booking => {
      const nights = nightsBetween(booking.start_date, booking.end_date);
      return formatTodayLine(booking, `${nights} ${pluralNights(nights)}, выезд ${fmtDate(booking.end_date)}`);
    }, 'Заездов нет'),
    formatSection('Выезды', checkouts, booking => {
      const nights = nightsBetween(booking.start_date, booking.end_date);
      return formatTodayLine(booking, `с ${fmtDate(booking.start_date)}, ${nights} ${pluralNights(nights)}`);
    }, 'Выездов нет'),
    formatSection('Остаются', staying, booking => {
      const remainingNights = nightsBetween(today, booking.end_date);
      return formatTodayLine(booking, `до ${fmtDate(booking.end_date)}, еще ${remainingNights} ${pluralNights(remainingNights)}`);
    }, 'Никто не остается')
  ].join('\n\n').trim();
}

function parseCommand(text) {
  const match = String(text || '').trim().match(/^\/([a-z0-9_-]+)(?:@\w+)?(?:\s+(.+))?$/i);
  if (!match) return null;
  return { command: match[1].toLowerCase(), arg: String(match[2] || '').trim().toLowerCase() };
}

module.exports = {
  PROPERTY_NAMES,
  TODAY_COMMAND_RE,
  TODAY_DETAILS_COMMAND_RE,
  classifyTodayBookings,
  countryToFlag,
  escapeHtml,
  filterRealBookings,
  fmtDate,
  formatTodayArrivals,
  formatTodayDetails,
  getRomeDate,
  isUnavailableMarker,
  nightsBetween,
  parseCommand,
  platformIcon,
  pluralNights,
  shiftDateOnly
};
