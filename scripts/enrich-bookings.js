const path = require('path');
const fs = require('fs');

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

async function main() {
  console.log('Initializing database...');
  await db.init();

  // Find all CSV files in exports/
  const csvFiles = fs.readdirSync(EXPORTS_DIR).filter(f => f.endsWith('.csv'));
  if (csvFiles.length === 0) {
    console.log('No CSV files found in exports/');
    return;
  }

  console.log(`Found ${csvFiles.length} CSV file(s): ${csvFiles.join(', ')}`);

  let totalParsed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const file of csvFiles) {
    const filePath = path.join(EXPORTS_DIR, file);
    console.log(`\nProcessing ${file}...`);

    const content = fs.readFileSync(filePath, 'utf8');
    const rows = parseCSV(content);
    console.log(`  Parsed ${rows.length} rows`);

    for (const row of rows) {
      totalParsed++;

      const guestName = row['Guest name'] || row['Guest Name'];
      const contact = row['Contact'];
      const listing = row['Listing'];
      const startDateRaw = row['Start date'] || row['Start Date'];
      const endDateRaw = row['End date'] || row['End Date'];

      if (!listing || !startDateRaw || !endDateRaw) {
        console.log(`  Skipping row: missing listing or dates`);
        totalSkipped++;
        continue;
      }

      const propertyId = LISTING_MAP[listing];
      if (!propertyId) {
        console.log(`  Skipping unknown listing: "${listing}"`);
        totalSkipped++;
        continue;
      }

      const startDate = convertDate(startDateRaw);
      const endDate = convertDate(endDateRaw);
      if (!startDate || !endDate) {
        console.log(`  Skipping row: invalid date format`);
        totalSkipped++;
        continue;
      }

      const country = extractCountry(contact);

      if (!guestName) {
        console.log(`  Skipping row: no guest name`);
        totalSkipped++;
        continue;
      }

      try {
        let changes = 0;
        if (USE_POSTGRES) {
          const result = await db.execute(
            `UPDATE bookings SET guest_name = $1, guest_country = $2
             WHERE property_id = $3 AND platform = 'airbnb' AND start_date = $4 AND end_date = $5
             AND (guest_name IS NULL OR guest_name = '')`,
            [guestName, country, propertyId, startDate, endDate]
          );
          changes = result.rowCount || 0;
        } else {
          const result = await db.run(
            `UPDATE bookings SET guest_name = ?, guest_country = ?
             WHERE property_id = ? AND platform = 'airbnb' AND start_date = ? AND end_date = ?
             AND (guest_name IS NULL OR guest_name = '')`,
            [guestName, country, propertyId, startDate, endDate]
          );
          changes = result.changes || 0;
        }

        if (changes > 0) {
          console.log(`  Updated: ${guestName} (${country || '?'}) -> ${propertyId} [${startDate} - ${endDate}]`);
          totalUpdated++;
        } else {
          console.log(`  No match or already enriched: ${guestName} -> ${propertyId} [${startDate} - ${endDate}]`);
        }
      } catch (err) {
        console.error(`  Error updating ${guestName}: ${err.message}`);
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Parsed: ${totalParsed} bookings`);
  console.log(`Updated: ${totalUpdated} bookings`);
  console.log(`Skipped: ${totalSkipped} bookings`);

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
