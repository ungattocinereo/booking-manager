const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CleanerServiceError,
  cleanerServiceStatus,
  listCleaners,
  createCleaner,
  updateCleaner,
  getMaidCalendar
} = require('../lib/cleaners-service');

test('cleaner service returns assignments without mutating database rows', async () => {
  const rows = [{ id: 'anna', name: 'Anna', slug: 'anna' }];
  const db = {
    getCleaners: async () => rows,
    getCleanerProperties: async () => [{ id: 'orange', name: 'Orange' }]
  };

  const result = await listCleaners(db);
  assert.deepEqual(result[0].properties, [{ id: 'orange', name: 'Orange' }]);
  assert.equal(rows[0].properties, undefined);
});

test('cleaner service normalizes creation and reports duplicate conflicts', async () => {
  const db = { createCleaner: async () => ({ changes: 1 }) };
  assert.deepEqual(await createCleaner(db, { name: '  Anna Maria  ' }), {
    success: true,
    id: 'anna_maria',
    name: 'Anna Maria'
  });

  const duplicateDb = { createCleaner: async () => ({ rowCount: 0 }) };
  await assert.rejects(
    () => createCleaner(duplicateDb, { name: 'Anna' }),
    error => error instanceof CleanerServiceError && cleanerServiceStatus(error) === 409
  );
});

test('cleaner service validates and atomically replaces assignments', async () => {
  let received = null;
  const db = {
    replaceCleanerProperties: async (cleanerId, propertyIds) => {
      received = { cleanerId, propertyIds };
    }
  };

  await updateCleaner(db, 'anna', { property_ids: [' orange ', 'solo', 'orange'] });
  assert.deepEqual(received, { cleanerId: 'anna', propertyIds: ['orange', 'solo'] });

  await assert.rejects(
    () => updateCleaner(db, 'anna', { property_ids: 'orange' }),
    error => error instanceof CleanerServiceError && cleanerServiceStatus(error) === 400
  );
});

test('maid calendar keeps the public response contract and assigned-property scope', async () => {
  const db = {
    getCleanerBySlug: async slug => slug === 'anna' ? { id: 'anna', name: 'Anna', slug } : null,
    getCleanerProperties: async () => [{ id: 'orange', name: 'Orange' }],
    getBookings: async () => [
      { id: 1, property_id: 'orange', platform: 'airbnb', start_date: '2026-08-01', end_date: '2026-08-03' },
      { id: 2, property_id: 'solo', platform: 'booking', start_date: '2026-08-01', end_date: '2026-08-04' }
    ],
    getCleaningTasks: async () => [
      { id: 3, property_id: 'orange', scheduled_date: '2026-08-02', task_type: 'manual', status: 'pending', notes: 'Change linen', active: true },
      { id: 4, property_id: 'orange', scheduled_date: '2026-08-03', task_type: 'checkout_cleaning', status: 'pending', active: true },
      { id: 5, property_id: 'orange', scheduled_date: '2026-08-04', task_type: 'manual', status: 'completed', active: true },
      { id: 6, property_id: 'solo', scheduled_date: '2026-08-05', task_type: 'manual', status: 'pending', active: true }
    ]
  };

  const result = await getMaidCalendar(db, 'ANNA');
  assert.deepEqual(result.cleaner, { id: 'anna', name: 'Anna', slug: 'anna' });
  assert.deepEqual(result.properties, [{ id: 'orange', name: 'Orange' }]);
  assert.deepEqual(result.bookings.map(booking => booking.id), [1]);
  assert.equal(result.bookings[0].start_date, '2026-08-01');
  assert.deepEqual(result.tasks, [{
    id: 3,
    property_id: 'orange',
    scheduled_date: '2026-08-02',
    task_type: 'manual',
    status: 'pending',
    notes: 'Change linen'
  }]);
});
