const PROPERTIES = {
  vingtage: { name: 'Vingtage', group: 'dragone', order: 1 },
  orange: { name: 'Orange', group: 'dragone', order: 2 },
  solo: { name: 'Solo', group: 'dragone', order: 3 },
  youth: { name: 'Youth', group: 'dragone', order: 4 },
  awesome: { name: 'Awesome', group: 'apartments', order: 5 },
  carina: { name: 'Carina', group: 'apartments', order: 6 },
  harmony: { name: 'Harmony', group: 'apartments', order: 7 },
  royal: { name: 'Royal', group: 'apartments', order: 8 },
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
  const summary = String(booking.raw_summary || '').toLowerCase();
  const guest = String(booking.guest_name || '').trim();
  return !guest && ['not available', 'closed', 'blocked'].some((word) => summary.includes(word));
}

function platformIcon(platform) {
  const raw = String(platform || '').toLowerCase();
  if (raw.includes('airbnb')) return '🩷';
  if (raw.includes('booking')) return '🔵';
  if (raw.includes('direct')) return '🤝';
  return '•';
}

function formatEntry(booking) {
  const meta = PROPERTIES[booking.property_id] || {
    name: String(booking.property_id || '?'),
    group: 'unknown',
    order: 99,
  };
  return {
    property: meta.name,
    property_id: booking.property_id,
    group: meta.group,
    order: meta.order,
    guest: booking.guest_name || '—',
    platform: booking.platform || '',
    icon: platformIcon(booking.platform),
    start: dateOnly(booking.start_date),
    end: dateOnly(booking.end_date),
  };
}

function sortEntries(items) {
  const groupOrder = { apartments: 0, dragone: 1 };
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
  const bookings = await db.getBookings(null, targetDate);
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
