const test = require('node:test');
const assert = require('node:assert/strict');

const { loadReportingUnits } = require('../backend/src/reporting/config');

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
