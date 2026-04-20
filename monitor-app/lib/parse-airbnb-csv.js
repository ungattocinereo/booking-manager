const { AIRBNB_LISTING_MAP } = require('./properties');

function parseCSV(content) {
  const normalized = content
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");

  const lines = normalized.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
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
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { values.push(current); current = ''; }
      else current += ch;
    }
  }
  values.push(current);
  return values;
}

function toISODate(mdyyyy) {
  if (!mdyyyy) return null;
  const parts = mdyyyy.split('/');
  if (parts.length !== 3) return null;
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function classifyStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  return 'active';
}

function parseAirbnbCsv(content) {
  const rows = parseCSV(content);
  const parsed = [];
  for (const row of rows) {
    const listing = row['Listing'];
    const propertyId = AIRBNB_LISTING_MAP[listing];
    if (!propertyId) continue;

    const startDate = toISODate(row['Start date'] || row['Start Date']);
    const endDate = toISODate(row['End date'] || row['End Date']);
    if (!startDate || !endDate) continue;

    const confirmationCode = row['Confirmation code'] || row['Confirmation Code'] || null;
    const guestName = row['Guest name'] || row['Guest Name'] || null;
    const bookedRaw = row['Booked'] || null;
    const bookedAt = bookedRaw && /^\d{4}-\d{2}-\d{2}$/.test(bookedRaw) ? bookedRaw : null;
    const status = classifyStatus(row['Status']);

    parsed.push({
      propertyId,
      platform: 'airbnb',
      startDate,
      endDate,
      guestName,
      confirmationCode,
      bookedAt,
      status,
      bookingKey: `${propertyId}|airbnb|${startDate}|${endDate}`
    });
  }
  return parsed;
}

module.exports = { parseAirbnbCsv };
