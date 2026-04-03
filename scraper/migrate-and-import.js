#!/usr/bin/env node
/**
 * 1. Add guest_country column to bookings table
 * 2. Import Booking.com bookings with guest names and countries
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load Vercel Postgres URL from .env.local
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Step 1: Adding guest_country column...\n');
    
    await client.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_country VARCHAR(10);
      CREATE INDEX IF NOT EXISTS idx_bookings_guest_country ON bookings(guest_country);
    `);
    
    console.log('✅ Migration complete\n');
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function importBookings() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'bookingcom-export.json'), 'utf8'));
  const bookings = data.bookings;
  
  console.log(`📦 Step 2: Importing ${bookings.length} bookings...\n`);
  
  const client = await pool.connect();
  
  try {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const booking of bookings) {
      const { guest_name, check_in, check_out, country, room_type, platform } = booking;
      
      // Map "booking_com" to "booking" (platform value in DB)
      const platformDb = platform === 'booking_com' ? 'booking' : platform;
      
      // Check if booking exists (match by start_date, end_date, platform)
      const existing = await client.query(
        `SELECT id FROM bookings 
         WHERE start_date = $1 AND end_date = $2 AND platform = $3 LIMIT 1`,
        [check_in, check_out, platformDb]
      );
      
      if (existing.rows.length > 0) {
        // Update with guest name and country
        await client.query(
          `UPDATE bookings 
           SET guest_name = $1, guest_country = $2
           WHERE id = $3`,
          [guest_name, country, existing.rows[0].id]
        );
        updated++;
        console.log(`✏️  ${guest_name} (${country}) | ${check_in}`);
      } else {
        // Try to insert new booking (some may be missing)
        try {
          await client.query(
            `INSERT INTO bookings 
             (property_id, start_date, end_date, guest_name, guest_country, platform, booking_type, raw_summary)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [room_type || 'unknown', check_in, check_out, guest_name, country, platformDb, 'reservation', guest_name]
          );
          inserted++;
          console.log(`➕ ${guest_name} (${country}) | ${check_in}`);
        } catch (err) {
          skipped++;
          // Silently skip duplicates or constraint errors
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
  }
}

async function main() {
  try {
    await migrate();
    await importBookings();
    console.log('\n🎉 All done!');
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
