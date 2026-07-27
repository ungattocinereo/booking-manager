// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

const { formatBooking, formatCleaningTask, formatAvailabilityMarker, todayInRome } = require('./_helpers');
const { isUnavailableMarker, normalizeBookingsForDisplay } = require('../lib/booking-normalization');
const { isDateOnly } = require('../lib/api-validation');
const { handleReportingRequest } = require('../backend/src/reporting/http-handlers');

module.exports = async (req, res) => {
  if (req.query.reporting_route) {
    return handleReportingRequest(req.query.reporting_route, req, res, db);
  }
  try {
    // Initialize database connection
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.query.stats_only === '1') {
      if (req.method && req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const snapshots = await db.getStatsSnapshots({
        seasonYear: req.query.season_year,
        limit: req.query.limit
      });
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(200).json(snapshots);
    }

    const today = todayInRome();
    const full = req.query.full === '1';
    const includeInactive = req.query.include_inactive === '1';
    if (req.query.from_date && !isDateOnly(req.query.from_date)) {
      return res.status(400).json({ error: 'from_date must be YYYY-MM-DD' });
    }
    const fromDate = full ? null : (req.query.from_date || today);
    const seasonYear = req.query.season_year || Number(today.slice(0, 4));
    const snapshotsLimit = req.query.snapshots_limit || req.query.limit || 1000;
    
    // Fetch all data
    const [properties, bookings, cleaningTasks, cleaners, statsSnapshots, syncHealth] = await Promise.all([
      db.getProperties(),
      db.getBookings(null, fromDate, { includeInactive }),
      db.getCleaningTasks(null, today),
      db.getCleaners(),
      full && typeof db.getStatsSnapshots === 'function'
        ? db.getStatsSnapshots({ seasonYear, limit: snapshotsLimit })
        : Promise.resolve([]),
      typeof db.getSyncHealth === 'function'
        ? db.getSyncHealth()
        : Promise.resolve(null)
    ]);

    await Promise.all(cleaners.map(async cleaner => {
      cleaner.properties = await db.getCleanerProperties(cleaner.id);
    }));

    // Format dates to YYYY-MM-DD
    const normalizedBookings = normalizeBookingsForDisplay(bookings);
    const visibleBookings = req.query.include_markers === '1'
      ? bookings
      : normalizedBookings;
    const formattedBookings = visibleBookings.map(formatBooking);
    const availabilityMarkers = bookings.filter(isUnavailableMarker).map(formatAvailabilityMarker);
    const formattedTasks = cleaningTasks.map(formatCleaningTask);
    const latestSyncedAt = bookings.reduce((latest, booking) => {
      const value = booking.synced_at ? new Date(booking.synced_at).getTime() : 0;
      return Number.isFinite(value) && value > latest ? value : latest;
    }, 0);

    // Calculate stats
    const stats = {
      total_properties: properties.length,
      total_bookings: formattedBookings.length,
      hidden_booking_markers: bookings.length - normalizedBookings.length,
      total_cleaning_tasks: formattedTasks.length,
      pending_cleaning_tasks: formattedTasks.filter(t => t.status === 'pending').length,
      total_cleaners: cleaners.length
    };

    // Group bookings by property
    const byProperty = {};
    for (const booking of formattedBookings) {
      if (!byProperty[booking.property_id]) {
        byProperty[booking.property_id] = [];
      }
      byProperty[booking.property_id].push(booking);
    }

    res.status(200).json({
      meta: {
        complete: true,
        generated_at: new Date().toISOString(),
        dataset_version: `${formattedBookings.length}:${latestSyncedAt || 0}`,
        stats_included: full,
        range: { from: fromDate, to: null },
        sync_health: syncHealth
      },
      stats,
      properties,
      bookings: formattedBookings,
      bookings_by_property: byProperty,
      availability_markers: availabilityMarkers,
      cleaning_tasks: formattedTasks,
      cleaners,
      stats_snapshots: statsSnapshots
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: error.message });
  }
};
