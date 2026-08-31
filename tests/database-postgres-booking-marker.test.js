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

test('Postgres treats an earlier guest reservation as the canonical Booking start', async () => {
  const originalQueryOne = db.queryOne;
  let capturedQuery;

  db.queryOne = async (sql, params) => {
    capturedQuery = { sql, params };
    return { start_date: '2026-08-17' };
  };

  try {
    const startDate = await db.findOriginalBookingMarkerStart(
      'central',
      'booking',
      '2026-08-18',
      '2026-08-19',
      'blocked'
    );

    assert.equal(startDate, '2026-08-17');
    assert.deepEqual(capturedQuery.params, ['central', '2026-08-19', '2026-08-18']);
    assert.match(capturedQuery.sql, /candidate\.active IS NOT FALSE/);
    assert.match(capturedQuery.sql, /TRIM\(candidate\.guest_name\).*<> ''/s);
    assert.match(capturedQuery.sql, /COALESCE\(candidate\.guest_count, 0\) > 0/);
    assert.match(capturedQuery.sql, /NOT EXISTS[\s\S]*previous\.end_date <= \$3::date/);
  } finally {
    db.queryOne = originalQueryOne;
  }
});

test('Postgres archives older marker snapshots when the live start is canonical', async () => {
  const originalQueryOne = db.queryOne;
  const originalExecute = db.execute;
  const executions = [];

  db.queryOne = async () => null;
  db.execute = async (sql, params) => {
    executions.push({ sql, params });
    return { rowCount: 1, rows: [] };
  };

  try {
    const result = await db.upsertBooking(
      'youth',
      'booking',
      '2026-08-31',
      '2026-09-02',
      'CLOSED - Not available',
      { bookingType: 'blocked' }
    );

    assert.equal(result.canonicalStartDate, '2026-08-31');
    assert.equal(executions.length, 2);
    assert.match(executions[1].sql, /start_date <> \$3::date/);
    assert.deepEqual(executions[1].params, ['youth', '2026-09-02', '2026-08-31']);
  } finally {
    db.queryOne = originalQueryOne;
    db.execute = originalExecute;
  }
});
