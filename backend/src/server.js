require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Use Postgres on Vercel, SQLite locally
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('./database-postgres')
  : require('./database');
const { formatBooking, formatCleaningTask, formatAvailabilityMarker, todayInRome } = require('../../api/_helpers');
const { isUnavailableMarker, normalizeBookingsForDisplay } = require('../../lib/booking-normalization');
const { checkApplicationHealth } = require('../../lib/health-check');
const {
  normalizeCleanerName,
  cleanerIdFromName,
  normalizeCleanerSlug,
  normalizePropertyIds,
  isDateOnly,
  normalizeTaskType
} = require('../../lib/api-validation');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '512kb' }));

// Serve frontend
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// ===== PROPERTIES =====

app.get('/api/properties', async (req, res) => {
  try {
    const properties = await db.getProperties();
    res.json(properties);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    if (req.query.stats_only === '1') {
      const snapshots = await db.getStatsSnapshots({
        seasonYear: req.query.season_year,
        limit: req.query.limit
      });
      res.set('Cache-Control', 'private, no-store, max-age=0');
      return res.json(snapshots);
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

    const stats = {
      total_properties: properties.length,
      total_bookings: formattedBookings.length,
      hidden_booking_markers: bookings.length - normalizedBookings.length,
      total_cleaning_tasks: formattedTasks.length,
      pending_cleaning_tasks: formattedTasks.filter(t => t.status === 'pending').length,
      total_cleaners: cleaners.length
    };

    const byProperty = {};
    for (const booking of formattedBookings) {
      if (!byProperty[booking.property_id]) byProperty[booking.property_id] = [];
      byProperty[booking.property_id].push(booking);
    }

    res.json({
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
    res.status(500).json({ error: error.message });
  }
});

// ===== BOOKINGS =====

app.get('/api/bookings', async (req, res) => {
  try {
    if (req.query.stats_snapshots === '1') {
      const snapshots = await db.getStatsSnapshots({
        seasonYear: req.query.season_year,
        limit: req.query.limit
      });
      return res.json(snapshots);
    }

    const { property_id, from_date } = req.query;
    const includeInactive = req.query.include_inactive === '1';
    const bookings = await db.getBookings(property_id, from_date, { includeInactive });
    const visibleBookings = req.query.include_markers === '1'
      ? bookings
      : normalizeBookingsForDisplay(bookings);
    res.json(visibleBookings.map(formatBooking));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    if (req.query.stats_snapshots !== '1') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const { recordBookingStatsSnapshot } = require('./stats-snapshots');
    const snapshot = await recordBookingStatsSnapshot(db, { source: 'manual' });
    res.json({ success: true, snapshot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bookings/summary', async (req, res) => {
  try {
    const today = todayInRome();
    const bookings = await db.getBookings(null, today);
    
    // Group by property
    const byProperty = {};
    for (const booking of bookings) {
      if (!byProperty[booking.property_id]) {
        byProperty[booking.property_id] = [];
      }
      byProperty[booking.property_id].push(booking);
    }
    
    res.json({ total: bookings.length, byProperty });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== STATISTICS SNAPSHOTS =====

app.get('/api/stats-snapshots', async (req, res) => {
  try {
    const snapshots = await db.getStatsSnapshots({
      seasonYear: req.query.season_year,
      limit: req.query.limit
    });
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.all('/api/stats-snapshots', (_req, res) => {
  res.set('Allow', 'GET');
  res.status(405).json({ error: 'Method not allowed' });
});

// ===== CLEANERS =====

app.get('/api/cleaners', async (req, res) => {
  try {
    const cleaners = await db.getCleaners();
    
    // Add property assignments
    await Promise.all(cleaners.map(async cleaner => {
      cleaner.properties = await db.getCleanerProperties(cleaner.id);
    }));
    
    res.json(cleaners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== CLEANING TASKS =====

app.get('/api/cleaning-tasks', async (req, res) => {
  try {
    const { cleaner_id, from_date } = req.query;
    const tasks = await db.getCleaningTasks(cleaner_id, from_date);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cleaning-tasks/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date().toISOString();
    await db.updateTaskStatus(id, 'completed', now);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cleaning-tasks/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { cleaner_id } = req.body;
    
    const query = USE_POSTGRES
      ? 'UPDATE cleaning_tasks SET cleaner_id = $1 WHERE id = $2'
      : 'UPDATE cleaning_tasks SET cleaner_id = ? WHERE id = ?';
    await (USE_POSTGRES ? db.execute(query, [cleaner_id, id]) : db.run(query, [cleaner_id, id]));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cleaning-tasks', async (req, res) => {
  try {
    const { property_id, scheduled_date, task_type, notes } = req.body;
    const normalizedTaskType = normalizeTaskType(task_type);
    if (typeof property_id !== 'string' || !property_id.trim() || !isDateOnly(scheduled_date)) {
      return res.status(400).json({ error: 'property_id and scheduled_date required' });
    }
    if (!normalizedTaskType) return res.status(400).json({ error: 'Invalid task_type' });

    const query = USE_POSTGRES
      ? `INSERT INTO cleaning_tasks (property_id, scheduled_date, task_type, notes)
         VALUES ($1, $2, $3, $4) RETURNING id`
      : `INSERT INTO cleaning_tasks (property_id, scheduled_date, task_type, notes)
         VALUES (?, ?, ?, ?)`;
    const params = [property_id.trim(), scheduled_date, normalizedTaskType, typeof notes === 'string' ? notes.slice(0, 2000) : ''];
    const result = USE_POSTGRES ? await db.execute(query, params) : await db.run(query, params);
    
    res.json({ success: true, id: USE_POSTGRES ? result.rows[0]?.id : result.lastID });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update cleaner (name, slug, property assignments)
app.put('/api/cleaners/:id', async (req, res) => {
  try {
    const { name, slug, property_ids } = req.body;

    // Update property assignments
    if (property_ids !== undefined) {
      const normalizedIds = normalizePropertyIds(property_ids);
      if (!normalizedIds) return res.status(400).json({ error: 'property_ids must be an array of valid IDs' });
      await db.replaceCleanerProperties(req.params.id, normalizedIds);
      return res.json({ success: true });
    }

    // Update name/slug
    const fields = {};
    if (name !== undefined) {
      fields.name = normalizeCleanerName(name);
      if (!fields.name) return res.status(400).json({ error: 'Invalid name' });
    }
    if (slug !== undefined) {
      fields.slug = normalizeCleanerSlug(slug);
      if (fields.slug === undefined) return res.status(400).json({ error: 'Invalid slug' });
    }
    await db.updateCleaner(req.params.id, fields);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create cleaner
app.post('/api/cleaners', async (req, res) => {
  try {
    const name = normalizeCleanerName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Valid name required' });
    const id = cleanerIdFromName(name);
    if (!id) return res.status(400).json({ error: 'Name must contain letters or numbers' });
    const result = await db.createCleaner(id, name);
    const inserted = USE_POSTGRES ? result.rowCount : result.changes;
    if (!inserted) return res.status(409).json({ error: 'Cleaner already exists' });
    res.json({ success: true, id, name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete cleaner
app.delete('/api/cleaners/:id', async (req, res) => {
  try {
    await db.deleteCleanerWithRelations(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update cleaner property assignments
app.put('/api/cleaners/:id/properties', async (req, res) => {
  try {
    const { property_ids } = req.body;
    const normalizedIds = normalizePropertyIds(property_ids);
    if (!normalizedIds) return res.status(400).json({ error: 'property_ids must be an array of valid IDs' });
    await db.replaceCleanerProperties(req.params.id, normalizedIds);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== MAID CALENDAR =====

app.get('/api/maid/:slug', async (req, res) => {
  try {
    const cleaner = await db.getCleanerBySlug(req.params.slug);
    if (!cleaner) return res.status(404).json({ error: 'Not found' });

    const assignedProperties = await db.getCleanerProperties(cleaner.id);
    const propertyIds = assignedProperties.map(p => p.id);

    const today = todayInRome();
    const allBookings = normalizeBookingsForDisplay(await db.getBookings(null, today));

    // Filter to assigned properties only.
    const maidBookings = allBookings.filter(b => {
      if (!propertyIds.includes(b.property_id)) return false;
      return true;
    });

    res.json({
      cleaner: { id: cleaner.id, name: cleaner.name, slug: cleaner.slug },
      properties: assignedProperties,
      bookings: maidBookings.map(formatBooking)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve maid calendar HTML
app.get('/maid/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/maid.html'));
});

// Tab routes — serve main app, frontend JS handles tab switching
app.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
});
app.get('/maid', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
});
app.get('/tax', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
});
app.get('/reporting', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
});

// ===== GUEST REPORTING (ALLOGGIATI / ISTAT) =====

const { handleReportingRequest } = require('./reporting/http-handlers');
app.all('/api/reporting', (req, res) => handleReportingRequest('dashboard', req, res, db));
app.all('/api/reporting/imports', (req, res) => handleReportingRequest('imports', req, res, db));
app.all('/api/reporting/alloggiati', (req, res) => handleReportingRequest('alloggiati', req, res, db));
app.all('/api/reporting/istat', (req, res) => handleReportingRequest('istat', req, res, db));
app.all('/api/reporting/maintenance', (req, res) => handleReportingRequest('maintenance', req, res, db));

// ===== TAX (TASSA DI SOGGIORNO) =====

app.get('/api/tax', async (req, res) => {
  try {
    const { date } = req.query;
    if (!isDateOnly(date)) return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    const rows = await db.getTaxByDate(date);
    res.json(rows.map(r => ({ ...r, tax_paid: !!r.tax_paid })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/tax', async (req, res) => {
  try {
    const { booking_id, tax_paid } = req.body || {};
    if (!booking_id) return res.status(400).json({ error: 'booking_id is required' });
    if (typeof tax_paid !== 'boolean') return res.status(400).json({ error: 'tax_paid must be boolean' });
    await db.updateTaxPaid(booking_id, tax_paid);
    res.json({ ok: true, booking_id, tax_paid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SYNC =====

app.post('/api/sync', async (req, res) => {
  try {
    const { runSync } = require('./sync-service');
    const result = await runSync({ source: 'manual' });
    res.status(result.partial ? 207 : 200).json(result);
  } catch (error) {
    if (error.code === 'SYNC_IN_PROGRESS') {
      return res.status(409).json({ success: false, code: error.code, error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});


// ===== HEALTH CHECK =====

app.get(['/health', '/api/health'], async (req, res) => {
  const result = await checkApplicationHealth(db);
  res.set('Cache-Control', 'no-store');
  res.status(result.httpStatus).json(result.body);
});

let httpServer = null;

async function startServer() {
  await db.init();
  httpServer = app.listen(PORT, () => {
    console.log(`🚀 Atrani Booking Manager API running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard data: http://localhost:${PORT}/api/dashboard`);
  });
}

startServer().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exitCode = 1;
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  if (httpServer) await new Promise(resolve => httpServer.close(resolve));
  await db.close();
  process.exit(0);
});
