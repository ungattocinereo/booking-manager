const fetch = require('node-fetch');

const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');
const { formatBooking, formatCleaningTask } = require('./_helpers');
const {
  PROPERTY_NAMES,
  countryToFlag,
  escapeHtml,
  filterRealBookings,
  fmtDate,
  formatTodayArrivals,
  formatTodayDetails,
  getRomeDate,
  nightsBetween,
  parseCommand,
  platformIcon,
  pluralNights
} = require('../telegram-bot/today');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FAMILY_CHAT_ID = process.env.FAMILY_CHAT_ID;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

// ── Telegram API ────────────────────────────────────────

async function sendMessage(chatId, text, parseMode = 'HTML') {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode })
  });
}

async function sendChatAction(chatId, action = 'typing') {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action })
  });
}

// ── Helpers ──────────────────────────────────────────────

function getDate(daysOffset = 0) {
  return getRomeDate(daysOffset);
}

async function ensureDb() {
  if (!db.pool && !db.db) {
    await db.init();
  }
}

async function fetchBookings(params = {}) {
  try {
    await ensureDb();
    const rows = await db.getBookings(params.property_id, params.from_date);
    return filterRealBookings(rows.map(formatBooking));
  } catch (e) {
    console.error('Database error:', e.message);
    return null;
  }
}

async function fetchCleaningTasks(params = {}) {
  try {
    await ensureDb();
    const rows = await db.getCleaningTasks(params.cleaner_id, params.from_date);
    return rows.map(formatCleaningTask);
  } catch (e) {
    console.error('Database error:', e.message);
    return null;
  }
}

// ── Formatters ───────────────────────────────────────────

