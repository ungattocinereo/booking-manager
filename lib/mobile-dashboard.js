const { timingSafeEqual } = require('node:crypto');
const { normalizeBookingsForDisplay } = require('./booking-normalization');
const { isDateOnly } = require('./api-validation');
const { formatDate, todayInRome } = require('../api/_helpers');

function hasMobileAccess(req, expectedToken = process.env.WIDGET_TOKEN || '') {
  const provided = req.headers?.['x-widget-token'];
  if (!expectedToken || typeof provided !== 'string') return false;
  const actual = Buffer.from(provided);
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function defaultFromDate(today) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 90);
  return date.toISOString().slice(0, 10);
}

async function buildMobileDashboard(db, fromDate, today = todayInRome()) {
  const [properties, rawBookings, tasks, health] = await Promise.all([
    db.getProperties(),
    db.getBookings(null, fromDate || defaultFromDate(today)),
    db.getCleaningTasks(null, today),
    typeof db.getSyncHealth === 'function' ? db.getSyncHealth() : null,
  ]);
  return {
    schema_version: 1,
    date: today,
    generated_at: new Date().toISOString(),
    sync_health: health ? {
      status: health.status,
      stale: health.stale,
      last_data_at: health.last_data_at,
      feed_error_count: health.feed_error_count,
    } : null,
    properties: properties.map(p => ({ id: String(p.id), name: p.name, color: p.color || null })),
    bookings: normalizeBookingsForDisplay(rawBookings.filter(b =>
      b.active !== false && b.active !== 0 && b.active !== '0' && String(b.active).toLowerCase() !== 'false'
    )).map(b => ({
      id: String(b.id),
      property_id: String(b.property_id),
      start_date: formatDate(b.start_date),
      end_date: formatDate(b.end_date),
      guest_name: b.guest_name || null,
      guest_count: Number(b.guest_count) || null,
      platform: b.platform || '',
      reservation_url: /^https:\/\//i.test(b.reservation_url || '') ? b.reservation_url : null,
      operational_fallback: b.operational_fallback === true,
    })),
    cleaning_tasks: tasks.map(t => ({
      id: String(t.id),
      property_id: String(t.property_id),
      scheduled_date: formatDate(t.scheduled_date),
      cleaner_name: t.cleaner_name || null,
      status: t.status || 'pending',
      task_type: t.task_type || 'checkout_cleaning',
    })),
  };
}

async function handleMobileDashboard(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'x-widget-token');
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!hasMobileAccess(req)) return res.status(404).json({ error: 'Not found' });
  if (req.query.from_date && !isDateOnly(req.query.from_date)) {
    return res.status(400).json({ error: 'from_date must be YYYY-MM-DD' });
  }
  try {
    if (!db.pool && !db.db) await db.init();
    return res.status(200).json(await buildMobileDashboard(db, req.query.from_date));
  } catch (error) {
    console.error('Mobile dashboard failed:', error.message);
    return res.status(500).json({ error: 'Could not load bookings' });
  }
}

module.exports = { buildMobileDashboard, handleMobileDashboard, hasMobileAccess };
