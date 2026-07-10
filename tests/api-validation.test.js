const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCleanerName,
  cleanerIdFromName,
  normalizeCleanerSlug,
  normalizePropertyIds,
  isDateOnly,
  normalizeTaskType
} = require('../lib/api-validation');

test('API validation normalizes supported admin inputs', () => {
  assert.equal(normalizeCleanerName('  Анна  '), 'Анна');
  assert.equal(cleanerIdFromName(' Анна Мария '), 'анна_мария');
  assert.equal(normalizeCleanerSlug(' Anna--Maria '), 'anna-maria');
  assert.deepEqual(normalizePropertyIds(['orange', 'orange', ' solo ']), ['orange', 'solo']);
  assert.equal(normalizeTaskType(undefined), 'manual');
  assert.equal(normalizeTaskType('unknown'), null);
});

test('date-only validation rejects rollover dates and timestamps', () => {
  assert.equal(isDateOnly('2026-07-10'), true);
  assert.equal(isDateOnly('2026-02-30'), false);
  assert.equal(isDateOnly('2026-07-10T00:00:00Z'), false);
});
