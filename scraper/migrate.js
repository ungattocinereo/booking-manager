const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync('./scraper/add-guest-country-column.sql', 'utf8');
    await client.query(sql);
    console.log('✅ Migration complete: guest_country column added');
  } catch (error) {
    console.error('❌ Migration error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
