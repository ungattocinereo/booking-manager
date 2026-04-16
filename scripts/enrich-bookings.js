const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Use Postgres on Vercel, SQLite locally (same pattern as server.js)
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

const EXPORTS_DIR = path.join(__dirname, '..', 'exports');

// Airbnb listing name -> property_id
const LISTING_MAP = {
  'Suite Harmony Royal. Excellent Central Location': 'royal',
  'Suite Harmony Excellent Central Location': 'harmony',
  'Квартира с офигенским видом!': 'awesome',
  'Orange townhouse room': 'orange',
  'Vintage Townhouse Chamber': 'vingtage',
  '2 Story Suite "Carina" Excellent Central Location': 'carina',
  '2 Story Suite Carina Excellent Central Location': 'carina',
  'The Adventure bunkbed room': 'youth',
  'Room for solo travelers': 'solo',
};

// Booking.com room name -> property_id
const BOOKING_ROOM_MAP = {
  'Orange Room': 'orange',
  'Vintage Room': 'vingtage',
  'Youth room': 'youth',
  'Solo Traveller room': 'solo',
};

// Phone prefix -> country code
const PHONE_PREFIX_MAP = {
  '+1': 'US', '+7': 'RU', '+20': 'EG', '+31': 'NL', '+33': 'FR',
  '+34': 'ES', '+36': 'HU', '+39': 'IT', '+44': 'GB', '+45': 'DK',
  '+46': 'SE', '+49': 'DE', '+56': 'CL', '+61': 'AU', '+82': 'KR',
  '+972': 'IL', '+55': 'BR', '+81': 'JP', '+86': 'CN', '+91': 'IN',
  '+47': 'NO', '+48': 'PL', '+351': 'PT', '+352': 'LU', '+353': 'IE',
  '+354': 'IS', '+358': 'FI', '+30': 'GR', '+32': 'BE', '+41': 'CH',
  '+43': 'AT', '+90': 'TR', '+380': 'UA', '+52': 'MX', '+54': 'AR',
  '+57': 'CO', '+65': 'SG', '+66': 'TH', '+84': 'VN', '+62': 'ID',
  '+60': 'MY', '+63': 'PH', '+64': 'NZ',
  '+51': 'PE', '+389': 'MK',
};

function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  // Parse header line
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  values.push(current);
  return values;
}

