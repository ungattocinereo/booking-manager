const test = require('node:test');
const assert = require('node:assert/strict');

const { aggregateIstatMonth } = require('../backend/src/reporting/istat-movements');
const { chooseBookingSuggestion } = require('../backend/src/reporting/matcher');
const { canonicalIstatDays, italianDateToIso } = require('../backend/src/reporting/service');

test('builds daily ISTAT movements for a one-night stay', () => {
  const result = aggregateIstatMonth({
    month: '2026-07',
    stays: [{
      id: 1,
      arrival_date: '2026-07-25',
      departure_date: '2026-07-26',
      booking_id: 12,
      property_id: 'carina',
      rooms_occupied: 1,
      origin_confirmed: true,
      records: [{ origin_kind: 'country', origin_code: '536', arrival_date: '2026-07-25', departure_date: '2026-07-26' }]
    }]
  });
  assert.equal(result.ready, true);
  assert.equal(result.giornate.length, 31);
  const arrival = result.giornate.find(day => day.dataRilevazione === '25072026');
  const departure = result.giornate.find(day => day.dataRilevazione === '26072026');
  assert.equal(arrival.camereOccupate, 1);
  assert.deepEqual(arrival.movimentazioni[0], { codiceNazione: '536', arrivi: 1, presentiNottePrecedente: 0, partenze: 0 });
  assert.equal(departure.camereOccupate, 0);
  assert.deepEqual(departure.movimentazioni[0], { codiceNazione: '536', arrivi: 0, presentiNottePrecedente: 1, partenze: 1 });
});

test('blocks ISTAT preview when origin or accommodation is missing', () => {
  const result = aggregateIstatMonth({
    month: '2026-07',
    stays: [{ id: 7, arrival_date: '2026-07-01', departure_date: '2026-07-02', rooms_occupied: 1, records: [] }]
  });
  assert.equal(result.ready, false);
  assert.match(result.errors.join(' '), /provenienza/);
  assert.match(result.errors.join(' '), /alloggio/);
});

test('auto-selects a unique booking by dates and leader surname', () => {
  const group = { head: { arrivalDate: '2026-07-25', departureDate: '2026-07-28', surname: 'Allan' } };
  const bookings = [
    { id: 1, property_id: 'carina', start_date: '2026-07-25', end_date: '2026-07-28', guest_name: 'Timothy Allan' },
    { id: 2, property_id: 'royal', start_date: '2026-07-25', end_date: '2026-07-28', guest_name: 'Someone Else' }
  ];
  const result = chooseBookingSuggestion(group, bookings, ['carina', 'royal']);
  assert.equal(result.selected.id, 1);
  assert.equal(result.suggestions[0].score, 100);
});

test('auto-selects a booking when PostgreSQL returns DATE values as Date objects', () => {
  const group = { head: { arrivalDate: '2026-07-25', departureDate: '2026-07-28', surname: 'Clemente' } };
  const result = chooseBookingSuggestion(group, [{
    id: 7,
    property_id: 'carina',
    start_date: new Date(2026, 6, 25),
    end_date: new Date(2026, 6, 28),
    guest_name: 'Clemente Jeremy Christian'
  }], ['carina']);
  assert.equal(result.selected.id, 7);
  assert.equal(result.suggestions[0].score, 100);
});

test('normalizes Sinfonia dates and movement ordering for read-back verification', () => {
  assert.equal(italianDateToIso('31072026'), '2026-07-31');
  assert.equal(italianDateToIso('31/07/2026'), '2026-07-31');
  assert.equal(italianDateToIso('2026-07-31'), null);
  const canonical = canonicalIstatDays([{ dataRilevazione: '01072026', camereOccupate: '1', movimentazioni: [
    { codiceNazione: '701', arrivi: 0, presentiNottePrecedente: 1, partenze: 1 },
    { codiceProvincia: 63, arrivi: 1, presentiNottePrecedente: 0, partenze: 0 }
  ] }]);
  assert.equal(canonical[0].camereOccupate, 1);
  assert.deepEqual(canonical[0].movimentazioni.map(item => item.codiceProvincia || item.codiceNazione), ['63', '701']);
});
