const express = require('express');
const cors = require('cors');
const path = require('path');

// Use Postgres on Vercel, SQLite locally
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('./database-postgres')
  : require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// Initialize database on startup
db.init().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// ===== PROPERTIES =====

app.get('/api/properties', async (req, res) => {
  try {
    const properties = await db.getProperties();
    res.json(properties);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== BOOKINGS =====

app.get('/api/bookings', async (req, res) => {
  try {
    const { property_id, from_date } = req.query;
    const bookings = await db.getBookings(property_id, from_date);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bookings/summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
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

// ===== CLEANERS =====

app.get('/api/cleaners', async (req, res) => {
  try {
    const cleaners = await db.getCleaners();
    
    // Add property assignments
    for (const cleaner of cleaners) {
      cleaner.properties = await db.getCleanerProperties(cleaner.id);
    }
    
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
    
    await db.run(
      'UPDATE cleaning_tasks SET cleaner_id = ? WHERE id = ?',
      [cleaner_id, id]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cleaning-tasks', async (req, res) => {
  try {
    const { property_id, scheduled_date, task_type, notes } = req.body;
    
    const result = await db.run(
      `INSERT INTO cleaning_tasks (property_id, scheduled_date, task_type, notes)
       VALUES (?, ?, ?, ?)`,
      [property_id, scheduled_date, task_type || 'manual', notes || '']
    );
    
    res.json({ success: true, id: result.lastID });
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
      await db.run('DELETE FROM cleaner_properties WHERE cleaner_id = ?', [req.params.id]);
      for (const pid of property_ids) {
        await db.assignCleanerToProperty(req.params.id, pid);
      }
      return res.json({ success: true });
    }

    // Update name/slug
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (slug !== undefined) fields.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-') || null;
    await db.updateCleaner(req.params.id, fields);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create cleaner
app.post('/api/cleaners', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '_').replace(/_+/g, '_');
    await db.createCleaner(id, name);
    res.json({ success: true, id, name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete cleaner
app.delete('/api/cleaners/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM cleaner_properties WHERE cleaner_id = ?', [req.params.id]);
    await db.run('UPDATE cleaning_tasks SET cleaner_id = NULL WHERE cleaner_id = ?', [req.params.id]);
    await db.run('DELETE FROM cleaners WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update cleaner property assignments
app.put('/api/cleaners/:id/properties', async (req, res) => {
  try {
    const { property_ids } = req.body;
    // Remove all current assignments
    await db.run('DELETE FROM cleaner_properties WHERE cleaner_id = ?', [req.params.id]);
    // Add new ones
    for (const propId of (property_ids || [])) {
      await db.assignCleanerToProperty(req.params.id, propId);
    }
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

    const today = new Date().toISOString().split('T')[0];
    const allBookings = await db.getBookings(null, today);

    // Filter to assigned properties only, exclude blocked/unavailable without guest
    const maidBookings = allBookings.filter(b => {
      if (!propertyIds.includes(b.property_id)) return false;
      const summary = b.raw_summary || '';
      const isUnavailable = summary.includes('Not available') || summary.includes('CLOSED') || b.booking_type === 'blocked';
      if (isUnavailable && !b.guest_name) return false;
      return true;
    });

    res.json({
      cleaner: { id: cleaner.id, name: cleaner.name, slug: cleaner.slug },
      properties: assignedProperties,
      bookings: maidBookings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve maid calendar HTML
app.get('/maid/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/maid.html'));
});

// ===== SYNC =====

app.post('/api/sync', async (req, res) => {
  try {
    const { syncAll } = require('./sync-calendars');
    
    // Run sync in background
    syncAll().then(() => {
      console.log('Background sync completed');
    }).catch(err => {
      console.error('Background sync failed:', err);
    });
    
    res.json({ success: true, message: 'Sync started in background' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DASHBOARD DATA =====

app.get('/api/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get upcoming bookings
    const bookings = await db.getBookings(null, today);
    
    // Get cleaning tasks for next 7 days
    const cleaningTasks = await db.getCleaningTasks(null, today);
    
    // Get properties
    const properties = await db.getProperties();
    
    // Get cleaners
    const cleaners = await db.getCleaners();
    
    res.json({
      stats: {
        totalProperties: properties.length,
        upcomingBookings: bookings.length,
        pendingTasks: cleaningTasks.filter(t => t.status === 'pending').length,
        totalCleaners: cleaners.length
      },
      bookings: bookings.slice(0, 10), // Next 10 bookings
      cleaningTasks: cleaningTasks.slice(0, 20), // Next 20 tasks
      properties,
      cleaners
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== HEALTH CHECK =====

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Atrani Booking Manager API running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard data: http://localhost:${PORT}/api/dashboard`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  db.close();
  process.exit(0);
});
