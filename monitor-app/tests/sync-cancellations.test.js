const test = require('node:test');
const assert = require('node:assert/strict');
const { planCancellationTransitions } = require('../scripts/sync');

function tracked(propertyId, index = 1) {
  return {
    bookingKey: `${propertyId}|airbnb|2026-09-${String(index).padStart(2, '0')}|2026-09-${String(index + 1).padStart(2, '0')}`,
    propertyId,
    platform: 'airbnb'
  };
}

function plan({ trackedActiveLive, current = [], successful = [], pending = {}, detectedAt = '2026-08-03T10:00:00.000Z' }) {
  return planCancellationTransitions({
    trackedActiveLive,
    currentByKey: new Map(current.map(event => [event.bookingKey, event])),
    successfulPropertySet: new Set(successful),
    pendingCancellations: pending,
    detectedAt
  });
}

test('failed property fetch does not create or advance a cancellation', () => {
  const event = tracked('harmony');
  const pending = {};
  const result = plan({ trackedActiveLive: [event], successful: [], pending });
  assert.equal(result.confirmationCandidates.length, 0);
  assert.deepEqual(pending, {});
});

test('two successful missing snapshots confirm one cancellation', () => {
  const event = tracked('harmony');
  const pending = {};
  const first = plan({ trackedActiveLive: [event], successful: ['harmony'], pending });
  assert.equal(first.confirmationCandidates.length, 0);
  assert.equal(pending[event.bookingKey].consecutiveSuccessfulMisses, 1);

  const second = plan({
    trackedActiveLive: [event],
    successful: ['harmony'],
    pending,
    detectedAt: '2026-08-03T10:30:00.000Z'
  });
  assert.deepEqual(second.confirmationCandidates.map(item => item.bookingKey), [event.bookingKey]);
  assert.equal(pending[event.bookingKey].consecutiveSuccessfulMisses, 2);
});

test('a returned booking clears its pending cancellation', () => {
  const event = tracked('royal');
  const pending = {
    [event.bookingKey]: {
      bookingKey: event.bookingKey,
      propertyId: event.propertyId,
      firstMissingAt: '2026-08-03T09:00:00.000Z',
      lastMissingAt: '2026-08-03T09:00:00.000Z',
      consecutiveSuccessfulMisses: 1
    }
  };
  const result = plan({
    trackedActiveLive: [event],
    current: [event],
    successful: ['royal'],
    pending
  });
  assert.equal(result.confirmationCandidates.length, 0);
  assert.deepEqual(pending, {});
});

test('per-property mass drop stays blocked after confirmation', () => {
  const events = Array.from({ length: 5 }, (_, index) => tracked('carina', index + 1));
  const pending = Object.fromEntries(events.map(event => [event.bookingKey, {
    bookingKey: event.bookingKey,
    propertyId: event.propertyId,
    firstMissingAt: '2026-08-03T09:00:00.000Z',
    lastMissingAt: '2026-08-03T09:00:00.000Z',
    consecutiveSuccessfulMisses: 1
  }]));
  const result = plan({ trackedActiveLive: events, successful: ['carina'], pending });
  assert.equal(result.confirmationCandidates.length, 5);
  assert.equal(result.suspiciousKeys.size, 5);
  assert.match(result.warnings.join('\n'), /property cancellation guard \(carina\)/);
});
