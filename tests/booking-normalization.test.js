const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dateOnly,
  isRealGuestBooking,
  normalizeBookingsForDisplay
} = require('../lib/booking-normalization');
const { buildTodayWidgetPayload } = require('../lib/widget-today');

function row(overrides = {}) {
  return {
    id: 1,
    active: true,
    property_id: 'solo',
    platform: 'booking',
    start_date: '2026-07-12',
    end_date: '2026-07-14',
    booking_type: 'blocked',
    raw_summary: 'CLOSED - Not available',
    guest_name: null,
    guest_count: 0,
    ...overrides
  };
}

test('normalizes database, ISO timestamp and Italian reporting dates to one day key', () => {
  assert.equal(dateOnly(new Date(2026, 6, 25)), '2026-07-25');
  assert.equal(dateOnly('2026-07-25T00:00:00.000Z'), '2026-07-25');
  assert.equal(dateOnly('25/07/2026'), '2026-07-25');
  assert.equal(dateOnly('25072026'), '2026-07-25');
});

test('keeps only unmatched short Booking markers as operational fallbacks', () => {
  const fallback = row();
  const coveredMarker = row({ id: 2, property_id: 'orange' });
  const realBooking = row({
    id: 3,
    property_id: 'orange',
    booking_type: 'reservation',
    raw_summary: 'Known Guest',
    guest_name: 'Known Guest',
    guest_count: 1
  });
  const longClosure = row({ id: 4, property_id: 'central', end_date: '2027-07-14' });

  const visible = normalizeBookingsForDisplay([fallback, coveredMarker, realBooking, longClosure]);

  assert.deepEqual(visible.map(item => item.id).sort(), [1, 3]);
  const normalizedFallback = visible.find(item => item.id === 1);
  assert.equal(normalizedFallback.operational_fallback, true);
  assert.equal(isRealGuestBooking(normalizedFallback, visible), false);
});

test('today widget includes an unmatched Booking fallback in occupied rooms', async () => {
  const db = {
    async getBookings() {
      return [row({ start_date: '2026-07-12', end_date: '2026-07-15' })];
    }
  };

  const payload = await buildTodayWidgetPayload(db, '2026-07-13');

  assert.equal(payload.occupied.length, 1);
  assert.equal(payload.occupied[0].property_id, 'solo');
  assert.equal(payload.occupied[0].operational_fallback, true);
});

test('uses a unique shifted Booking calendar marker as the operational dates', async () => {
  const staleExport = row({
    id: 10,
    property_id: 'susy',
    start_date: '2026-08-12',
    end_date: '2026-08-16',
    booking_type: 'reservation',
    raw_summary: 'Flavia Placidi',
    guest_name: 'Flavia Placidi',
    guest_country: 'IT',
    guest_count: 3,
    created_at: '2026-08-01T12:00:00.000Z'
  });
  const liveMarker = row({
    id: 11,
    property_id: 'susy',
    start_date: '2026-08-13',
    end_date: '2026-08-17',
    created_at: '2026-08-13T06:00:00.000Z'
  });
  const nextGuest = row({
    id: 12,
    property_id: 'susy',
    start_date: '2026-08-17',
    end_date: '2026-08-22',
    booking_type: 'reservation',
    raw_summary: 'Kelemen Krisztin',
    guest_name: 'Kelemen Krisztin',
    guest_count: 4
  });
  const rows = [staleExport, liveMarker, nextGuest];

  const visible = normalizeBookingsForDisplay(rows);
  const currentGuest = visible.find(item => item.guest_name === 'Flavia Placidi');
  assert.equal(visible.length, 2);
  assert.equal(currentGuest.id, 11);
  assert.equal(currentGuest.start_date, '2026-08-13');
  assert.equal(currentGuest.end_date, '2026-08-17');
  assert.equal(currentGuest.created_at, '2026-08-01T12:00:00.000Z');
  assert.equal(currentGuest.calendar_authoritative, true);

  const db = { async getBookings() { return rows; } };
  const today = await buildTodayWidgetPayload(db, '2026-08-16');
  const tomorrow = await buildTodayWidgetPayload(db, '2026-08-17');
  assert.equal(today.check_outs.some(item => item.property_id === 'susy'), false);
  assert.equal(today.occupied.some(item => item.property_id === 'susy'), true);
  assert.equal(tomorrow.check_outs.some(item => item.guest === 'Flavia Placidi'), true);
  assert.equal(tomorrow.check_ins.some(item => item.guest === 'Kelemen Krisztin'), true);
});

test('does not turn a daily-trimmed Booking marker into a new check-in', async () => {
  const reservation = row({
    id: 13,
    property_id: 'central',
    start_date: '2026-08-17',
    end_date: '2026-08-19',
    booking_type: 'reservation',
    raw_summary: 'Central Guest',
    guest_name: 'Central Guest',
    guest_count: 2,
    created_at: '2026-08-14T08:00:00.000Z'
  });
  const trimmedMarker = row({
    id: 14,
    property_id: 'central',
    start_date: '2026-08-18',
    end_date: '2026-08-19',
    created_at: '2026-08-17T20:00:00.000Z'
  });
  const rows = [reservation, trimmedMarker];

  const visible = normalizeBookingsForDisplay(rows);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 13);
  assert.equal(visible[0].start_date, '2026-08-17');
  assert.equal(visible[0].end_date, '2026-08-19');
  assert.equal(visible[0].created_at, '2026-08-14T08:00:00.000Z');

  const db = { async getBookings() { return rows; } };
  const today = await buildTodayWidgetPayload(db, '2026-08-18');
  assert.equal(today.check_ins.some(item => item.property_id === 'central'), false);
  assert.equal(today.occupied.some(item => item.property_id === 'central'), true);
});

