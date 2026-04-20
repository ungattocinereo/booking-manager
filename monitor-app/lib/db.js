const { Client } = require('pg');

function getConnectionString() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('POSTGRES_URL (or DATABASE_URL) is not set');
  return url;
}

async function withClient(fn) {
  const client = new Client({
    connectionString: getConnectionString(),
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = { withClient };
