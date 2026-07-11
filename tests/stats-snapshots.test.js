const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalizeStatsSnapshots,
  computeBookingStatsSnapshot,
  romeDateKey,
  shouldReplaceDailySnapshot
} = require('../backend/src/stats-snapshots');

test('occupancy counts unique property nights instead of overlapping rows', () => {
  const bookings = [
    {
      id: 1,
      property_id: 'orange',
      platform: 'booking',
      start_date: '2026-04-01',
      end_date: '2026-04-05',
      guest_name: 'Guest A',
      guest_count: 2,
      booking_type: 'reservation'
    },
    {
      id: 2,
      property_id: 'orange',
      platform: 'airbnb',
      start_date: '2026-04-03',
      end_date: '2026-04-07',
      guest_name: 'Guest B',
      guest_count: 2,
      booking_type: 'reservation'
    },
    {
      id: 3,
      property_id: 'solo',
      platform: 'booking',
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      guest_name: 'Guest C',
      guest_count: 1,
      booking_type: 'reservation'
    },
    {
      id: 4,
      property_id: 'solo',
      platform: 'booking',
      start_date: '2026-04-10',
      end_date: '2026-04-12',
      raw_summary: 'CLOSED - Not available',
      booking_type: 'blocked'
    },
    {
      id: 5,
      property_id: 'orange',
      platform: 'booking',
      start_date: '2026-04-04',
      end_date: '2026-04-06',
      raw_summary: 'CLOSED - Not available',
      booking_type: 'blocked'
    }
  ];

  const snapshot = computeBookingStatsSnapshot({
    bookings,
    properties: [{ id: 'orange' }, { id: 'solo' }],
    seasonYear: 2026,
    capturedAt: '2026-07-10T12:00:00.000Z'
  });

  assert.equal(snapshot.booking_count, 3);
  assert.equal(snapshot.occupied_nights, 8);
  assert.equal(snapshot.monthly_nights['2026-04'], 8);
  assert.deepEqual(snapshot.payload.property_occupied_nights, { orange: 6, solo: 2 });
  assert.equal(snapshot.payload.gross_nights, 488);
  assert.equal(snapshot.payload.unavailable_nights, 2);
  assert.equal(snapshot.payload.sellable_nights, 486);
  assert.equal(snapshot.payload.potential_nights, 486);
  assert.deepEqual(snapshot.payload.property_unavailable_nights, { orange: 0, solo: 2 });
  assert.equal(snapshot.occupancy_percent, 1.65);
  assert.equal(snapshot.payload.data_quality.valid, true);
  assert.ok(snapshot.occupancy_percent <= 100);
});

test('booking keys are stable, sorted and contain no guest PII', () => {
  const base = {
    property_id: 'orange',
    platform: 'booking',
    start_date: '2026-06-01',
    end_date: '2026-06-05',
    booking_type: 'reservation',
    guest_name: 'Sensitive Name',
    guest_count: 2
  };
  const first = computeBookingStatsSnapshot({
    bookings: [base],
    properties: [{ id: 'orange' }],
    seasonYear: 2026
  });
  const renamed = computeBookingStatsSnapshot({
    bookings: [{ ...base, guest_name: 'Another Sensitive Name', guest_count: 4 }],
    properties: [{ id: 'orange' }],
    seasonYear: 2026
  });

  assert.deepEqual(first.payload.booking_keys, renamed.payload.booking_keys);
  assert.match(first.payload.booking_keys[0], /^b1_[a-f0-9]{20}$/);
  assert.equal(first.payload.booking_keys[0].includes('Sensitive'), false);
});

test('Rome calendar dates roll over independently of UTC', () => {
  assert.equal(romeDateKey('2026-07-01T21:59:59.000Z'), '2026-07-01');
  assert.equal(romeDateKey('2026-07-01T22:00:00.000Z'), '2026-07-02');
});

test('history is canonicalized by Rome day and ignores legacy zero artifacts', () => {
  const rows = [
    {
      id: 1,
      captured_at: '2026-06-30T10:00:00.000Z',
      booking_count: 0,
      occupied_nights: 0,
      guest_count: 0,
      payload: {}
    },
    {
      id: 2,
      captured_at: '2026-07-01T10:00:00.000Z',
      booking_count: 10,
      occupied_nights: 30,
      guest_count: 20,
      payload: {}
    },
    {
      id: 3,
      captured_at: '2026-07-01T20:00:00.000Z',
      booking_count: 12,
      occupied_nights: 34,
      guest_count: 24,
      payload: {}
    },
    {
      id: 4,
      captured_at: '2026-07-01T21:00:00.000Z',
      booking_count: 0,
      occupied_nights: 0,
      guest_count: 0,
      payload: {}
    },
    {
      id: 5,
      captured_at: '2026-07-02T09:00:00.000Z',
      booking_count: 0,
      occupied_nights: 0,
      guest_count: 0,
      payload: { snapshot_date: '2026-07-02', data_quality: { valid: true } }
    }
  ];

  const canonical = canonicalizeStatsSnapshots(rows, { limit: 10 });

  assert.equal(canonical.length, 2);
  assert.equal(canonical[0].id, 3);
  assert.equal(canonical[0].snapshot_date, '2026-07-01');
  assert.equal(canonical[1].id, 5);
  assert.deepEqual(canonical[1].payload.history_quality, {
    raw_snapshots: 5,
    canonical_days: 2,
    collapsed_duplicates: 2,
    ignored_legacy_zero_snapshots: 2
  });
});

