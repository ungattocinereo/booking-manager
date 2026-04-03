/**
 * Parse Booking.com manual export and import into database
 * 
 * Extracts guest names, check-in/out dates, prices, room types from the CSV export
 */

const fs = require('fs');
const path = require('path');

// Read the raw file
const inputFile = '/Users/greg/.openclaw/media/inbound/Check-in_2026-03-01_to_2026-11-30---97ea022d-63d6-4901-a00b-367b8d5f26db';
const rawData = fs.readFileSync(inputFile, 'utf8');

// Extract all guest names, dates, prices, room types
// Pattern: Guest Name, Check-in, Check-out, Price, Room
const bookings = [];

// Manual parsing based on visible patterns in the file
const lines = rawData.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Look for patterns like "Surname, Firstname" followed by dates
  // Guest names often appear as "Lastname, Firstname" or "Firstname Lastname"
  
  // Example patterns from the file:
  // Jones, Tomos → 2026-04-04 to 2026-04-07 → 375 EUR → Orange Room
  
  if (line.includes('Ā') && line.includes('2026-')) {
    // This is likely a booking entry
    const match = line.match(/Ā([A-Za-z\s,áéíóúüñž']+)\s+.*?(2026-\d{2}-\d{2}).*?(2026-\d{2}-\d{2}).*?(\d+\.?\d*)\s*EUR/);
    
    if (match) {
      const [, guestName, checkIn, checkOut, price] = match;
      
      // Extract room type if present
      let roomType = 'Unknown';
      if (line.includes('Orange')) roomType = 'orange';
      else if (line.includes('Vintage') || line.includes('Vingtage')) roomType = 'vintage';
      else if (line.includes('Youth')) roomType = 'youth';
      else if (line.includes('Solo')) roomType = 'solo';
      else if (line.includes('Awesome')) roomType = 'awesome';
      
      bookings.push({
        guest_name: guestName.trim(),
        check_in: checkIn,
        check_out: checkOut,
        price_eur: parseFloat(price),
        room_type: roomType,
        platform: 'booking_com',
        status: 'confirmed',
        booking_type: 'reservation'
      });
    }
  }
}

console.log(`📊 Extracted ${bookings.length} bookings from manual export\n`);

// Display first 10
bookings.slice(0, 10).forEach((b, i) => {
  console.log(`${i+1}. ${b.guest_name} | ${b.check_in} → ${b.check_out} | €${b.price_eur} | ${b.room_type}`);
});

// Save to JSON for import
const outputFile = path.join(__dirname, 'booking-com-manual-export.json');
fs.writeFileSync(outputFile, JSON.stringify({
  exported_at: new Date().toISOString(),
  source: 'manual_booking_export',
  count: bookings.length,
  bookings
}, null, 2));

console.log(`\n💾 Saved to ${outputFile}`);
console.log(`\n✅ Ready to import into database`);
