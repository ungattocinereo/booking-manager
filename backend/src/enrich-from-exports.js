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
  'Carmela': 'carmela',
  'The Sunrise Balcony • Amalfi Coast View': 'carmela',
  'The Adventure bunkbed room': 'youth',
  'Room for solo travelers': 'solo',
};

// Booking.com room name -> property_id
const BOOKING_ROOM_MAP = {
  'Orange Room': 'orange',
  'Vintage Room': 'vingtage',
  'Youth room': 'youth',
  'Solo Traveller room': 'solo',
  'Central Room': 'central',
  'Villa with Sea View': 'susy',
};

// Phone prefix -> country code
const PHONE_PREFIX_MAP = {
  '+1': 'US', '+7': 'RU', '+20': 'EG', '+216': 'TN', '+31': 'NL', '+33': 'FR',
  '+34': 'ES', '+36': 'HU', '+39': 'IT', '+44': 'GB', '+45': 'DK',
  '+46': 'SE', '+49': 'DE', '+56': 'CL', '+61': 'AU', '+82': 'KR',
  '+972': 'IL', '+55': 'BR', '+81': 'JP', '+86': 'CN', '+91': 'IN',
  '+47': 'NO', '+48': 'PL', '+351': 'PT', '+352': 'LU', '+353': 'IE',
  '+354': 'IS', '+358': 'FI', '+359': 'BG', '+30': 'GR', '+32': 'BE', '+41': 'CH',
  '+40': 'RO', '+43': 'AT', '+90': 'TR', '+380': 'UA', '+52': 'MX', '+54': 'AR',
  '+57': 'CO', '+65': 'SG', '+66': 'TH', '+84': 'VN', '+62': 'ID',
  '+60': 'MY', '+63': 'PH', '+64': 'NZ',
  '+51': 'PE', '+598': 'UY', '+389': 'MK',
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

function getField(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name];
    }
  }

  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value])
  );

  for (const name of names) {
    const value = normalized[name.trim().toLowerCase()];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return '';
}

function normalizeDateField(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const str = String(value).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  return convertDate(str);
}

function normalizeCountry(value) {
  const str = String(value || '').trim();
  if (!str) return null;
  return str.length === 2 ? str.toUpperCase() : str;
}

function isActiveAirbnbStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized !== ''
    && !normalized.includes('cancel')
    && !normalized.includes('declin')
    && !normalized.includes('expir')
    && !normalized.includes('request');
}

