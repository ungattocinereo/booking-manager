#!/usr/bin/env node
/**
 * Parse Airbnb reservations CSV export
 * Extract guest names, dates, property names, phone countries
 */

const fs = require('fs');
const path = require('path');

const inputFile = '/Users/greg/.openclaw/media/inbound/reservations---faacde3a-7b33-4dd7-9724-2b2517900e86.csv';
const outputFile = path.join(__dirname, 'airbnb-export.json');

// Map listing names to property IDs
const listingMap = {
  'Suite Harmony Royal. Excellent Central Location': 'harmony',
  'Suite Harmony Excellent Central Location': 'harmony',
  'Квартира с офигенским видом!': 'awesome',
  'Orange townhouse room': 'orange',
  'Vintage Townhouse Chamber': 'vintage',
  '2 Story Suite "Carina" Excellent Central Location': 'carina',
  'The Adventure bunkbed room': 'youth'
};

// Extract country from phone prefix
function guessCountryFromPhone(phone) {
  if (!phone) return '';
  const clean = phone.replace(/[\s\-\(\)]/g, '');
  
  // Common patterns
  if (clean.startsWith('+1')) return 'us';
  if (clean.startsWith('+7')) return 'ru';
  if (clean.startsWith('+33')) return 'fr';
  if (clean.startsWith('+34')) return 'es';
  if (clean.startsWith('+36')) return 'hu';
  if (clean.startsWith('+39')) return 'it';
  if (clean.startsWith('+44')) return 'gb';
  if (clean.startsWith('+45')) return 'dk';
  if (clean.startsWith('+46')) return 'se';
  if (clean.startsWith('+49')) return 'de';
  if (clean.startsWith('+56')) return 'cl';
  if (clean.startsWith('+61')) return 'au';
  if (clean.startsWith('+82')) return 'kr';
  if (clean.startsWith('+972')) return 'il';
  if (clean.startsWith('+31')) return 'nl';
  if (clean.startsWith('+20')) return 'eg';
  
  return '';
}

function parseDate(dateStr) {
  // Format: "10/8/2026" -> "2026-10-08"
  const [month, day, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // Skip header
  const dataLines = lines.slice(1);
  
  const bookings = [];
  
  for (const line of dataLines) {
    // Simple CSV parser (handles quoted fields)
    const fields = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    
    if (fields.length < 10) continue;
    
    const [code, status, guestName, contact, adults, children, infants, startDate, endDate, nights, bookedDate, listing, earnings] = fields;
    
    // Skip if not confirmed
    if (status.toLowerCase() !== 'confirmed') continue;
    
    const propertyId = listingMap[listing] || 'unknown';
    const country = guessCountryFromPhone(contact);
    
    bookings.push({
      confirmation_code: code,
      guest_name: guestName,
      guest_country: country,
      contact: contact,
      check_in: parseDate(startDate),
      check_out: parseDate(endDate),
      nights: parseInt(nights) || 0,
      property_id: propertyId,
      listing_name: listing,
      platform: 'airbnb',
      status: 'confirmed',
      booking_type: 'reservation'
    });
  }
  
  return bookings;
}

console.log(`📂 Parsing ${inputFile}\n`);

const bookings = parseCSV(inputFile);

console.log(`✅ Extracted ${bookings.length} Airbnb reservations\n`);

// Show first 5
bookings.slice(0, 5).forEach((b, i) => {
  console.log(`${i+1}. ${b.guest_name} (${b.guest_country || '?'}) | ${b.check_in} → ${b.check_out} | ${b.property_id}`);
});

if (bookings.length > 5) {
  console.log(`... and ${bookings.length - 5} more`);
}

// Save
fs.writeFileSync(outputFile, JSON.stringify({
  exported_at: new Date().toISOString(),
  source: 'airbnb_csv_export',
  count: bookings.length,
  bookings
}, null, 2));

console.log(`\n💾 Saved to ${outputFile}`);
