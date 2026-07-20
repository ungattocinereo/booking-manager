const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../backend/src/database-postgres');

test('Postgres upsert preserves the original start of a shrinking Booking marker', async () => {
  const originalQueryOne = db.queryOne;
  const originalExecute = db.execute;
  const executions = [];

  db.queryOne = async () => ({ start_date: '2026-07-19' });
  db.execute = async (sql, params) => {
    executions.push({ sql, params });
    return { rowCount: 1, rows: [] };
  };

  try {
    const result = await db.upsertBooking(
      'central',
      'booking',
      '2026-07-20',
      '2026-07-22',
      'CLOSED - Not available',
      { bookingType: 'blocked' }
    );

    assert.equal(result.canonicalStartDate, '2026-07-19');
    assert.equal(executions.length, 2);
    assert.equal(executions[0].params[2], '2026-07-19');
    assert.match(executions[1].sql, /start_date > \$3::date/);
    assert.deepEqual(executions[1].params, ['central', '2026-07-22', '2026-07-19']);
  } finally {
    db.queryOne = originalQueryOne;
    db.execute = originalExecute;
  }
});
