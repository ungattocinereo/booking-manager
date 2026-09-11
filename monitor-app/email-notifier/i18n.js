const TIME_ZONE = 'Europe/Rome';

const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre'
];

const SHORT_MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) throw new Error(`Invalid calendar date: ${value}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function datePartsInRome(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short'
  }).format(date);
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: values.hour,
    minute: values.minute,
    weekday: WEEKDAYS[weekdayIndex]
  };
}

function nights(startDate, endDate) {
  return Math.max(0, Math.round((parseDateOnly(endDate) - parseDateOnly(startDate)) / 86400000));
}

function nightsLabel(count) {
  return `${count} ${count === 1 ? 'notte' : 'notti'}`;
}

function formatStay(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const startDay = String(start.getUTCDate()).padStart(2, '0');
  const endDay = String(end.getUTCDate()).padStart(2, '0');
  const startMonth = start.getUTCMonth();
  const endMonth = end.getUTCMonth();
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  if (startMonth === endMonth && startYear === endYear) {
    return `${startDay} – ${endDay} ${MONTHS[endMonth]}`;
  }
  if (startYear === endYear) {
    return `${startDay} ${SHORT_MONTHS[startMonth]} – ${endDay} ${SHORT_MONTHS[endMonth]}`;
  }
  return `${startDay} ${SHORT_MONTHS[startMonth]} ${startYear} – ${endDay} ${SHORT_MONTHS[endMonth]} ${endYear}`;
}

function formatEventTimestamp(prefix, value, { includeMonth = true } = {}) {
  const parts = datePartsInRome(value);
  const month = includeMonth ? ` ${MONTHS[parts.month - 1]}` : '';
  return `${prefix} il ${parts.weekday} ${parts.day}${month} alle ${parts.hour}:${parts.minute}`;
}

function formatBookedAt(value) {
  return formatEventTimestamp('Prenotata', value);
}

function formatCancelledAt(value) {
  return formatEventTimestamp('Annullata', value);
}

function formatToday(value) {
  const parts = datePartsInRome(value);
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

function formatSubjectDate(value) {
  const parts = datePartsInRome(value);
  return `${parts.day} ${SHORT_MONTHS[parts.month - 1]}`;
}

module.exports = {
  MONTHS,
  SHORT_MONTHS,
  TIME_ZONE,
  WEEKDAYS,
  datePartsInRome,
  formatBookedAt,
  formatCancelledAt,
  formatStay,
  formatSubjectDate,
  formatToday,
  nights,
  nightsLabel,
  parseDateOnly
};
