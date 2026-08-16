const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCleaningTasks } = require('../backend/src/sync-calendars');

test('generates and reconciles cleaning tasks from calendar-authoritative dates', async () => {
  const rows = [
    {
      id: 1,
      active: true,
      property_id: 'susy',
      platform: 'booking',
      start_date: '2026-08-12',
      end_date: '2026-08-16',
      booking_type: 'reservation',
      raw_summary: 'Flavia Placidi',
      guest_name: 'Flavia Placidi',
      guest_count: 3
    },
    {
      id: 2,
      active: true,
      property_id: 'susy',
      platform: 'booking',
      start_date: '2026-08-13',
      end_date: '2026-08-17',
      booking_type: 'blocked',
      raw_summary: 'CLOSED - Not available',
      guest_name: null,
      guest_count: 0
    },
    {
      id: 3,
      active: true,
      property_id: 'susy',
      platform: 'booking',
      start_date: '2026-08-17',
      end_date: '2026-08-22',
      booking_type: 'reservation',
      raw_summary: 'Kelemen Krisztin',
      guest_name: 'Kelemen Krisztin',
      guest_count: 4
    }
  ];
  const created = [];
  let archived = null;
  const database = {
    pool: {},
    async getBookings() { return rows; },
    async createCleaningTask(propertyId, date, taskType) {
      created.push(`${propertyId}|${date}|${taskType}`);
      return { rowCount: 1 };
    },
    async archiveStaleCleaningTasks(today, expectedKeys) {
      archived = { today, expectedKeys };
      return { rowCount: 1 };
    }
  };

  const count = await generateCleaningTasks({ database, today: '2026-08-16' });

  assert.equal(count, 2);
  assert.deepEqual(created, [
    'susy|2026-08-17|checkout_cleaning',
    'susy|2026-08-22|checkout_cleaning'
  ]);
  assert.deepEqual(archived, {
    today: '2026-08-16',
    expectedKeys: ['susy|2026-08-17', 'susy|2026-08-22']
  });
});
