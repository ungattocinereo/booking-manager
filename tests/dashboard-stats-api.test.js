const test = require('node:test');
const assert = require('node:assert/strict');

function fakeResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

test('dashboard statistics mode is read-only and returns requested history', async () => {
  const dbPath = require.resolve('../backend/src/database');
  const handlerPath = require.resolve('../api/dashboard');
  const savedDb = require.cache[dbPath];
  const savedHandler = require.cache[handlerPath];
  const savedPostgresUrl = process.env.POSTGRES_URL;
  const savedDatabaseUrl = process.env.DATABASE_URL;
  const queries = [];
  const snapshots = [{ id: 1, season_year: 2026, booking_count: 12 }];

  try {
    delete process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL;
    require.cache[dbPath] = {
      id: dbPath,
      filename: dbPath,
      loaded: true,
      exports: {
        db: {},
        getStatsSnapshots: async options => {
          queries.push(options);
          return snapshots;
        }
      }
    };
    delete require.cache[handlerPath];
    const handler = require('../api/dashboard');

    const denied = fakeResponse();
    await handler({ method: 'POST', query: { stats_only: '1' } }, denied);
    assert.equal(denied.statusCode, 405);
    assert.equal(denied.headers.allow, 'GET');
    assert.equal(queries.length, 0);

    const response = fakeResponse();
    await handler({
      method: 'GET',
      query: { stats_only: '1', season_year: '2026', limit: '1000' }
    }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, snapshots);
    assert.deepEqual(queries, [{ seasonYear: '2026', limit: '1000' }]);
    assert.match(response.headers['cache-control'], /private/);
    assert.match(response.headers['cache-control'], /no-store/);
  } finally {
    if (savedDb) require.cache[dbPath] = savedDb;
    else delete require.cache[dbPath];
    if (savedHandler) require.cache[handlerPath] = savedHandler;
    else delete require.cache[handlerPath];
    if (savedPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = savedPostgresUrl;
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
  }
});
