const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Configuration (all from environment variables)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FAMILY_CHAT_ID = process.env.FAMILY_CHAT_ID;
const BOOKING_API_URL = process.env.BOOKING_API_URL || 'https://b.amalfi.day';
const CF_ACCESS_CLIENT_ID =
  process.env.BOOKING_MANAGER_CF_ACCESS_CLIENT_ID ||
  process.env.CF_ACCESS_CLIENT_ID ||
  process.env.CLOUDFLARE_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET =
  process.env.BOOKING_MANAGER_CF_ACCESS_CLIENT_SECRET ||
  process.env.CF_ACCESS_CLIENT_SECRET ||
  process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET;

if (!BOT_TOKEN || !FAMILY_CHAT_ID) {
  console.error('Missing required env vars: TELEGRAM_BOT_TOKEN, FAMILY_CHAT_ID');
  process.exit(1);
}

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🦞 Atrani Booking Bot started');
console.log(`📱 Family chat: ${FAMILY_CHAT_ID}`);

// ── Helpers ──────────────────────────────────────────────

function getDate(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

function nightsBetween(start, end) {
  const ms = new Date(end) - new Date(start);
  return Math.round(ms / 86400000);
}

function fmtDate(iso) {
  const d = new Date(iso);
  const day = d.getDate();
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${day} ${months[d.getMonth()]}`;
}

function platformIcon(platform) {
  if (!platform) return '⬜';
  const p = platform.toLowerCase();
  if (p.includes('airbnb')) return '🩷';
  if (p.includes('booking')) return '🔵';
  return '⬜';
}

function countryToFlag(code) {
  if (!code) return '';
  const c = code.toUpperCase();
  return String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

function bookingApiRequestConfig() {
  if (!CF_ACCESS_CLIENT_ID || !CF_ACCESS_CLIENT_SECRET) return {};
  return {
    headers: {
      'CF-Access-Client-Id': CF_ACCESS_CLIENT_ID,
      'CF-Access-Client-Secret': CF_ACCESS_CLIENT_SECRET
    }
  };
}

async function fetchBookings(params = {}) {
  try {
    const url = new URL('/api/bookings', BOOKING_API_URL);
    Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
    const res = await axios.get(url.toString(), bookingApiRequestConfig());
    // Filter real guest bookings:
    // - Airbnb: only "Reserved" (skip "Airbnb (Not available)" = blocked dates)
    // - Booking.com: ALL entries are real bookings (Booking iCal marks everything as "CLOSED - Not available", no way to distinguish)
    return Array.isArray(res.data)
      ? res.data.filter(b => {
          const platform = (b.platform || '').toLowerCase();
          if (platform === 'booking') return true;
          if (platform === 'airbnb') {
            const summary = b.raw_summary || '';
            const isUnavailable = summary.includes('Not available') || summary.includes('CLOSED') || b.booking_type === 'blocked';
            if (isUnavailable && !b.guest_name) return false;
          }
          return true;
        })
      : [];
  } catch (e) {
    console.error('API error:', e.message);
    return null;
  }
}

async function fetchCleaningTasks(params = {}) {
  try {
    const url = new URL('/api/cleaning-tasks', BOOKING_API_URL);
    Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
    const res = await axios.get(url.toString(), bookingApiRequestConfig());
    return Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    console.error('API error:', e.message);
    return null;
  }
}

// Property display names
const PROPERTY_NAMES = {
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
};

// ── Formatters ───────────────────────────────────────────

function formatBookings(bookings, title) {
  if (!bookings || bookings.length === 0) {
    return `📅 ${title}\n\nНет бронирований`;
  }

  // Sort by start_date
  bookings.sort((a, b) => a.start_date.localeCompare(b.start_date));

  // Group by start_date
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
      const guest = b.guest_name ? ` — ${b.guest_name}${flag ? ' ' + flag : ''}` : '';
      lines.push(`${icon} ${name} (${nights} ${pluralNights(nights)}, → ${fmtDate(b.end_date)})${guest}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

function pluralNights(nights) {
  const abs = Math.abs(nights);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'ночей';
  if (last === 1) return 'ночь';
  if (last >= 2 && last <= 4) return 'ночи';
  return 'ночей';
}

function sortBookingsByProperty(bookings) {
  return bookings.sort((a, b) => {
    const aName = PROPERTY_NAMES[a.property_id] || a.property_id;
    const bName = PROPERTY_NAMES[b.property_id] || b.property_id;
    return aName.localeCompare(bName, 'ru');
  });
}

function bookingGuestSuffix(booking) {
  const flag = countryToFlag(booking.guest_country);
  return booking.guest_name ? ` — ${booking.guest_name}${flag ? ' ' + flag : ''}` : '';
}

function formatTodayLine(booking, detail) {
  const name = PROPERTY_NAMES[booking.property_id] || booking.property_id;
  return `${platformIcon(booking.platform)} ${name} (${detail})${bookingGuestSuffix(booking)}`;
}

function formatTodaySection(title, bookings, lineFormatter, emptyText = 'Нет') {
  const lines = [`<b>${title}</b>`];

  if (!bookings || bookings.length === 0) {
    lines.push(emptyText);
    return lines.join('\n');
  }

  for (const booking of sortBookingsByProperty(bookings)) {
    lines.push(lineFormatter(booking));
  }

  return lines.join('\n');
}

function formatTodayOverview(bookings, today) {
  if (!bookings) {
    return `🏠 Сегодня (${fmtDate(today)})\n\nНет бронирований`;
  }

  const arrivals = bookings.filter(b => b.start_date === today);
  const checkouts = bookings.filter(b => b.end_date === today);
  const staying = bookings.filter(b => b.start_date < today && b.end_date > today);

  const sections = [
    `🏠 <b>Сегодня (${fmtDate(today)})</b>`,
    formatTodaySection('Заезды', arrivals, (b) => {
      const nights = nightsBetween(b.start_date, b.end_date);
      return formatTodayLine(b, `${nights} ${pluralNights(nights)}, выезд ${fmtDate(b.end_date)}`);
    }, 'Заездов нет'),
    formatTodaySection('Выезды', checkouts, (b) => {
      const nights = nightsBetween(b.start_date, b.end_date);
      return formatTodayLine(b, `с ${fmtDate(b.start_date)}, ${nights} ${pluralNights(nights)}`);
    }, 'Выездов нет'),
    formatTodaySection('Остаются', staying, (b) => {
      const remainingNights = nightsBetween(today, b.end_date);
      return formatTodayLine(b, `до ${fmtDate(b.end_date)}, еще ${remainingNights} ${pluralNights(remainingNights)}`);
    }, 'Никто не остается')
  ];

  return sections.join('\n\n').trim();
}

function formatCleaning(tasks, title) {
  if (!tasks || tasks.length === 0) {
    return `🧹 ${title}\n\nУборок нет`;
  }

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

// ── Query Detection & Routing ────────────────────────────

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

function isBookingQuery(text) {
  const lower = text.toLowerCase();
  const keywords = [
    'бронирован', 'заезд', 'выезд', 'уборк', 'свободн', 'занят',
    'booking', 'check-in', 'check-out', 'clean', 'available',
    'orange', 'solo', 'awesome', 'central', 'carina', 'harmony', 'royal', 'vingtage', 'youth', 'susy', 'carmela', 'oliva',
    'оранж', 'офиген', 'централ', 'централь', 'карин', 'гармон', 'роял', 'винтаж', 'сюзи', 'суси', 'кармел', 'олива',
    'когда', 'покажи', 'какие', 'кто', 'ближайш', 'следующ'
  ];
  return keywords.some(k => lower.includes(k));
}

function isCleaningQuery(text) {
  const lower = text.toLowerCase();
  return lower.includes('уборк') || lower.includes('clean') || lower.includes('pulizia');
}

// ── Slash Commands ───────────────────────────────────────

// /bookings or /bookings orange — upcoming bookings (next 30 days)
bot.onText(/^\/bookings(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
  if (msg.chat.id.toString() !== FAMILY_CHAT_ID) return;
  const arg = (match[1] || '').trim().toLowerCase();
  const today = getDate(0);
  const monthEnd = getDate(30);

  try {
    await bot.sendChatAction(msg.chat.id, 'typing');
    const propertyId = arg ? detectProperty(arg) : null;
    const params = propertyId ? { property_id: propertyId } : { from_date: today };
    let bookings = await fetchBookings(params);
    if (!bookings) { await bot.sendMessage(msg.chat.id, '❌ API недоступен'); return; }
    bookings = bookings.filter(b => b.start_date >= today && b.start_date <= monthEnd);
    const title = propertyId ? PROPERTY_NAMES[propertyId] || propertyId : 'Ближайшие бронирования';
    await bot.sendMessage(msg.chat.id, formatBookings(bookings, title), { parse_mode: 'HTML' });
  } catch (e) { console.error(e); await bot.sendMessage(msg.chat.id, '❌ Ошибка'); }
});

// /week or /week orange — bookings this week
bot.onText(/^\/week(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
  if (msg.chat.id.toString() !== FAMILY_CHAT_ID) return;
  const arg = (match[1] || '').trim().toLowerCase();
  const today = getDate(0);
  const weekEnd = getDate(7);

  try {
    await bot.sendChatAction(msg.chat.id, 'typing');
    const propertyId = arg ? detectProperty(arg) : null;
    const params = propertyId ? { property_id: propertyId } : { from_date: today };
    let bookings = await fetchBookings(params);
    if (!bookings) { await bot.sendMessage(msg.chat.id, '❌ API недоступен'); return; }
    bookings = bookings.filter(b => b.start_date >= today && b.start_date <= weekEnd);
    const title = propertyId ? `${PROPERTY_NAMES[propertyId] || propertyId} — неделя` : 'Бронирования на неделю';
    await bot.sendMessage(msg.chat.id, formatBookings(bookings, title), { parse_mode: 'HTML' });
  } catch (e) { console.error(e); await bot.sendMessage(msg.chat.id, '❌ Ошибка'); }
});

// /today — arrivals, checkouts, and ongoing stays today
bot.onText(/^\/today(?:@\w+)?$/, async (msg) => {
  if (msg.chat.id.toString() !== FAMILY_CHAT_ID) return;
  const today = getDate(0);

  try {
    await bot.sendChatAction(msg.chat.id, 'typing');
    let bookings = await fetchBookings({ from_date: today });
    if (!bookings) { await bot.sendMessage(msg.chat.id, '❌ API недоступен'); return; }
    bookings = bookings.filter(b => b.start_date <= today || b.end_date === today);
    await bot.sendMessage(msg.chat.id, formatTodayOverview(bookings, today), { parse_mode: 'HTML' });
  } catch (e) { console.error(e); await bot.sendMessage(msg.chat.id, '❌ Ошибка'); }
});

// /tomorrow — check-ins tomorrow
bot.onText(/^\/tomorrow(?:@\w+)?$/, async (msg) => {
  if (msg.chat.id.toString() !== FAMILY_CHAT_ID) return;
  const tmrw = getDate(1);

  try {
    await bot.sendChatAction(msg.chat.id, 'typing');
    let bookings = await fetchBookings({ from_date: tmrw });
    if (!bookings) { await bot.sendMessage(msg.chat.id, '❌ API недоступен'); return; }
    bookings = bookings.filter(b => b.start_date === tmrw);
    await bot.sendMessage(msg.chat.id, formatBookings(bookings, `Заезды завтра (${fmtDate(tmrw)})`), { parse_mode: 'HTML' });
  } catch (e) { console.error(e); await bot.sendMessage(msg.chat.id, '❌ Ошибка'); }
});

// /cleaning or /cleaning tomorrow — cleaning schedule
bot.onText(/^\/cleaning(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
  if (msg.chat.id.toString() !== FAMILY_CHAT_ID) return;
  const arg = (match[1] || '').trim().toLowerCase();
  const today = getDate(0);

  try {
    await bot.sendChatAction(msg.chat.id, 'typing');
    let fromDate = today;
    let filterDate = null;
    let titleSuffix = 'на неделю';

    if (arg.includes('завтра') || arg.includes('tomorrow')) {
      fromDate = getDate(1); filterDate = fromDate; titleSuffix = `на завтра (${fmtDate(fromDate)})`;
    } else if (arg.includes('сегодня') || arg.includes('today') || !arg) {
      filterDate = today; titleSuffix = `сегодня (${fmtDate(today)})`;
    }

    let tasks = await fetchCleaningTasks({ from_date: fromDate });
    if (!tasks) { await bot.sendMessage(msg.chat.id, '❌ API недоступен'); return; }

    if (filterDate) {
      tasks = tasks.filter(t => t.scheduled_date === filterDate);
    } else {
      const weekEnd = getDate(7);
      tasks = tasks.filter(t => t.scheduled_date >= today && t.scheduled_date <= weekEnd);
    }

    const propertyId = detectProperty(arg);
    if (propertyId) tasks = tasks.filter(t => t.property_id === propertyId);

    await bot.sendMessage(msg.chat.id, formatCleaning(tasks, `Уборки ${titleSuffix}`), { parse_mode: 'HTML' });
  } catch (e) { console.error(e); await bot.sendMessage(msg.chat.id, '❌ Ошибка'); }
});

// /help — show available commands
bot.onText(/^\/help(?:@\w+)?$/, async (msg) => {
  if (msg.chat.id.toString() !== FAMILY_CHAT_ID) return;
  const help = `🦞 <b>Команды:</b>

/bookings — бронирования на месяц
/bookings orange — конкретный апартамент
/week — бронирования на неделю
/today — заезды, выезды и кто остается сегодня
/tomorrow — заезды завтра
/cleaning — уборки сегодня
/cleaning tomorrow — уборки завтра

🩷 Airbnb  🔵 Booking`;
  await bot.sendMessage(msg.chat.id, help, { parse_mode: 'HTML' });
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

process.on('SIGINT', () => { bot.stopPolling(); process.exit(0); });
process.on('SIGTERM', () => { bot.stopPolling(); process.exit(0); });
