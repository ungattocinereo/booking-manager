#!/usr/bin/env node
/**
 * Import Airbnb bookings into Postgres (Vercel production)
 * Updates existing bookings with guest names and countries
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function importAirbnb() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'airbnb-export.json'), 'utf8'));
  const bookings = data.bookings;
  
  console.log(`📦 Importing ${bookings.length} Airbnb bookings...\n`);
  
  const client = await pool.connect();
  
  try {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const booking of bookings) {
      const { guest_name, check_in, check_out, guest_country, property_id, platform } = booking;
      
      // Check if booking exists (match by start_date, end_date, platform)
      const existing = await client.query(
        `SELECT id FROM bookings 
         WHERE start_date = $1 AND end_date = $2 AND platform = $3 LIMIT 1`,
        [check_in, check_out, platform]
      );
      
      if (existing.rows.length > 0) {
        // Update with guest name and country
        await client.query(
          `UPDATE bookings 
           SET guest_name = $1, guest_country = $2
           WHERE id = $3`,
          [guest_name, guest_country, existing.rows[0].id]
        );
        updated++;
        console.log(`✏️  ${guest_name} (${guest_country || '?'}) | ${check_in}`);
      } else {
        // Insert new booking
        try {
          await client.query(
            `INSERT INTO bookings 
             (property_id, start_date, end_date, guest_name, guest_country, platform, booking_type, raw_summary)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [property_id, check_in, check_out, guest_name, guest_country, platform, 'reservation', guest_name]
          );
          inserted++;
          console.log(`➕ ${guest_name} (${guest_country || '?'}) | ${check_in}`);
        } catch (err) {
          skipped++;
          // Silently skip duplicates
        }
      }
    }
    
    console.log(`\n✅ Import complete:`);
    console.log(`   ➕ Inserted: ${inserted}`);
    console.log(`   ✏️  Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    
  } catch (error) {
    console.error('❌ Import error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importAirbnb().catch(err => {
  console.error('💥 Fatal:', err.message);
  process.exit(1);
});
