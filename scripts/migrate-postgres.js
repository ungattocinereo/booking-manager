require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
process.env.POSTGRES_AUTO_MIGRATE = 'false';

const db = require('../backend/src/database-postgres');

async function main() {
  await db.init();
  await db.migrate();
  await db.close();
  console.log('Postgres migration completed');
}

main().catch(error => {
  console.error(`Postgres migration failed: ${error.message}`);
  process.exit(1);
});