function formatBookings(bookings, title) {
  if (!bookings || bookings.length === 0) return `📅 ${title}\n\nНет бронирований`;
  bookings.sort((a, b) => a.start_date.localeCompare(b.start_date));
  const groups = {};
  for (const b of bookings) {
    if (!groups[b.start_date]) groups[b.start_date] = [];
    groups[b.start_date].push(b);
  }
  let lines = [`📅 <b>${title}</b>\n`];
  for (const [date, items] of Object.entries(groups)) {
    lines.push(`<b>${fmtDate(date)}</b>`);
    for (const b of items) {
      const nights = nightsBetween(b.start_date, b.end_date);
      const name = PROPERTY_NAMES[b.property_id] || b.property_id;
      const icon = platformIcon(b.platform);
      const flag = countryToFlag(b.guest_country);
      const guest = b.guest_name ? ` — ${escapeHtml(b.guest_name)}${flag ? ' ' + flag : ''}` : '';
      lines.push(`${icon} ${escapeHtml(name)} (${nights} ${pluralNights(nights)}, → ${fmtDate(b.end_date)})${guest}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function formatCleaning(tasks, title) {
  if (!tasks || tasks.length === 0) return `🧹 ${title}\n\nУборок нет`;
  tasks.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  let lines = [`🧹 <b>${title}</b>\n`];
  for (const t of tasks) {
    const status = t.status === 'completed' ? '✅' : '⏳';
    const cleaner = t.cleaner_name || 'не назначено';
    const name = PROPERTY_NAMES[t.property_id] || t.property_name || t.property_id;
    lines.push(`${status} ${name} — ${cleaner}`);
  }
  return lines.join('\n').trim();
}

// ── Property Detection ───────────────────────────────────

const PROPERTY_PATTERNS = {
  'orange': 'orange', 'оранж': 'orange',
  'solo': 'solo', 'соло': 'solo',
  'awesome': 'awesome', 'офиген': 'awesome',
  'carina': 'carina', 'карин': 'carina',
  'harmony': 'harmony', 'гармон': 'harmony',
  'royal': 'royal', 'роял': 'royal',
  'vingtage': 'vingtage', 'винтаж': 'vingtage',
  'youth': 'youth', 'юс': 'youth',
  'central': 'central', 'централ': 'central', 'централь': 'central',
  'susy': 'susy', 'сюзи': 'susy', 'суси': 'susy',
  'carmela': 'carmela', 'кармел': 'carmela', 'oliva': 'carmela', 'олива': 'carmela'
};

function detectProperty(text) {
  const lower = text.toLowerCase();
  for (const [pattern, id] of Object.entries(PROPERTY_PATTERNS)) {
    if (lower.includes(pattern)) return id;
  }
  return null;
}

// ── Command Handlers ─────────────────────────────────────

async function handleBookings(chatId, arg) {
  const today = getDate(0);
  const monthEnd = getDate(30);
  const propertyId = arg ? detectProperty(arg) : null;
  const params = propertyId ? { property_id: propertyId } : { from_date: today };
  let bookings = await fetchBookings(params);
  if (!bookings) return sendMessage(chatId, '❌ API недоступен');
  bookings = bookings.filter(b => b.start_date >= today && b.start_date <= monthEnd);
  const title = propertyId ? PROPERTY_NAMES[propertyId] || propertyId : 'Ближайшие бронирования';
  return sendMessage(chatId, formatBookings(bookings, title));
}

async function handleWeek(chatId, arg) {
  const today = getDate(0);
  const weekEnd = getDate(7);
  const propertyId = arg ? detectProperty(arg) : null;
  const params = propertyId ? { property_id: propertyId } : { from_date: today };
  let bookings = await fetchBookings(params);
  if (!bookings) return sendMessage(chatId, '❌ API недоступен');
  bookings = bookings.filter(b => b.start_date >= today && b.start_date <= weekEnd);
  const title = propertyId ? `${PROPERTY_NAMES[propertyId] || propertyId} — неделя` : 'Бронирования на неделю';
  return sendMessage(chatId, formatBookings(bookings, title));
}

async function handleToday(chatId) {
  const today = getDate(0);
  const bookings = await fetchBookings({ from_date: today });
  if (!bookings) return sendMessage(chatId, '❌ API недоступен');
  return sendMessage(chatId, formatTodayArrivals(bookings, today));
}

async function handleTodayDetails(chatId) {
  const today = getDate(0);
  const bookings = await fetchBookings({ from_date: today });
  if (!bookings) return sendMessage(chatId, '❌ API недоступен');
  return sendMessage(chatId, formatTodayDetails(bookings, today));
}

async function handleTomorrow(chatId) {
  const tmrw = getDate(1);
  let bookings = await fetchBookings({ from_date: tmrw });
  if (!bookings) return sendMessage(chatId, '❌ API недоступен');
  bookings = bookings.filter(b => b.start_date === tmrw);
  return sendMessage(chatId, formatBookings(bookings, `Заезды завтра (${fmtDate(tmrw)})`));
}

async function handleCleaning(chatId, arg) {
  const today = getDate(0);
  let fromDate = today;
  let filterDate = null;
  let titleSuffix = 'на неделю';

  if (arg && (arg.includes('завтра') || arg.includes('tomorrow'))) {
    fromDate = getDate(1); filterDate = fromDate; titleSuffix = `на завтра (${fmtDate(fromDate)})`;
  } else if (!arg || arg.includes('сегодня') || arg.includes('today')) {
    filterDate = today; titleSuffix = `сегодня (${fmtDate(today)})`;
  }

  let tasks = await fetchCleaningTasks({ from_date: fromDate });
  if (!tasks) return sendMessage(chatId, '❌ API недоступен');

  if (filterDate) {
    tasks = tasks.filter(t => t.scheduled_date === filterDate);
  } else {
    const weekEnd = getDate(7);
    tasks = tasks.filter(t => t.scheduled_date >= today && t.scheduled_date <= weekEnd);
  }

  const propertyId = arg ? detectProperty(arg) : null;
  if (propertyId) tasks = tasks.filter(t => t.property_id === propertyId);

  return sendMessage(chatId, formatCleaning(tasks, `Уборки ${titleSuffix}`));
}

async function handleHelp(chatId) {
  return sendMessage(chatId, `🦞 <b>Команды:</b>

/bookings — бронирования на месяц
/bookings orange — конкретный апартамент
/week — бронирования на неделю
/today — только заезды сегодня
/today-details — заезды, выезды и кто остается
/today_details — та же команда, удобна для меню Telegram
/tomorrow — заезды завтра
/cleaning — уборки сегодня
/cleaning tomorrow — уборки завтра

🩷 Airbnb  🔵 Booking`);
}

// ── Webhook Handler ──────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  if (!BOT_TOKEN || !FAMILY_CHAT_ID) {
    return res.status(500).json({ error: 'Missing bot config' });
  }

  if (!WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Missing webhook secret' });
  }

  if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const update = req.body;
  const message = update?.message;
  if (!message || !message.text) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  if (chatId.toString() !== FAMILY_CHAT_ID) {
    return res.status(200).json({ ok: true });
  }

  const text = message.text;

  try {
    // Route commands
    const parsed = parseCommand(text);
    if (parsed) {
      await sendChatAction(chatId);
      const { command: cmd, arg } = parsed;

      switch (cmd) {
        case 'bookings': await handleBookings(chatId, arg); break;
        case 'week': await handleWeek(chatId, arg); break;
        case 'today': await handleToday(chatId); break;
        case 'today-details': case 'today_details': await handleTodayDetails(chatId); break;
        case 'tomorrow': await handleTomorrow(chatId); break;
        case 'cleaning': await handleCleaning(chatId, arg); break;
        case 'help': case 'start': await handleHelp(chatId); break;
      }
    }
  } catch (e) {
    console.error('Telegram handler error:', e.message);
    await sendMessage(chatId, '❌ Ошибка').catch(() => {});
  }

  return res.status(200).json({ ok: true });
};