test('keeps the confirmed check-in when a Booking marker starts earlier but has the same checkout', async () => {
  const reservation = row({
    id: 15,
    property_id: 'central',
    start_date: '2026-09-29',
    end_date: '2026-10-02',
    booking_type: 'reservation',
    raw_summary: 'Nino Kadic',
    guest_name: 'Nino Kadic',
    guest_count: 1
  });
  const earlierMarker = row({
    id: 16,
    property_id: 'central',
    start_date: '2026-09-27',
    end_date: '2026-10-02'
  });
  const db = { async getBookings() { return [reservation, earlierMarker]; } };

  const payload = await buildTodayWidgetPayload(db, '2026-09-29');

  assert.equal(payload.check_ins.length, 1);
  assert.equal(payload.check_ins[0].guest, 'Nino Kadic');
  assert.equal(payload.check_ins[0].start, '2026-09-29');
});

test('does not apply a combined Booking marker to multiple guest reservations', () => {
  const combinedMarker = row({ id: 20, start_date: '2026-08-03', end_date: '2026-08-19' });
  const firstGuest = row({
    id: 21,
    start_date: '2026-08-03',
    end_date: '2026-08-08',
    booking_type: 'reservation',
    raw_summary: 'First Guest',
    guest_name: 'First Guest'
  });
  const secondGuest = row({
    id: 22,
    start_date: '2026-08-10',
    end_date: '2026-08-19',
    booking_type: 'reservation',
    raw_summary: 'Second Guest',
    guest_name: 'Second Guest'
  });

  const visible = normalizeBookingsForDisplay([combinedMarker, firstGuest, secondGuest]);
  assert.deepEqual(visible.map(item => item.id).sort(), [21, 22]);
});

function combinedArrivalRows() {
  return [
    row({ id: 30, property_id: 'vingtage', start_date: '2026-09-27', end_date: '2026-10-06' }),
    ...[
      [31, '2026-09-25', '2026-09-27'],
      [32, '2026-09-29', '2026-10-02'],
      [33, '2026-10-02', '2026-10-04'],
      [34, '2026-10-04', '2026-10-06']
    ].map(([id, start_date, end_date]) => row({
      id, property_id: 'vingtage', start_date, end_date,
      booking_type: 'reservation', raw_summary: 'Known guest', guest_name: 'Known guest'
    }))
  ];
}

test('keeps a new arrival before the known guests in a combined Booking closure', async () => {
  const rows = combinedArrivalRows();
  const original = structuredClone(rows);
  const visible = normalizeBookingsForDisplay(rows);
  const arrival = visible.find(item => item.id === 30);
  assert.ok(arrival, 'the uncovered leading stay must remain visible');
  assert.equal(arrival.start_date, '2026-09-27');
  assert.equal(arrival.end_date, '2026-09-29');
  assert.equal(arrival.operational_fallback, true);
  assert.equal(arrival.guest_name, null);
  assert.equal(isRealGuestBooking(arrival, visible), false);
  assert.deepEqual(visible.filter(item => item.id !== 30), rows.slice(1));
  assert.deepEqual(rows, original, 'normalization must not modify stored calendar dates');
  assert.deepEqual(normalizeBookingsForDisplay(visible), visible);

  const db = { async getBookings() { return rows; } };
  const today = await buildTodayWidgetPayload(db, '2026-09-27');
  assert.equal(today.check_ins.length, 1);
  assert.equal(today.check_ins[0].nights, 2);
  assert.equal(today.check_outs.length, 1);
  const tomorrow = await buildTodayWidgetPayload(db, '2026-09-28');
  assert.equal(tomorrow.check_ins.length, 0);
  assert.equal(tomorrow.occupied.length, 1);
  const checkout = await buildTodayWidgetPayload(db, '2026-09-29');
  assert.equal(checkout.check_outs[0].start, '2026-09-27');
  assert.equal(checkout.check_ins[0].start, '2026-09-29');
});

test('does not infer a leading arrival for covered, inactive, long or cross-platform closures', () => {
  for (const changes of [
    { start_date: '2026-09-29' },
    { active: false },
    { start_date: '2026-08-01' },
    { platform: 'airbnb' }
  ]) {
    const rows = combinedArrivalRows();
    Object.assign(rows[0], changes);
    assert.equal(normalizeBookingsForDisplay(rows).some(item => item.id === 30), false);
  }
  const rows = combinedArrivalRows();
  rows.push(row({ id: 35, property_id: 'vingtage', platform: 'airbnb',
    start_date: '2026-09-27', end_date: '2026-09-29',
    booking_type: 'reservation', raw_summary: 'Reserved', guest_name: 'Airbnb guest' }));
  assert.equal(normalizeBookingsForDisplay(rows).some(item => item.id === 30), false);
});
