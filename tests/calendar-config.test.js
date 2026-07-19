const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ICAL_URLS = '[]';
const { validateCalendarConfig } = require('../backend/src/sync-calendars');
const inventory = require('../backend/config/calendar-inventory.json');

function completeConfig() {
  return {
    properties: inventory.properties.map(property => ({
      id: property.id,
      name: property.name,
      calendars: property.platforms.map(platform => ({
        platform,
        url: `https://calendar.example/${property.id}/${platform}.ics`
      }))
    }))
  };
}

test('accepts a calendar configuration covering the full property inventory', () => {
  const config = completeConfig();
  assert.equal(validateCalendarConfig(config), config);
});

test('rejects a configuration that silently omits Central Room', () => {
  const config = completeConfig();
  config.properties = config.properties.filter(property => property.id !== 'central');

  assert.throws(
    () => validateCalendarConfig(config),
    /missing property central/
  );
});

test('rejects a property missing a required platform feed', () => {
  const config = completeConfig();
  config.properties.find(property => property.id === 'central').calendars = [];

  assert.throws(
    () => validateCalendarConfig(config),
    /missing central\/booking feed/
  );
});
