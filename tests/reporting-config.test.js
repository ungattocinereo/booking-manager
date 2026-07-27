const test = require('node:test');
const assert = require('node:assert/strict');

const { loadReportingUnits } = require('../backend/src/reporting/config');
const { HARMONY_BASELINE_STAYS } = require('../scripts/seed-harmony-istat-history');

test('maps Awesome Apartments exclusively to San Sebastiano reporting', () => {
  const units = loadReportingUnits();
  const sanSebastiano = units.find(unit => unit.id === 'sansebastiano');
  const dragone = units.find(unit => unit.id === 'dragone');

  assert.equal(sanSebastiano.name, 'San Sebastiano');
  assert.deepEqual(sanSebastiano.propertyIds, ['awesome']);
  assert.equal(sanSebastiano.configured.mapping, true);
  assert.equal(dragone.propertyIds.includes('awesome'), false);
  assert.equal(
    units.filter(unit => unit.propertyIds.includes('awesome')).length,
    1,
    'a calendar property must not belong to two reporting destinations'
  );
});

test('trims reporting credentials copied through environment variables', () => {
  const previousCusr = process.env.ISTAT_HARMONY_CUSR;
  const previousKey = process.env.ISTAT_HARMONY_API_KEY;
  process.env.ISTAT_HARMONY_CUSR = '  SAFE_CUSR\n';
  process.env.ISTAT_HARMONY_API_KEY = ' SAFE_API_KEY ';
  try {
    const harmony = loadReportingUnits().find(unit => unit.id === 'harmony');
    assert.equal(harmony.istat.cusr, 'SAFE_CUSR');
    assert.equal(harmony.istat.apiKey, 'SAFE_API_KEY');
  } finally {
    if (previousCusr === undefined) delete process.env.ISTAT_HARMONY_CUSR;
    else process.env.ISTAT_HARMONY_CUSR = previousCusr;
    if (previousKey === undefined) delete process.env.ISTAT_HARMONY_API_KEY;
    else process.env.ISTAT_HARMONY_API_KEY = previousKey;
  }
});

test('Harmony ISTAT baseline contains only anonymous stays missing from daily TXT imports', () => {
  assert.equal(HARMONY_BASELINE_STAYS.length, 7);
  assert.equal(HARMONY_BASELINE_STAYS.some(stay => Object.hasOwn(stay, 'guestName')), false);
  assert.equal(HARMONY_BASELINE_STAYS.some(stay => stay.arrivalDate === '2026-07-27'), false);
  assert.equal(HARMONY_BASELINE_STAYS.every(stay => ['harmony', 'royal'].includes(stay.propertyId)), true);
});
