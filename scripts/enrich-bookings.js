const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');
const { enrichFromExports } = require('../backend/src/enrich-from-exports');

async function main() {
  console.log('Initializing database...');
  await db.init();

  const result = await enrichFromExports(db, Boolean(USE_POSTGRES));
  console.log(`Enrich complete: parsed=${result.parsed}, updated=${result.updated}, skipped=${result.skipped}, archived=${result.archived || 0}, deleted=${result.deleted || 0}`);
}

main()
  .catch(err => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.close === 'function') {
      await db.close();
    }
  });