test('a successful daily snapshot cannot be overwritten by a later partial sync', () => {
  const success = {
    captured_at: '2026-07-10T10:00:00.000Z',
    booking_count: 12,
    payload: { data_quality: { valid: true }, sync_status: 'success' }
  };
  const partial = {
    captured_at: '2026-07-10T12:00:00.000Z',
    booking_count: 9,
    payload: { data_quality: { valid: true }, sync_status: 'partial' }
  };

  assert.equal(shouldReplaceDailySnapshot(success, partial), false);
  assert.equal(shouldReplaceDailySnapshot(partial, success), true);
});

test('a partial snapshot cannot replace meaningful legacy data without quality metadata', () => {
  const legacy = {
    captured_at: '2026-07-10T10:00:00.000Z',
    booking_count: 12,
    occupied_nights: 40,
    payload: {}
  };
  const partial = {
    captured_at: '2026-07-10T12:00:00.000Z',
    booking_count: 9,
    occupied_nights: 31,
    payload: { data_quality: { valid: true }, sync_status: 'partial' }
  };

  assert.equal(shouldReplaceDailySnapshot(legacy, partial), false);
  assert.equal(canonicalizeStatsSnapshots([legacy, partial])[0].booking_count, 12);
});

test('an explicitly valid empty snapshot stays visible but cannot erase meaningful same-day data', () => {
  const meaningful = {
    captured_at: '2026-07-10T10:00:00.000Z',
    booking_count: 12,
    occupied_nights: 40,
    payload: { data_quality: { valid: true }, sync_status: 'success' }
  };
  const empty = {
    captured_at: '2026-07-10T12:00:00.000Z',
    booking_count: 0,
    occupied_nights: 0,
    guest_count: 0,
    payload: { data_quality: { valid: true }, sync_status: 'success' }
  };

  assert.equal(shouldReplaceDailySnapshot(meaningful, empty), false);
  assert.equal(canonicalizeStatsSnapshots([meaningful, empty])[0].booking_count, 12);
  assert.equal(canonicalizeStatsSnapshots([empty])[0].booking_count, 0);
});

test('a computed empty sync is flagged and removed from a meaningful multi-day history', () => {
  const meaningful = {
    captured_at: '2026-07-10T10:00:00.000Z',
    season_year: 2026,
    booking_count: 12,
    occupied_nights: 40,
    payload: { data_quality: { valid: true }, sync_status: 'success' }
  };
  const empty = computeBookingStatsSnapshot({
    bookings: [],
    properties: [{ id: 'orange' }],
    seasonYear: 2026,
    capturedAt: '2026-07-11T10:00:00.000Z',
    syncStatus: 'success'
  });

  assert.equal(empty.payload.data_quality.valid, false);
  assert.equal(empty.payload.data_quality.status, 'empty');
  assert.deepEqual(canonicalizeStatsSnapshots([meaningful, empty]).map(row => row.booking_count), [12]);
});

test('a successful explicitly allowed empty snapshot cannot replace a meaningful partial snapshot', () => {
  const partialMeaningful = {
    captured_at: '2026-07-10T10:00:00.000Z',
    booking_count: 9,
    occupied_nights: 31,
    payload: { data_quality: { valid: true }, sync_status: 'partial' }
  };
  const successfulEmpty = {
    captured_at: '2026-07-10T12:00:00.000Z',
    booking_count: 0,
    occupied_nights: 0,
    guest_count: 0,
    payload: { data_quality: { valid: true, empty_expected: true }, sync_status: 'success' }
  };

  assert.equal(shouldReplaceDailySnapshot(partialMeaningful, successfulEmpty), false);
  assert.equal(canonicalizeStatsSnapshots([partialMeaningful, successfulEmpty])[0].booking_count, 9);
});

test('history without a season filter keeps snapshots from different seasons on the same Rome day', () => {
  const rows = [2026, 2027].map((seasonYear, index) => ({
    id: index + 1,
    captured_at: '2026-07-10T10:00:00.000Z',
    season_year: seasonYear,
    booking_count: 10 + index,
    payload: { data_quality: { valid: true }, sync_status: 'success' }
  }));

  assert.deepEqual(canonicalizeStatsSnapshots(rows).map(row => row.season_year), [2026, 2027]);
});

test('unknown booking properties are included conservatively and invalidate inventory quality', () => {
  const booking = propertyId => ({
    property_id: propertyId,
    platform: 'booking',
    start_date: '2026-06-01',
    end_date: '2026-06-05',
    booking_type: 'reservation',
    guest_name: 'Guest'
  });
  const snapshot = computeBookingStatsSnapshot({
    bookings: [booking('orange'), booking('unknown-unit')],
    properties: [{ id: 'orange' }],
    seasonYear: 2026
  });

  assert.equal(snapshot.booking_count, 2);
  assert.equal(snapshot.payload.property_count, 2);
  assert.equal(snapshot.payload.data_quality.valid, false);
  assert.deepEqual(snapshot.payload.data_quality.unknown_property_ids, ['unknown-unit']);
  assert.ok(snapshot.payload.data_quality.warnings.includes('unknown_booking_properties'));
});
