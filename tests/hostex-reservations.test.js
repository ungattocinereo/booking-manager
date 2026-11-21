const test = require('node:test');
const assert = require('node:assert/strict');
const { reservationRow, guestChanges, PROPERTY_MAP } = require('../lib/hostex-reservations');
const reservation = { property_id: 12843803, status: 'accepted', channel_type: 'airbnb', guest_name: 'Updated Guest', number_of_guests: 3, check_in_date: '2026-12-20', check_out_date: '2026-12-24' };
test('San Sebastiano maps to Awesome, without adding a second apartment', () => {
  assert.equal(reservationRow(reservation).property_id, 'awesome');
  assert.equal(new Set(PROPERTY_MAP.values()).size, 6);
  assert.equal(reservationRow({ ...reservation, property_id: 123 }), null);
});
test('Hostex corrections replace old names/counts but never erase known details with empty fields', () => {
  assert.deepEqual(guestChanges({ guest_name: 'Old Guest', guest_count: 2, active: false }, reservationRow(reservation)), { needsName: true, needsCount: true, needsActive: true });
  assert.deepEqual(guestChanges({ guest_name: 'Known Guest', guest_count: 2, active: true }, reservationRow({ ...reservation, guest_name: null, number_of_guests: null })), { needsName: false, needsCount: false, needsActive: false });
});
test('pending or invalid Hostex reservations cannot become confirmed arrivals', () => {
  for (const status of ['wait_accept', 'wait_pay', 'unknown']) assert.equal(reservationRow({ ...reservation, status }), null);
  assert.equal(reservationRow({ ...reservation, check_out_date: '2026-12-19' }), null);
  assert.equal(reservationRow({ ...reservation, status: 'cancelled' }).cancelled, true);
});
