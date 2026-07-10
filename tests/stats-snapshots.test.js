const test = require('node:test');
const assert = require('node:assert/strict');
const { computeBookingStatsSnapshot } = require('../backend/src/stats-snapshots');

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
  assert.ok(snapshot.occupancy_percent <= 100);
});
