const { timingSafeEqual } = require('node:crypto');
const { normalizeBookingsForDisplay, isUnavailableMarker } = require('./booking-normalization');
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
  const normalize = rows => normalizeBookingsForDisplay(rows.filter(b =>
    b.active !== false && b.active !== 0 && b.active !== '0' && String(b.active).toLowerCase() !== 'false'
  ));
  let visible = normalize(rawBookings);
  // Keep the normal calendar window and enough history for seven previous arrivals,
  // including quiet seasons where those arrivals are older than 90 days.
  if (visible.filter(b => formatDate(b.start_date) < today).length < 7) {
    const previous = normalize(await db.getBookings(null)).filter(b => formatDate(b.start_date) < today)
      .sort((a, b) => formatDate(b.start_date).localeCompare(formatDate(a.start_date)) || Number(b.id) - Number(a.id)).slice(0, 7);
    visible = [...new Map([...visible, ...previous].map(b => [String(b.id), b])).values()];
  }
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
    bookings: visible.map(b => ({
      id: String(b.id),
      property_id: String(b.property_id),
      start_date: formatDate(b.start_date),
      end_date: formatDate(b.end_date),
      guest_name: b.guest_name || null,
      guest_count: Number(b.guest_count) || null,
      platform: b.platform || '',
      reservation_url: /^https:\/\//i.test(b.reservation_url || '') ? b.reservation_url : null,
      operational_fallback: b.operational_fallback === true,
      tax_paid: b.tax_paid === true || b.tax_paid === 1 || b.tax_paid === '1',
      tax_paid_at: b.tax_paid_at ? new Date(b.tax_paid_at).toISOString() : null,
      tax_applicable: b.operational_fallback !== true && !isUnavailableMarker(b),
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

async function handleMobileTax(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'x-widget-token');
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!hasMobileAccess(req)) return res.status(404).json({ error: 'Not found' });
  const { booking_id: id, tax_paid: paid, expected_paid: expected } = req.body || {};
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || typeof paid !== 'boolean' || typeof expected !== 'boolean') {
    return res.status(400).json({ error: 'Valid booking_id, tax_paid and expected_paid are required' });
  }
  try {
    if (!db.pool && !db.db) await db.init();
    const bookings = normalizeBookingsForDisplay(await db.getBookings(null));
    const booking = bookings.find(b => String(b.id) === String(id) && b.active !== false && b.active !== 0 && b.active !== '0' && String(b.active).toLowerCase() !== 'false');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.operational_fallback || isUnavailableMarker(booking)) return res.status(422).json({ error: 'Guest booking required' });
    const current = booking.tax_paid === true || booking.tax_paid === 1 || booking.tax_paid === '1';
    if (current === paid) return res.status(200).json({ booking_id: String(id), tax_paid: current, tax_paid_at: booking.tax_paid_at || null });
    const paidAt = paid ? new Date().toISOString() : null;
    const changed = await db.updateMobileTaxPaid(Number(id), paid, expected, paidAt);
    if (!changed) return res.status(409).json({ error: 'Tax status changed; refresh before retrying' });
    return res.status(200).json({ booking_id: String(id), tax_paid: paid, tax_paid_at: paidAt });
  } catch (error) {
    console.error('Mobile tax update failed:', error.message);
    return res.status(500).json({ error: 'Could not update tax status' });
  }
}

module.exports = { buildMobileDashboard, handleMobileDashboard, handleMobileTax, hasMobileAccess };
