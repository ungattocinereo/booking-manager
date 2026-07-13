const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../backend/src/database-postgres');

function fakeClient(acquired) {
  const queries = [];
  let released = false;
  return {
    queries,
    get released() {
      return released;
    },
    async query(sql) {
      queries.push(sql);
      if (sql.includes('pg_try_advisory_xact_lock')) {
        return { rows: [{ acquired }] };
      }
      return { rows: [] };
    },
    release() {
      released = true;
    }
  };
}

test('Postgres sync lock stays transaction-scoped for pooled connections', async () => {
  const client = fakeClient(true);
  db.pool = { connect: async () => client };

  const lock = await db.acquireSyncLock();
  assert.equal(lock, client);
  assert.deepEqual(client.queries, [
    'BEGIN',
    'SELECT pg_try_advisory_xact_lock($1) AS acquired'
  ]);

  await db.releaseSyncLock(lock);
  assert.deepEqual(client.queries, [
    'BEGIN',
    'SELECT pg_try_advisory_xact_lock($1) AS acquired',
    'COMMIT'
  ]);
  assert.equal(client.released, true);
  db.pool = null;
});

test('Postgres sync lock rolls back immediately when another sync owns it', async () => {
  const client = fakeClient(false);
  db.pool = { connect: async () => client };

  const lock = await db.acquireSyncLock();
  assert.equal(lock, null);
  assert.deepEqual(client.queries, [
    'BEGIN',
    'SELECT pg_try_advisory_xact_lock($1) AS acquired',
    'ROLLBACK'
  ]);
  assert.equal(client.released, true);
  db.pool = null;
});
