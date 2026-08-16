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
    guest_count: 3
  });
  const liveMarker = row({
    id: 11,
    property_id: 'susy',
    start_date: '2026-08-13',
    end_date: '2026-08-17'
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
  assert.equal(currentGuest.calendar_authoritative, true);

  const db = { async getBookings() { return rows; } };
  const today = await buildTodayWidgetPayload(db, '2026-08-16');
  const tomorrow = await buildTodayWidgetPayload(db, '2026-08-17');
  assert.equal(today.check_outs.some(item => item.property_id === 'susy'), false);
  assert.equal(today.occupied.some(item => item.property_id === 'susy'), true);
  assert.equal(tomorrow.check_outs.some(item => item.guest === 'Flavia Placidi'), true);
  assert.equal(tomorrow.check_ins.some(item => item.guest === 'Kelemen Krisztin'), true);
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