async function updateBooking(db, isPostgres, propertyId, platform, startDate, endDate, guestName, country, guestCount) {
  let changes = 0;
  if (isPostgres) {
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

async function upsertBookingExportRow(db, isPostgres, row) {
  const rawSummary = row.guestName || 'Booking.com';

  if (isPostgres) {
    const result = await db.execute(
      `INSERT INTO bookings (
         property_id, platform, start_date, end_date, raw_summary,
         guest_name, guest_country, guest_count, booking_type,
         active, missing_since, synced_at
       )
       VALUES ($1, 'booking', $2, $3, $4, $5, $6, $7, 'reservation', TRUE, NULL, NOW())
       ON CONFLICT (property_id, platform, start_date, end_date)
       DO UPDATE SET
         raw_summary = EXCLUDED.raw_summary,
         guest_name = EXCLUDED.guest_name,
         guest_country = EXCLUDED.guest_country,
         guest_count = EXCLUDED.guest_count,
         booking_type = 'reservation',
         active = TRUE,
         missing_since = NULL,
         synced_at = NOW()
       RETURNING id`,
      [
        row.propertyId,
        row.startDate,
        row.endDate,
        rawSummary,
        row.guestName,
        row.country,
        row.guestCount || null,
      ]
    );
    return result.rowCount || 0;
  }

  const existing = await db.get(
    `SELECT id FROM bookings
     WHERE property_id = ? AND platform = 'booking' AND start_date = ? AND end_date = ?`,
    [row.propertyId, row.startDate, row.endDate]
  );

  if (existing) {
    const result = await db.run(
      `UPDATE bookings
       SET raw_summary = ?, guest_name = ?, guest_country = ?, guest_count = ?,
           booking_type = 'reservation', active = 1, missing_since = NULL,
           synced_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rawSummary, row.guestName, row.country, row.guestCount || null, existing.id]
    );
    return result.changes || 0;
  }

  const result = await db.run(
    `INSERT INTO bookings (
       property_id, platform, start_date, end_date, raw_summary,
       guest_name, guest_country, guest_count, booking_type,
       active, missing_since, synced_at, created_at
     )
     VALUES (?, 'booking', ?, ?, ?, ?, ?, ?, 'reservation', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      row.propertyId,
      row.startDate,
      row.endDate,
      rawSummary,
      row.guestName,
      row.country,
      row.guestCount || null,
    ]
  );
  return result.changes || 0;
}

/**
 * Enrich bookings from Airbnb CSV and Booking.com XLS exports.
 * Exports are manual snapshots: they may add or update known bookings, but
 * cron must not hide rows that are absent from a snapshot.
 * @param {object} db - The database module (already initialized)
 * @param {boolean} isPostgres - Whether using Postgres (vs SQLite)
 * @returns {{ parsed: number, updated: number, skipped: number, archived: number, deleted: number }}
 */
async function enrichFromExports(db, isPostgres) {
  let parsed = 0;
  let updated = 0;
  let skipped = 0;
  let deleted = 0;
  let archived = 0;

  // Gracefully handle missing exports directory
  if (!fs.existsSync(EXPORTS_DIR)) {
    console.log('Enrich: Exports/ directory not found, skipping enrichment');
    return { parsed, updated, skipped };
  }

  let files;
  try {
    files = fs.readdirSync(EXPORTS_DIR);
  } catch (err) {
    console.log(`Enrich: could not read Exports/ directory: ${err.message}`);
    return { parsed, updated, skipped };
  }

  // Process Airbnb CSVs
  const csvFiles = files.filter(f => f.endsWith('.csv'));
  if (csvFiles.length > 0) {
    console.log(`Enrich: found ${csvFiles.length} CSV file(s): ${csvFiles.join(', ')}`);

    for (const file of csvFiles) {
      const filePath = path.join(EXPORTS_DIR, file);
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
      } catch (err) {
        console.log(`Enrich: could not read ${file}: ${err.message}`);
        continue;
      }

      const rows = parseCSV(content);
      console.log(`Enrich: ${file} - ${rows.length} rows`);

      for (const row of rows) {
        parsed++;

        const status = row['Status'] || row['status'] || '';
        const guestName = row['Guest name'] || row['Guest Name'];
        const contact = row['Contact'];
        const listing = row['Listing'];
        const startDateRaw = row['Start date'] || row['Start Date'];
        const endDateRaw = row['End date'] || row['End Date'];

        if (!listing || !startDateRaw || !endDateRaw || !guestName) {
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

        // Airbnb iCal is the source of truth for active reservations. CSV exports are
        // manual snapshots, so they must only enrich matching bookings, never delete.
        if (!isActiveAirbnbStatus(status)) {
          skipped++;
          continue;
        }

        const country = extractCountry(contact);
        const adults = parseInt(row['# of adults']) || 0;
        const children = parseInt(row['# of children']) || 0;
        const infants = parseInt(row['# of infants']) || 0;
        const guestCount = adults + children + infants;

        try {
          const changes = await updateBooking(db, isPostgres, propertyId, 'airbnb', startDate, endDate, guestName, country, guestCount);
          if (changes > 0) updated++;
        } catch (err) {
          console.error(`Enrich: error updating ${guestName}: ${err.message}`);
        }
      }
    }

  }

  // Process Booking.com XLS files. Booking.com iCal often exposes reservations as
  // CLOSED/Not available blocks, so XLS rows enrich those blocks with guest data.
  // Missing XLS rows are not authoritative enough to hide existing reservations.
  const xlsFiles = files.filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'));
  if (xlsFiles.length > 0) {
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch (err) {
      console.log('Enrich: xlsx module not installed, skipping Booking.com XLS enrichment');
      return { parsed, updated, skipped };
    }

    console.log(`Enrich: found ${xlsFiles.length} XLS file(s): ${xlsFiles.join(', ')}`);

    for (const file of xlsFiles) {
      const filePath = path.join(EXPORTS_DIR, file);
      let rows;
      try {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet);
      } catch (err) {
        console.log(`Enrich: could not read ${file}: ${err.message}`);
        continue;
      }

      console.log(`Enrich: ${file} - ${rows.length} rows`);

      for (const row of rows) {
        parsed++;

        const status = getField(row, 'Status') || '';
        const guestName = getField(row, 'Guest Name(s)', 'Guest name(s)', 'Booked by');
        const roomType = getField(row, 'Unit type');
        const checkIn = normalizeDateField(getField(row, 'Check-in'));
        const checkOut = normalizeDateField(getField(row, 'Check-out'));
        const bookerCountry = getField(row, 'Booker country');
        const adults = parseInt(getField(row, 'Adults')) || 0;
        const children = parseInt(getField(row, 'Children')) || 0;
        const guestCount = adults + children;

        if (!roomType || !checkIn || !checkOut || !guestName) {
          skipped++;
          continue;
        }

        const propertyId = BOOKING_ROOM_MAP[roomType];
        if (!propertyId) {
          skipped++;
          continue;
        }

        if (String(status).toLowerCase().includes('cancelled')) {
          skipped++;
          continue;
        }

        const country = normalizeCountry(bookerCountry);
        const bookingRow = {
          propertyId,
          startDate: checkIn,
          endDate: checkOut,
          guestName,
          country,
          guestCount,
        };

        try {
          const changes = await upsertBookingExportRow(db, isPostgres, bookingRow);
          if (changes > 0) updated++;
          else skipped++;
        } catch (err) {
          console.error(`Enrich: error updating ${guestName}: ${err.message}`);
        }
      }
    }
  }

  console.log(`Enrich: parsed=${parsed}, updated=${updated}, skipped=${skipped}, archived=${archived}, deleted=${deleted}`);
  return { parsed, updated, skipped, archived, deleted };
}

module.exports = { enrichFromExports };
