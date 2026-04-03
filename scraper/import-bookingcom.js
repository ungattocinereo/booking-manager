/**
 * Import Booking.com bookings into Postgres (Vercel production)
 * Updates existing bookings with guest names and countries
 */

const fs = require('fs');
const { Pool } = require('pg');

// Load bookings
const data = JSON.parse(fs.readFileSync('./bookingcom-export.json', 'utf8'));
const bookings = data.bookings;

console.log(`📦 Loaded ${bookings.length} bookings from export\n`);

// Connect to Vercel Postgres
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function importBookings() {
  const client = await pool.connect();
  
  try {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const booking of bookings) {
      const { guest_name, check_in, check_out, country, room_type, price_eur, platform, status } = booking;
      
      // Check if booking exists (match by start_date, end_date, platform)
      const existing = await client.query(
        `SELECT id FROM bookings 
         WHERE start_date = $1 AND end_date = $2 AND platform = $3`,
        [check_in, check_out, platform]
      );
      
      if (existing.rows.length > 0) {
        // Update with guest name and country
        await client.query(
          `UPDATE bookings 
           SET guest_name = $1, guest_country = $2, updated_at = NOW()
           WHERE id = $3`,
          [guest_name, country, existing.rows[0].id]
        );
        updated++;
        console.log(`✏️  Updated: ${guest_name} (${country}) | ${check_in}`);
      } else {
        // Insert new booking
        try {
          await client.query(
            `INSERT INTO bookings 
             (property_id, start_date, end_date, guest_name, guest_country, platform, booking_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [room_type, check_in, check_out, guest_name, country, platform, booking.booking_type || 'reservation']
          );
          inserted++;
          console.log(`➕ Inserted: ${guest_name} (${country}) | ${check_in}`);
        } catch (err) {
          // Probably duplicate
          skipped++;
          console.log(`⏭️  Skipped: ${guest_name} | ${check_in} (duplicate or constraint error)`);
        }
      }
    }
    
    console.log(`\n✅ Import complete:`);
    console.log(`   ➕ Inserted: ${inserted}`);
    console.log(`   ✏️  Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

importBookings();
