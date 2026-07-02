const { normalizeBookingsForDisplay, isUnavailableMarker } = require('./booking-normalization');

const PROPERTIES = {
  awesome: { name: 'Awesome', group: 'dragone', location: 'Dragone', order: 1 },
  central: { name: 'Central', group: 'dragone', location: 'Dragone', order: 2 },
  orange: { name: 'Orange', group: 'dragone', location: 'Dragone', order: 3 },
  vingtage: { name: 'Vingtage', group: 'dragone', location: 'Dragone', order: 4 },
  youth: { name: 'Youth', group: 'dragone', location: 'Dragone', order: 5 },
  solo: { name: 'Solo', group: 'dragone', location: 'Dragone', order: 6 },
  carina: { name: 'Carina', group: 'dipino', location: 'Dipino', order: 7 },
  royal: { name: 'Royal', group: 'dipino', location: 'Dipino', order: 8 },
  harmony: { name: 'Harmony', group: 'dipino', location: 'Dipino', order: 9 },
  susy: { name: 'Villa Susy', group: 'susy', location: 'Villa Susy', order: 10 },
  carmela: { name: 'Carmela', group: 'oliva', location: 'Oliva', order: 11 },
};

function todayRome() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function isBlocked(booking) {
  return isUnavailableMarker(booking);
}

function platformIcon(platform) {
  const raw = String(platform || '').toLowerCase();
  if (raw.includes('airbnb')) return '🩷';
  if (raw.includes('booking')) return '🔵';
  if (raw.includes('direct')) return '🤝';
  return '•';
}

function daysBetween(start, end) {
  const startParts = String(start || '').split('-').map(Number);
  const endParts = String(end || '').split('-').map(Number);
  if (startParts.length !== 3 || endParts.length !== 3) return null;
  const startUtc = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const endUtc = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
  const diff = Math.round((endUtc - startUtc) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

function formatEntry(booking) {
  const meta = PROPERTIES[booking.property_id] || {
    name: String(booking.property_id || '?'),
    group: 'unknown',
    location: 'Unknown',
    order: 99,
  };
  const start = dateOnly(booking.start_date);
  const end = dateOnly(booking.end_date);
  return {
    property: meta.name,
    property_id: booking.property_id,
    group: meta.group,
    location: meta.location,
    order: meta.order,
    guest: booking.guest_name || '—',
    platform: booking.platform || '',
    icon: platformIcon(booking.platform),
    start,
    end,
    nights: daysBetween(start, end),
  };
}

function sortEntries(items) {
  const groupOrder = { dragone: 0, dipino: 1, susy: 2, oliva: 3 };
  return items.sort((a, b) => (
    (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9)
    || a.order - b.order
    || a.property.localeCompare(b.property)
  ));
}

function lineWithGuest(item) {
  const guest = item.guest && item.guest !== '—' ? ` — ${item.guest}` : '';
  return `${item.icon} ${item.property}${guest}`;
}

function roomList(items) {
  return items.map((item) => `${item.icon} ${item.property}`).join(' · ') || '—';
}

function buildDisplayText({ date, checkIns, checkOuts, occupied }) {
  const lines = [
    '🏡 Сегодня гости',
    `📥 Заезды: ${checkIns.length}`,
  ];

  if (checkIns.length) {
    lines.push(...checkIns.slice(0, 4).map(lineWithGuest));
  } else {
    lines.push('✅ Заездов нет');
  }

  if (checkOuts.length) {
    lines.push('');
    lines.push(`📤 Выезды: ${roomList(checkOuts)}`);
  }

  if (occupied.length) {
    lines.push('');
    lines.push(`🛏 Живут: ${roomList(occupied)}`);
  }

  lines.push('');
  lines.push(`🕘 ${date}`);
  return lines.join('\n');
}

async function buildTodayWidgetPayload(db, targetDate = todayRome()) {
  const bookings = normalizeBookingsForDisplay(await db.getBookings(null, targetDate));
  const checkIns = [];
  const checkOuts = [];
  const occupied = [];

  for (const booking of bookings) {
    if (isBlocked(booking)) continue;
    const start = dateOnly(booking.start_date);
    const end = dateOnly(booking.end_date);
    const entry = formatEntry(booking);

    if (start === targetDate) checkIns.push(entry);
    if (end === targetDate) checkOuts.push(entry);
    if (start < targetDate && targetDate < end && entry.guest !== '—') occupied.push(entry);
  }

  sortEntries(checkIns);
  sortEntries(checkOuts);
  sortEntries(occupied);

  return {
    status: 'ok',
    date: targetDate,
    updated_at: new Date().toISOString(),
    check_ins: checkIns,
    check_outs: checkOuts,
    occupied,
    display_text: buildDisplayText({ date: targetDate, checkIns, checkOuts, occupied }),
  };
}

module.exports = {
  buildTodayWidgetPayload,
};
