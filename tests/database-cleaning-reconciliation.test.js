const test = require('node:test');
const assert = require('node:assert/strict');
const postgresDb = require('../backend/src/database-postgres');
const sqliteDb = require('../backend/src/database');

test('Postgres archives checkout tasks not present in normalized booking keys', async () => {
  const originalExecute = postgresDb.execute;
  let execution = null;
  postgresDb.execute = async (sql, params) => {
    execution = { sql, params };
    return { rowCount: 1 };
  };

  try {
    await postgresDb.archiveStaleCleaningTasks('2026-08-16', [
      'susy|2026-08-17',
      'susy|2026-08-17',
      'susy|2026-08-22'
    ]);
    assert.match(execution.sql, /= ANY\(\$2::text\[\]\)/);
    assert.deepEqual(execution.params, [
      '2026-08-16',
      ['susy|2026-08-17', 'susy|2026-08-22']
    ]);
  } finally {
    postgresDb.execute = originalExecute;
  }
});

test('SQLite archives checkout tasks not present in normalized booking keys', async () => {
  const originalRun = sqliteDb.run;
  let execution = null;
  sqliteDb.run = async (sql, params) => {
    execution = { sql, params };
    return { changes: 1 };
  };

  try {
    await sqliteDb.archiveStaleCleaningTasks('2026-08-16', [
      'susy|2026-08-17',
      'susy|2026-08-22'
    ]);
    assert.match(execution.sql, /NOT IN \(\?, \?\)/);
    assert.deepEqual(execution.params, [
      '2026-08-16',
      'susy|2026-08-17',
      'susy|2026-08-22'
    ]);
  } finally {
    sqliteDb.run = originalRun;
  }
});