// Convert M/D/YYYY to YYYY-MM-DD
function convertDate(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

// Extract country from phone number prefix
function extractCountry(contact) {
  if (!contact) return null;

  // Sort prefixes by length descending so longer prefixes match first
  const prefixes = Object.keys(PHONE_PREFIX_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (contact.startsWith(prefix)) {
      return PHONE_PREFIX_MAP[prefix];
    }
  }
  return null;
}

async function updateBooking(propertyId, platform, startDate, endDate, guestName, country, guestCount) {
  let changes = 0;
  if (USE_POSTGRES) {
    const result = await db.execute(
      `UPDATE bookings SET guest_name = $1, guest_country = $2, guest_count = $3
       WHERE property_id = $4 AND platform = $5 AND start_date = $6 AND end_date = $7`,
      [guestName, country, guestCount || null, propertyId, platform, startDate, endDate]
    );
    changes = result.rowCount || 0;
  } else {
    const result = await db.run(
      `UPDATE bookings SET guest_name = ?, guest_country = ?, guest_count = ?
       WHERE property_id = ? AND platform = ? AND start_date = ? AND end_date = ?`,
      [guestName, country, guestCount || null, propertyId, platform, startDate, endDate]
    );
    changes = result.changes || 0;
  }
  return changes;
}

async function processAirbnbCSVs() {
  const csvFiles = fs.readdirSync(EXPORTS_DIR).filter(f => f.endsWith('.csv'));
  if (csvFiles.length === 0) {
    console.log('No CSV files found');
    return { parsed: 0, updated: 0, skipped: 0 };
  }

  console.log(`\n=== Airbnb CSVs: ${csvFiles.join(', ')} ===`);

  let parsed = 0, updated = 0, skipped = 0;

  for (const file of csvFiles) {
    const filePath = path.join(EXPORTS_DIR, file);
    console.log(`\nProcessing ${file}...`);

    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
    const rows = parseCSV(content);
    console.log(`  Parsed ${rows.length} rows`);

    for (const row of rows) {
      parsed++;

      const guestName = row['Guest name'] || row['Guest Name'];
      const contact = row['Contact'];
      const listing = row['Listing'];
      const startDateRaw = row['Start date'] || row['Start Date'];
      const endDateRaw = row['End date'] || row['End Date'];

      if (!listing || !startDateRaw || !endDateRaw) {
        skipped++;
        continue;
      }

      const propertyId = LISTING_MAP[listing];
      if (!propertyId) {
        console.log(`  Skipping unknown listing: "${listing}"`);
        skipped++;
        continue;
      }

      const startDate = convertDate(startDateRaw);
      const endDate = convertDate(endDateRaw);
      if (!startDate || !endDate) {
        skipped++;
        continue;
      }

      const country = extractCountry(contact);
      const adults = parseInt(row['# of adults']) || 0;
      const children = parseInt(row['# of children']) || 0;
      const infants = parseInt(row['# of infants']) || 0;
      const guestCount = adults + children + infants;

      if (!guestName) {
        skipped++;
        continue;
      }

      try {
        const changes = await updateBooking(propertyId, 'airbnb', startDate, endDate, guestName, country, guestCount);
        if (changes > 0) {
          console.log(`  Updated: ${guestName} (${country || '?'}) -> ${propertyId} [${startDate} - ${endDate}]`);
          updated++;
        } else {
          console.log(`  No match: ${guestName} -> ${propertyId} [${startDate} - ${endDate}]`);
        }
      } catch (err) {
        console.error(`  Error updating ${guestName}: ${err.message}`);
      }
    }
  }

  return { parsed, updated, skipped };
}

async function processBookingXLS() {
  const xlsFiles = fs.readdirSync(EXPORTS_DIR).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'));
  if (xlsFiles.length === 0) {
    console.log('No XLS files found');
    return { parsed: 0, updated: 0, skipped: 0 };
  }

  console.log(`\n=== Booking.com XLS: ${xlsFiles.join(', ')} ===`);

  let parsed = 0, updated = 0, skipped = 0;

  for (const file of xlsFiles) {
    const filePath = path.join(EXPORTS_DIR, file);
    console.log(`\nProcessing ${file}...`);

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    console.log(`  Parsed ${rows.length} rows`);

    for (const row of rows) {
      parsed++;

      const status = row['Status'] || '';
      // Skip cancelled bookings
      if (status.includes('cancelled')) {
        skipped++;
        continue;
      }

      const guestName = row['Guest Name(s)'] || '';
      const roomType = row['Unit type'] || '';
      const checkIn = row['Check-in'] || '';
      const checkOut = row['Check-out'] || '';
      const bookerCountry = row['Booker country'] || '';
      const adults = parseInt(row['Adults']) || 0;
      const children = parseInt(row['Children']) || 0;
      const guestCount = adults + children;

      if (!roomType || !checkIn || !checkOut) {
        skipped++;
        continue;
      }

      const propertyId = BOOKING_ROOM_MAP[roomType];
      if (!propertyId) {
        console.log(`  Skipping unknown room: "${roomType}"`);
        skipped++;
        continue;
      }

      // Dates from XLS are already YYYY-MM-DD
      const startDate = checkIn;
      const endDate = checkOut;

      if (!guestName) {
        skipped++;
        continue;
      }

      const country = bookerCountry ? bookerCountry.toUpperCase() : null;

      try {
        const changes = await updateBooking(propertyId, 'booking', startDate, endDate, guestName, country, guestCount);
        if (changes > 0) {
          console.log(`  Updated: ${guestName} (${country || '?'}) -> ${propertyId} [${startDate} - ${endDate}]`);
          updated++;
        } else {
          console.log(`  No match: ${guestName} -> ${propertyId} [${startDate} - ${endDate}]`);
        }
      } catch (err) {
        console.error(`  Error updating ${guestName}: ${err.message}`);
      }
    }
  }

  return { parsed, updated, skipped };
}

async function main() {
  console.log('Initializing database...');
  await db.init();

  const airbnb = await processAirbnbCSVs();
  const booking = await processBookingXLS();

  console.log(`\n--- Summary ---`);
  console.log(`Airbnb:  parsed=${airbnb.parsed}, updated=${airbnb.updated}, skipped=${airbnb.skipped}`);
  console.log(`Booking: parsed=${booking.parsed}, updated=${booking.updated}, skipped=${booking.skipped}`);
  console.log(`Total updated: ${airbnb.updated + booking.updated}`);

  // Close database connection
  if (db.pool) {
    await db.pool.end();
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
