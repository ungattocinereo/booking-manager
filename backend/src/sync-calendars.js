const fetch = require('node-fetch');
const ICAL = require('ical.js');
const fs = require('fs');
const path = require('path');
const { todayInRome } = require('../../api/_helpers');
const { normalizeBookingsForDisplay } = require('../../lib/booking-normalization');
const calendarInventory = require('../config/calendar-inventory.json');

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

function validateCalendarConfig(config, inventory = calendarInventory) {
  const configuredProperties = Array.isArray(config?.properties) ? config.properties : [];
  const configuredById = new Map();
  const errors = [];

  for (const property of configuredProperties) {
    const propertyId = String(property?.id || '').trim();
    if (!propertyId) {
      errors.push('property without an id');
      continue;
    }
    if (configuredById.has(propertyId)) {
      errors.push(`duplicate property ${propertyId}`);
      continue;
    }
    configuredById.set(propertyId, property);
  }

  for (const expected of inventory.properties || []) {
    const property = configuredById.get(expected.id);
    if (!property) {
      errors.push(`missing property ${expected.id}`);
      continue;
    }

    const calendars = Array.isArray(property.calendars) ? property.calendars : [];
    const configuredPlatforms = new Set();
    for (const calendar of calendars) {
      const platform = String(calendar?.platform || '').trim().toLowerCase();
      if (!platform) continue;
      if (configuredPlatforms.has(platform)) errors.push(`duplicate ${expected.id}/${platform} feed`);
      configuredPlatforms.add(platform);
      if (!/^https?:\/\//i.test(String(calendar?.url || ''))) {
        errors.push(`invalid ${expected.id}/${platform} feed URL`);
      }
    }

    for (const platform of expected.platforms || []) {
      if (!configuredPlatforms.has(platform)) errors.push(`missing ${expected.id}/${platform} feed`);
    }
  }

  if (errors.length) {
    throw new Error(`Calendar configuration is incomplete: ${errors.join('; ')}`);
  }
  return config;
}

let configCache = null;

