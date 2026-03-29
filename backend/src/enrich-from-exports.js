const fs = require('fs');
const path = require('path');

const EXPORTS_DIR = path.join(__dirname, '..', '..', 'exports');

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

  const prefixes = Object.keys(PHONE_PREFIX_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (contact.startsWith(prefix)) {
      return PHONE_PREFIX_MAP[prefix];
    }
  }
  return null;
}

/**
 * Enrich bookings from Airbnb CSV exports.
 * @param {object} db - The database module (already initialized)
 * @param {boolean} isPostgres - Whether using Postgres (vs SQLite)
 * @returns {{ parsed: number, updated: number, skipped: number }}
 */
async function enrichFromExports(db, isPostgres) {
  let parsed = 0;
  let updated = 0;
  let skipped = 0;

  // Gracefully handle missing exports directory
  if (!fs.existsSync(EXPORTS_DIR)) {
    console.log('Enrich: exports/ directory not found, skipping enrichment');
    return { parsed, updated, skipped };
  }

  let csvFiles;
  try {
    csvFiles = fs.readdirSync(EXPORTS_DIR).filter(f => f.endsWith('.csv'));
  } catch (err) {
    console.log(`Enrich: could not read exports/ directory: ${err.message}`);
    return { parsed, updated, skipped };
  }

  if (csvFiles.length === 0) {
    console.log('Enrich: no CSV files found in exports/');
    return { parsed, updated, skipped };
  }

  console.log(`Enrich: found ${csvFiles.length} CSV file(s): ${csvFiles.join(', ')}`);

  for (const file of csvFiles) {
    const filePath = path.join(EXPORTS_DIR, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.log(`Enrich: could not read ${file}: ${err.message}`);
      continue;
    }

    const rows = parseCSV(content);
    console.log(`Enrich: ${file} - ${rows.length} rows`);

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
        let changes = 0;
        if (isPostgres) {
          const result = await db.execute(
            `UPDATE bookings SET guest_name = $1, guest_country = $2, guest_count = $3
             WHERE property_id = $4 AND platform = 'airbnb' AND start_date = $5 AND end_date = $6
             AND (guest_name IS NULL OR guest_name = '')`,
            [guestName, country, guestCount || null, propertyId, startDate, endDate]
          );
          changes = result.rowCount || 0;
          // Also update guest_count for already-enriched bookings that don't have it
          if (changes === 0 && guestCount > 0) {
            await db.execute(
              `UPDATE bookings SET guest_count = $1
               WHERE property_id = $2 AND platform = 'airbnb' AND start_date = $3 AND end_date = $4
               AND guest_count IS NULL`,
              [guestCount, propertyId, startDate, endDate]
            );
          }
        } else {
          const result = await db.run(
            `UPDATE bookings SET guest_name = ?, guest_country = ?, guest_count = ?
             WHERE property_id = ? AND platform = 'airbnb' AND start_date = ? AND end_date = ?
             AND (guest_name IS NULL OR guest_name = '')`,
            [guestName, country, guestCount || null, propertyId, startDate, endDate]
          );
          changes = result.changes || 0;
          if (changes === 0 && guestCount > 0) {
            await db.run(
              `UPDATE bookings SET guest_count = ?
               WHERE property_id = ? AND platform = 'airbnb' AND start_date = ? AND end_date = ?
               AND guest_count IS NULL`,
              [guestCount, propertyId, startDate, endDate]
            );
          }
        }

        if (changes > 0) {
          updated++;
        }
      } catch (err) {
        console.error(`Enrich: error updating ${guestName}: ${err.message}`);
      }
    }
  }

  console.log(`Enrich: parsed=${parsed}, updated=${updated}, skipped=${skipped}`);
  return { parsed, updated, skipped };
}

module.exports = { enrichFromExports };
