const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('cleaner assignment replacement rolls back when one property is invalid', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-cleaners-'));
  process.env.SQLITE_DB_PATH = path.join(tempDir, 'bookings.db');
  const db = require('../backend/src/database');

  try {
    await db.init();
    await db.createProperty('orange', 'Orange');
    await db.createProperty('solo', 'Solo');
    await db.createCleaner('anna', 'Anna');
    await db.replaceCleanerProperties('anna', ['orange', 'solo']);

    await assert.rejects(() => db.replaceCleanerProperties('anna', ['missing-property']));
    const assignments = await db.getCleanerProperties('anna');
    assert.deepEqual(assignments.map(row => row.id).sort(), ['orange', 'solo']);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  }
});

test('deleting a cleaner nulls tasks and removes assignments atomically', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-cleaner-delete-'));
  process.env.SQLITE_DB_PATH = path.join(tempDir, 'bookings.db');
  delete require.cache[require.resolve('../backend/src/database')];
  const db = require('../backend/src/database');

  try {
    await db.init();
    await db.createProperty('orange', 'Orange');
    await db.createCleaner('anna', 'Anna');
    await db.replaceCleanerProperties('anna', ['orange']);
    await db.run(
      `INSERT INTO cleaning_tasks (property_id, cleaner_id, scheduled_date, task_type)
       VALUES (?, ?, ?, ?)`,
      ['orange', 'anna', '2026-07-12', 'checkout_cleaning']
    );

    await db.deleteCleanerWithRelations('anna');
    assert.equal(await db.get('SELECT id FROM cleaners WHERE id = ?', ['anna']), undefined);
    assert.deepEqual(await db.getCleanerProperties('anna'), []);
    const task = await db.get('SELECT cleaner_id FROM cleaning_tasks WHERE property_id = ?', ['orange']);
    assert.equal(task.cleaner_id, null);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  }
});