function getConfig() {
  if (!configCache) {
    configCache = validateCalendarConfig(loadConfig());
    const feedCount = configCache.properties.reduce(
      (total, property) => total + (Array.isArray(property.calendars) ? property.calendars.length : 0),
      0
    );
    console.log(`✅ Calendar configuration validated: ${configCache.properties.length} properties, ${feedCount} feeds`);
  }
  return configCache;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function calendarHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'calendar source';
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCalendar(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || wait;
  const timeoutMs = nonNegativeInteger(
    options.timeoutMs ?? process.env.ICAL_FETCH_TIMEOUT_MS,
    12000
  );
  const retries = nonNegativeInteger(
    options.retries ?? process.env.ICAL_FETCH_RETRIES,
    2
  );
  const source = calendarHost(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log(`📥 Fetching ${source} (attempt ${attempt + 1}/${retries + 1})`);
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Calendar source returned HTTP ${response.status}`);
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      const body = await response.text();
      if (!String(body || '').trim()) {
        const error = new Error('Calendar source returned an empty response');
        error.retryable = true;
        throw error;
      }
      if (!/BEGIN:VCALENDAR/i.test(body) || !/END:VCALENDAR/i.test(body)) {
        const error = new Error('Calendar source returned an incomplete iCal document');
        error.retryable = true;
        throw error;
      }
      return body;
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      const retryable = aborted || error?.retryable !== false;
      if (!retryable || attempt >= retries) {
        if (aborted) throw new Error(`Calendar source timed out after ${timeoutMs}ms`);
        throw error;
      }
      await sleep(Math.min(2000, 400 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Calendar source could not be fetched');
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

    // Parse Airbnb description for reservation URL and phone
    const desc = event.description || '';
    let reservationUrl = '';
    let phoneLast4 = '';
    
    const urlMatch = desc.match(/Reservation URL:\s*(https:\/\/\S+)/);
    if (urlMatch) reservationUrl = urlMatch[1];
    
    const phoneMatch = desc.match(/Phone Number.*?:\s*(\d+)/);
    if (phoneMatch) phoneLast4 = phoneMatch[1];

    events.push({
      summary: event.summary || 'Booking',
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      description: desc,
      reservationUrl,
      phoneLast4
    });
  }

  return events;
}

async function syncPropertyCalendars(property) {
  console.log(`\n🏠 Syncing property: ${property.name}`);

  const today = todayInRome();
  let totalEvents = 0;
  let totalArchived = 0;
  const failures = [];

  for (const calendar of property.calendars) {
    try {
      const icalData = await fetchCalendar(calendar.url);
      const events = parseICalData(icalData);

      console.log(`  ${calendar.platform}: ${events.length} events`);

      const feedKeys = [];

      for (const event of events) {
        // Determine booking type
        let bookingType = 'reservation';
        const summary = (event.summary || '').toLowerCase();
        if (summary.includes('not available') || summary.includes('closed')) {
          bookingType = 'blocked';
        }

        const upsertResult = await db.upsertBooking(
          property.id,
          calendar.platform,
          event.startDate,
          event.endDate,
          event.summary,
          {
            reservationUrl: event.reservationUrl,
            phoneLast4: event.phoneLast4,
            bookingType
          }
        );

        const persistedStartDate = upsertResult?.canonicalStartDate || event.startDate;
        if (persistedStartDate !== event.startDate) {
          console.log(`  ↩️ Preserved original ${calendar.platform} start date for checkout ${event.endDate}`);
        }
        feedKeys.push({ startDate: persistedStartDate, endDate: event.endDate });
      }

      // Soft-archive future bookings that are no longer in the iCal feed.
      // Rows remain in the database for history/backups, but are hidden from active views.
      try {
        const archived = typeof db.archiveStaleBookings === 'function'
          ? await db.archiveStaleBookings(property.id, calendar.platform, feedKeys, today)
          : await db.deleteStaleBookings(property.id, calendar.platform, feedKeys, today);
        const archivedCount = archived.rowCount || archived.changes || 0;
        if (archivedCount > 0) {
          console.log(`  📦 Archived ${archivedCount} stale bookings for ${calendar.platform}`);
          totalArchived += archivedCount;
        }
      } catch (archiveErr) {
        console.error(`  ⚠️ Failed to archive stale bookings for ${calendar.platform}:`, archiveErr.message);
        failures.push({ property_id: property.id, platform: calendar.platform, error: `archive: ${archiveErr.message}` });
      }

      totalEvents += events.length;
    } catch (error) {
      console.error(`  ❌ Error syncing ${calendar.platform}:`, error.message);
      failures.push({ property_id: property.id, platform: calendar.platform, error: error.message });
    }
  }

  return { events: totalEvents, archived: totalArchived, deleted: 0, failures };
}

async function generateCleaningTasks(options = {}) {
  console.log('\n🧹 Generating cleaning tasks...');
  const database = options.database || db;
  const today = options.today || todayInRome();
  
  // Ensure database is initialized
  if (!database.pool && !database.db) {
    await database.init();
  }
  
  // Get all upcoming bookings
  const bookings = normalizeBookingsForDisplay(await database.getBookings(null, today));
  
  console.log(`  Found ${bookings.length} bookings to process`);
  
  let tasksCreated = 0;
  let tasksSkipped = 0;
  const expectedCheckoutKeys = new Set();
  
  for (const booking of bookings) {
    const summary = String(booking.raw_summary || '').toLowerCase();
    const bookingType = String(booking.booking_type || '').toLowerCase();
    const isUnavailable = summary.includes('not available') ||
      summary.includes('closed') ||
      bookingType === 'blocked' ||
      bookingType === 'unavailable';
    const hasGuestDetails = Boolean((booking.guest_name || '').trim()) || Number(booking.guest_count) > 0;
    const isOperationalFallback = booking.operational_fallback === true;

    if (isUnavailable && !hasGuestDetails && !isOperationalFallback) {
      tasksSkipped++;
      continue;
    }

    expectedCheckoutKeys.add(`${booking.property_id}|${booking.end_date}`);

    // Create cleaning task for checkout day
    try {
      const result = await database.createCleaningTask(booking.property_id, booking.end_date, 'checkout_cleaning');
      if (result && result.rowCount > 0) {
        tasksCreated++;
      } else {
        tasksSkipped++;
      }
    } catch (err) {
      // Task might already exist
      tasksSkipped++;
    }
  }
  
  console.log(`  ✅ Created ${tasksCreated} new tasks, skipped ${tasksSkipped} existing`);

  if (typeof database.archiveStaleCleaningTasks === 'function') {
    const archived = await database.archiveStaleCleaningTasks(today, [...expectedCheckoutKeys]);
    const archivedCount = archived.rowCount || archived.changes || 0;
    if (archivedCount > 0) {
      console.log(`  📦 Archived ${archivedCount} stale cleaning tasks`);
    }
  }

  return tasksCreated;
}

async function syncAll() {
  console.log('🔄 Starting calendar sync...\n');
  
  try {
    const config = getConfig();
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
    let totalArchived = 0;
    const failures = [];
    for (const property of config.properties) {
      const result = await syncPropertyCalendars(property);
      totalEvents += result.events;
      totalArchived += result.archived || 0;
      failures.push(...(result.failures || []));
    }

    console.log(`\n✅ Total events synced: ${totalEvents}, stale archived: ${totalArchived}`);

    // Enrich bookings from Airbnb CSV exports
    const { enrichFromExports } = require('./enrich-from-exports');
    const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    await enrichFromExports(db, !!USE_POSTGRES);

    // Generate cleaning tasks after enrichment so guest metadata is current.
    await generateCleaningTasks();

    // Store an aggregate statistics snapshot after the final booking state is known.
    const { recordBookingStatsSnapshot } = require('./stats-snapshots');
    const snapshot = await recordBookingStatsSnapshot(db, {
      source: 'sync',
      syncStatus: failures.length ? 'partial' : 'success',
      feedErrorCount: failures.length
    });
    if (snapshot.storage?.quarantined) {
      console.log(`\n📈 Empty stats candidate quarantined for ${snapshot.snapshot_date}; waiting for a second successful sync`);
    } else if (snapshot.storage?.skipped) {
      console.log(`\n📈 Kept existing canonical stats snapshot for ${snapshot.snapshot_date}; incoming candidate was not stored`);
    } else {
      console.log(`\n📈 Stats snapshot saved: ${snapshot.booking_count} bookings, ${snapshot.occupied_nights} nights`);
    }

    if (failures.length) {
      throw new Error(`${failures.length} calendar feed(s) failed`);
    }

    console.log('\n🎉 Sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

// Serverless-friendly sync (doesn't close connection)
async function syncCalendars() {
  console.log('🔄 Starting calendar sync...\n');
  const config = getConfig();
  
  // Initialize database
  await db.init();
  
  // Create properties from config
  for (const property of config.properties) {
    await db.createProperty(property.id, property.name);
  }
  
  // Sync all property calendars
  let totalEvents = 0;
  let totalArchived = 0;
  const failures = [];
  for (const property of config.properties) {
    const result = await syncPropertyCalendars(property);
    totalEvents += result.events;
    totalArchived += result.archived || 0;
    failures.push(...(result.failures || []));
  }

  console.log(`\n✅ Total events synced: ${totalEvents}, stale archived: ${totalArchived}`);
  if (failures.length) console.error(`⚠️ ${failures.length} calendar feed(s) failed`);
  return { totalEvents, totalArchived, totalDeleted: 0, failures };
}

module.exports = {
  syncAll,
  syncCalendars,
  generateCleaningTasks,
  fetchCalendar,
  parseICalData,
  loadConfig,
  validateCalendarConfig
};

// Run the same protected service path used by the API when called directly.
if (require.main === module) {
  const { runSync } = require('./sync-service');
  runSync({
    source: 'cli',
    lockWaitMs: process.env.SYNC_LOCK_WAIT_MS,
    lockRetryMs: process.env.SYNC_LOCK_RETRY_MS
  })
    .then(result => {
      console.log(result.partial ? 'Sync completed partially' : 'Sync completed successfully');
      if (result.partial) process.exitCode = 1;
    })
    .catch(error => {
      console.error('Sync failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}
