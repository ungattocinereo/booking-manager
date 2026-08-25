const test = require('node:test');
const assert = require('node:assert/strict');
const { acquireSyncLockWithRetry } = require('../lib/sync-lock-retry');

test('sync lock retry returns an immediately available lock without sleeping', async () => {
  const expectedLock = { id: 'lock' };
  let sleepCalls = 0;

  const lock = await acquireSyncLockWithRetry(
    async () => expectedLock,
    { sleep: async () => { sleepCalls++; } }
  );

  assert.equal(lock, expectedLock);
  assert.equal(sleepCalls, 0);
});

test('sync lock retry waits through transient contention', async () => {
  const expectedLock = { id: 'lock' };
  const results = [null, null, expectedLock];
  const delays = [];
  const retries = [];
  let nowMs = 0;

  const lock = await acquireSyncLockWithRetry(
    async () => results.shift(),
    {
      waitMs: 1000,
      retryMs: 250,
      now: () => nowMs,
      sleep: async delayMs => {
        delays.push(delayMs);
        nowMs += delayMs;
      },
      onRetry: retry => retries.push(retry)
    }
  );

  assert.equal(lock, expectedLock);
  assert.deepEqual(delays, [250, 250]);
  assert.deepEqual(retries.map(retry => retry.attempt), [1, 2]);
});

test('sync lock retry stops at the configured deadline', async () => {
  const delays = [];
  let attempts = 0;
  let nowMs = 0;

  const lock = await acquireSyncLockWithRetry(
    async () => {
      attempts++;
      return null;
    },
    {
      waitMs: 1000,
      retryMs: 300,
      now: () => nowMs,
      sleep: async delayMs => {
        delays.push(delayMs);
        nowMs += delayMs;
      }
    }
  );

  assert.equal(lock, null);
  assert.equal(attempts, 5);
  assert.deepEqual(delays, [300, 300, 300, 100]);
});
