const fs = require('node:fs');
const path = require('node:path');
const schema = fs.readFileSync(path.join(__dirname, '../database/analytics.sql'), 'utf8');
const locks = new WeakMap();
function adapter(db, client) {
  const pg = Boolean(db.pool);
  const sql = text => { let i = 0; return pg ? text.replace(/\?/g, () => `$${++i}`) : text; };
  return {
    all: async (text, args = []) => pg ? (await client.query(sql(text), args)).rows : db.all(text, args),
    run: (text, args = []) => pg ? client.query(sql(text), args) : db.run(text, args)
  };
}
async function transaction(db, fn) {
  const previous = locks.get(db) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const client = db.pool ? await db.pool.connect() : null;
    const io = adapter(db, client);
    try {
      await io.run(db.pool ? 'BEGIN' : 'BEGIN IMMEDIATE');
      if (db.pool) await io.run('SELECT pg_advisory_xact_lock(1729042027)');
      const result = await fn(io);
      await io.run('COMMIT');
      return result;
    } catch (error) {
      await io.run('ROLLBACK').catch(() => {});
      throw error;
    } finally { if (client) client.release(); }
  });
  locks.set(db, next);
  return next;
}
async function readAnalytics(db) {
  const client = db.pool ? await db.pool.connect() : null;
  const io = adapter(db, client);
  try {
    const states = await io.all('SELECT payload FROM booking_analytics_state ORDER BY id');
    const events = await io.all('SELECT id, occurred_at, kind, property_id, platform, payload FROM booking_analytics_events ORDER BY occurred_at, id');
    const snapshots = await io.all('SELECT snapshot_date, captured_at, payload FROM booking_analytics_snapshots ORDER BY snapshot_date');
    return { states: states.map(r => JSON.parse(r.payload)), events: events.map(r => ({ ...r, ...JSON.parse(r.payload) })), snapshots: snapshots.map(r => ({ ...r, ...JSON.parse(r.payload) })) };
  } catch (e) {
    if (e.code === '42P01' || /no such table: booking_analytics/.test(e.message)) return { states: [], events: [], snapshots: [] };
    throw e;
  } finally { if (client) client.release(); }
}
module.exports = { schema, transaction, readAnalytics };
