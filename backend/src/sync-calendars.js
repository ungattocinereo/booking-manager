const fetch = require('node-fetch');
const ICAL = require('ical.js');
const fs = require('fs');
const path = require('path');

// Use Postgres on Vercel, SQLite locally
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('./database-postgres')
  : require('./database');

// Load config from env var (Vercel) or local file
function loadConfig() {
  if (process.env.ICAL_URLS) {
    // Vercel: env var format
    const icalUrls = JSON.parse(process.env.ICAL_URLS);
    
    return {
      properties: icalUrls.map(item => ({
        id: item.id,
        name: item.name,
        calendars: [
          item.booking_url && { platform: 'booking', url: item.booking_url },
          item.airbnb_url && { platform: 'airbnb', url: item.airbnb_url }
        ].filter(Boolean)
      })),
      cleaners: [] // Cleaners config not needed for sync, only for task assignment
    };
  } else {
    // Local: calendars.json
    const configPath = path.join(__dirname, '../config/calendars.json');
    if (fs.existsSync(configPath)) {
      return require(configPath);
    } else {
      throw new Error('No ICAL_URLS env var or calendars.json found');
    }
  }
}

const config = loadConfig();

async function fetchCalendar(url) {
  console.log(`📥 Fetching: ${url.substring(0, 50)}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch calendar: ${response.status}`);
  }
  return response.text();
}

function parseICalData(icalData) {
  const jcalData = ICAL.parse(icalData);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  const events = [];
  
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    
    // Parse dates
    const startDate = event.startDate.toJSDate();
    const endDate = event.endDate.toJSDate();
    
    // Format as YYYY-MM-DD
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    events.push({
      summary: event.summary || 'Booking',
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      description: event.description || ''
    });
  }

  return events;
}

async function syncPropertyCalendars(property) {
  console.log(`\n🏠 Syncing property: ${property.name}`);
  
  let totalEvents = 0;
  
  for (const calendar of property.calendars) {
    try {
      const icalData = await fetchCalendar(calendar.url);
      const events = parseICalData(icalData);
      
      console.log(`  ${calendar.platform}: ${events.length} events`);
      
      for (const event of events) {
        await db.upsertBooking(
          property.id,
          calendar.platform,
          event.startDate,
          event.endDate,
          event.summary
        );
      }
      
      totalEvents += events.length;
    } catch (error) {
      console.error(`  ❌ Error syncing ${calendar.platform}:`, error.message);
    }
  }
  
  return totalEvents;
}

async function generateCleaningTasks() {
  console.log('\n🧹 Generating cleaning tasks...');
  
  // Get all upcoming bookings
  const today = new Date().toISOString().split('T')[0];
  const bookings = await db.getBookings(null, today);
  
  let tasksCreated = 0;
  
  for (const booking of bookings) {
    // Create cleaning task for checkout day (createCleaningTask checks for duplicates internally)
    try {
      await db.createCleaningTask(booking.property_id, booking.end_date, 'checkout_cleaning');
      tasksCreated++;
    } catch (err) {
      // Task might already exist, skip silently
    }
  }
  
  console.log(`  ✅ Created ${tasksCreated} new cleaning tasks`);
  return tasksCreated;
}

async function syncAll() {
  console.log('🔄 Starting calendar sync...\n');
  
  try {
    // Initialize database
    await db.init();
    
    // Create properties and cleaners from config
    for (const property of config.properties) {
      await db.createProperty(property.id, property.name);
    }
    
    for (const cleaner of config.cleaners) {
      await db.createCleaner(cleaner.id, cleaner.name);
      
      // Assign properties to cleaner
      for (const propId of cleaner.properties) {
        await db.assignCleanerToProperty(cleaner.id, propId);
      }
    }
    
    // Sync all property calendars
    let totalEvents = 0;
    for (const property of config.properties) {
      const events = await syncPropertyCalendars(property);
      totalEvents += events;
    }
    
    console.log(`\n✅ Total events synced: ${totalEvents}`);
    
    // Generate cleaning tasks
    await generateCleaningTasks();
    
    console.log('\n🎉 Sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  syncAll();
}

module.exports = { syncAll };
