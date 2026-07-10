const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('POSTGRES_URL or DATABASE_URL is required for production backup');
  process.exit(1);
}

const TABLES = [
  'properties',
  'bookings',
  'cleaners',
  'cleaner_properties',
  'cleaning_tasks',
  'booking_stats_snapshots',
  'sync_runs',
];

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function currentCommit() {
  try {
    return childProcess.execSync('git rev-parse HEAD', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

async function writeJson(filePath, value) {
  const json = JSON.stringify(value, null, 2);
  await fs.promises.writeFile(filePath, json);
  return { bytes: Buffer.byteLength(json), sha256: sha256(json) };
}

async function main() {
  const root = path.join(__dirname, '..');
  const backupDir = path.join(root, 'backup', `vercel-postgres-${timestamp()}`);
  await fs.promises.mkdir(backupDir, { recursive: true });

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  const manifest = {
    created_at: new Date().toISOString(),
    source: 'vercel-postgres',
    commit: currentCommit(),
    directory: backupDir,
    tables: {},
  };

  try {
    await client.query('BEGIN READ ONLY');

    const columns = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    manifest.schema_columns = {
      file: 'schema-columns.json',
      rows: columns.rows.length,
      ...(await writeJson(path.join(backupDir, 'schema-columns.json'), columns.rows)),
    };

    for (const table of TABLES) {
      const exists = await client.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
      if (!exists.rows[0]?.name) {
        manifest.tables[table] = { missing: true };
        continue;
      }

      const order = table === 'cleaner_properties' ? 'cleaner_id, property_id' : 'id';
      const rows = await client.query(`SELECT * FROM ${table} ORDER BY ${order}`);
      manifest.tables[table] = {
        file: `${table}.json`,
        rows: rows.rows.length,
        ...(await writeJson(path.join(backupDir, `${table}.json`), rows.rows)),
      };
    }

    await client.query('ROLLBACK');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  const manifestStats = await writeJson(path.join(backupDir, 'manifest.json'), manifest);
  console.log(JSON.stringify({
    backup_dir: backupDir,
    tables: Object.fromEntries(Object.entries(manifest.tables).map(([name, data]) => [name, data.rows ?? null])),
    manifest_sha256: manifestStats.sha256,
  }, null, 2));
}

main().catch(error => {
  console.error(`Backup failed: ${error.message}`);
  process.exit(1);
});
