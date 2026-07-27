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
