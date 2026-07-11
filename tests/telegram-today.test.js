const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TODAY_COMMAND_RE,
  TODAY_DETAILS_COMMAND_RE,
  classifyTodayBookings,
  filterRealBookings,
  formatTodayArrivals,
  formatTodayDetails,
  getRomeDate,
  parseCommand
} = require('../telegram-bot/today');

const TODAY = '2026-07-11';

function booking(overrides = {}) {
  return {
    active: true,
    property_id: 'orange',
    platform: 'booking',
    start_date: TODAY,
    end_date: '2026-07-12',
    booking_type: 'reservation',
    guest_name: 'Guest',
    guest_count: 2,
    ...overrides
  };
}

function currentProductionShape() {
  return [
    booking({
      property_id: 'orange',
      start_date: TODAY,
      end_date: '2026-07-17',
      booking_type: 'blocked',
      raw_summary: 'CLOSED - Not available',
      guest_name: null,
      guest_count: 0
    }),
    booking({
      property_id: 'orange',
      start_date: '2026-07-10',
      end_date: '2026-07-17',
      booking_type: 'blocked',
      raw_summary: 'CLOSED - Not available',
      guest_name: null,
      guest_count: 0
    }),
    booking({ property_id: 'vingtage', end_date: '2026-07-13' }),
    booking({ property_id: 'youth', end_date: '2026-07-12' }),
    booking({ property_id: 'royal', end_date: '2026-07-14' }),
    booking({ property_id: 'susy', end_date: '2026-07-16' }),
    booking({ property_id: 'central', start_date: '2026-07-09', end_date: TODAY }),
    booking({ property_id: 'youth', start_date: '2026-07-08', end_date: TODAY }),
    booking({ property_id: 'solo', start_date: '2026-07-10', end_date: TODAY }),
    booking({ property_id: 'awesome', start_date: '2026-07-10', end_date: '2026-07-13' }),
    booking({ property_id: 'orange', start_date: '2026-07-07', end_date: '2026-07-12' }),
    booking({ property_id: 'carina', start_date: '2026-07-09', end_date: '2026-07-12' }),
    booking({ property_id: 'harmony', start_date: '2026-07-08', end_date: '2026-07-15' })
  ];
}

test('Rome date rolls over correctly in summer and winter', () => {
  assert.equal(getRomeDate(0, new Date('2026-07-10T22:30:00.000Z')), '2026-07-11');
  assert.equal(getRomeDate(0, new Date('2026-01-10T23:30:00.000Z')), '2026-01-11');
  assert.equal(getRomeDate(1, new Date('2026-07-10T22:30:00.000Z')), '2026-07-12');
});

test('real-booking filter removes technical markers from every platform', () => {
  const realOverlapA = booking({ property_id: 'royal', start_date: '2026-07-12', end_date: '2026-07-14' });
  const realOverlapB = booking({ property_id: 'royal', platform: 'airbnb', start_date: '2026-07-13', end_date: '2026-07-15' });
  const legacyActiveNull = booking({ active: null, property_id: 'central' });
  const rows = [
    booking({ booking_type: 'blocked', raw_summary: 'CLOSED - Not available', guest_name: null, guest_count: 0 }),
    booking({ platform: 'airbnb', booking_type: 'blocked', raw_summary: 'Airbnb (Not available)', guest_name: null, guest_count: 0 }),
    booking({ booking_type: 'blocked', raw_summary: 'CLOSED - Not available', guest_name: 'Known guest' }),
    booking({ platform: 'airbnb', raw_summary: 'Reserved' }),
    booking({ active: false }),
    booking({ start_date: TODAY, end_date: TODAY }),
    realOverlapA,
    realOverlapB,
    legacyActiveNull
  ];

  const result = filterRealBookings(rows);

  assert.equal(result.length, 5);
  assert.ok(result.includes(realOverlapA));
  assert.ok(result.includes(realOverlapB));
  assert.ok(result.includes(legacyActiveNull));
  assert.ok(result.some(row => row.guest_name === 'Known guest'));
  assert.ok(result.some(row => row.platform === 'airbnb' && row.raw_summary === 'Reserved'));
});

test('today classification excludes false Orange markers and keeps real stays', () => {
  const classified = classifyTodayBookings(currentProductionShape(), TODAY);

  assert.deepEqual(classified.arrivals.map(row => row.property_id).sort(), ['royal', 'susy', 'vingtage', 'youth']);
  assert.deepEqual(classified.checkouts.map(row => row.property_id).sort(), ['central', 'solo', 'youth']);
  assert.deepEqual(classified.staying.map(row => row.property_id).sort(), ['awesome', 'carina', 'harmony', 'orange']);
});

test('/today output contains arrivals only', () => {
  const output = formatTodayArrivals(currentProductionShape(), TODAY);

  assert.match(output, /Заезды сегодня/);
  assert.match(output, /Vingtage Room/);
  assert.match(output, /Youth Room/);
  assert.match(output, /Royal/);
  assert.match(output, /Villa Susy/);
  assert.doesNotMatch(output, /Orange Room/);
  assert.doesNotMatch(output, /Выезды/);
  assert.doesNotMatch(output, /Остаются/);
});

test('/today-details output contains arrivals, checkouts and real ongoing stays', () => {
  const output = formatTodayDetails(currentProductionShape(), TODAY);

  assert.match(output, /<b>Заезды<\/b>/);
  assert.match(output, /<b>Выезды<\/b>/);
  assert.match(output, /<b>Остаются<\/b>/);
  assert.match(output, /Central Room/);
  assert.match(output, /Orange Room \(до 12 июл/);
  assert.equal((output.match(/Orange Room/g) || []).length, 1);
});

test('back-to-back bookings are one checkout and one arrival, not an ongoing stay', () => {
  const oldBooking = booking({ property_id: 'solo', start_date: '2026-07-08', end_date: TODAY });
  const newBooking = booking({ property_id: 'solo', start_date: TODAY, end_date: '2026-07-15' });
  const classified = classifyTodayBookings([oldBooking, newBooking], TODAY);

  assert.deepEqual(classified.arrivals, [newBooking]);
  assert.deepEqual(classified.checkouts, [oldBooking]);
  assert.deepEqual(classified.staying, []);
});

test('Telegram HTML is escaped in guest names', () => {
  const output = formatTodayArrivals([
    booking({ property_id: 'solo', guest_name: '<b>A & B</b>' })
  ], TODAY);

  assert.match(output, /&lt;b&gt;A &amp; B&lt;\/b&gt;/);
  assert.doesNotMatch(output, /— <b>A/);
});

test('today command patterns and webhook parser support detail aliases', () => {
  assert.match('/today', TODAY_COMMAND_RE);
  assert.match('/today@AtraniBot', TODAY_COMMAND_RE);
  assert.doesNotMatch('/today-details', TODAY_COMMAND_RE);
  assert.match('/today-details', TODAY_DETAILS_COMMAND_RE);
  assert.match('/today_details@AtraniBot', TODAY_DETAILS_COMMAND_RE);
  assert.deepEqual(parseCommand('/today-details@AtraniBot'), { command: 'today-details', arg: '' });
  assert.deepEqual(parseCommand('/today_details'), { command: 'today_details', arg: '' });
  assert.deepEqual(parseCommand('/bookings Orange'), { command: 'bookings', arg: 'orange' });
});
