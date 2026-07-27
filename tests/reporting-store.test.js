const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const SAMPLE = '1625/07/20263 ALLAN                                             TIMOTHY FRASER                222/10/1997           100000701100000701PASORRB1474082           100000701';

test('stores imported guest PII encrypted and marks a reviewed stay ready', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-reporting-'));
  process.env.SQLITE_DB_PATH = path.join(tempDir, 'bookings.db');
  delete require.cache[require.resolve('../backend/src/database')];
  const db = require('../backend/src/database');
  const { ReportingStore } = require('../backend/src/reporting/store');
  const { ReportingService } = require('../backend/src/reporting/service');
  const { parseAlloggiatiTxt } = require('../backend/src/reporting/parser');
  const unit = { id: 'carina', name: 'Carina', propertyIds: ['carina'] };

  try {
    await db.init();
    await db.createProperty('carina', 'Carina');
    const store = new ReportingStore(db);
    await store.syncUnits([unit]);
    const batch = await store.createBatch({
      unit,
      filename: 'guest.txt',
      parsed: parseAlloggiatiTxt(Buffer.from(SAMPLE, 'latin1')),
      operatorEmail: 'test@example.com'
    });
    assert.equal(batch.stays.length, 1);
    assert.equal(batch.stays[0].records[0].pii.surname, 'ALLAN');

    const raw = await db.get('SELECT encrypted_record FROM guest_records WHERE batch_id=?', [batch.id]);
    assert.ok(!raw.encrypted_record.includes('ALLAN'));
    assert.equal(batch.stays[0].records[0].origin_kind, 'country');
    assert.equal(batch.stays[0].records[0].origin_code, '701');
    assert.equal(batch.stays[0].records[0].origin_label, 'citizenship');
    assert.equal((await store.duplicateRecordFingerprints('carina', [batch.stays[0].records[0].record_fingerprint])).length, 1);

    const service = new ReportingService(db);
    await assert.rejects(
      service.updateStay(batch.stays[0].id, {
        batch_id: batch.id,
        property_id: 'royal',
        booking_id: null,
        rooms_occupied: 1,
        records: []
      }),
      /не относится/
    );
    await service.updateStay(batch.stays[0].id, {
      batch_id: batch.id,
      property_id: 'carina',
      booking_id: null,
      rooms_occupied: 1,
      records: [{ id: batch.stays[0].records[0].id, origin_kind: 'country', origin_code: '701', origin_label: 'Australia' }]
    });
    const reviewed = await store.getBatch(batch.id);
    assert.equal(reviewed.status, 'ready');
    assert.equal(reviewed.stays[0].origin_confirmed, true);

    await db.run(
      `UPDATE guest_import_batches
       SET alloggiati_sent_at=datetime('now', '-31 days'), receipt_received_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [batch.id]
    );
    assert.equal(await store.purgeExpiredPii(30), 1);
    const purged = await db.get(
      `SELECT gib.status, gib.pii_purged_at, gr.encrypted_record
       FROM guest_import_batches gib JOIN guest_records gr ON gr.batch_id=gib.id
       WHERE gib.id=?`,
      [batch.id]
    );
    assert.equal(purged.status, 'pii_purged');
    assert.ok(purged.pii_purged_at);
    assert.equal(purged.encrypted_record, null);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  }
});

test('syncUnits merges Royal into Harmony and archives the removed reporting unit', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-reporting-units-'));
  process.env.SQLITE_DB_PATH = path.join(tempDir, 'bookings.db');
  delete require.cache[require.resolve('../backend/src/database')];
  const db = require('../backend/src/database');
  const { ReportingStore } = require('../backend/src/reporting/store');

  try {
    await db.init();
    const store = new ReportingStore(db);
    await store.syncUnits([
      { id: 'harmony', name: 'Harmony', propertyIds: ['harmony'] },
      { id: 'royal', name: 'Royal', propertyIds: ['royal'] }
    ]);
    await store.syncUnits([
      { id: 'harmony', name: 'Harmony', propertyIds: ['harmony', 'royal'] }
    ]);

    const summaries = await store.unitSummaries();
    assert.deepEqual(summaries.map(unit => unit.id), ['harmony']);
    assert.deepEqual(summaries[0].property_ids, ['harmony', 'royal']);
    assert.equal((await db.get('SELECT enabled FROM reporting_units WHERE id=?', ['royal'])).enabled, 0);
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  }
});

test('getBatch converts PostgreSQL DATE objects to stable ISO day strings', async () => {
  const { ReportingStore } = require('../backend/src/reporting/store');
  const db = {
    pool: {},
    async queryOne() {
      return {
        id: 14,
        version: 1,
        record_count: 2,
        stay_count: 1,
        arrival_from: new Date(2026, 6, 25),
        arrival_to: new Date(2026, 6, 25)
      };
    },
    async query(sql) {
      if (sql.includes('FROM guest_stays')) return [{
        id: 21,
        booking_id: 7,
        guest_count: 2,
        rooms_occupied: 1,
        origin_confirmed: false,
        arrival_date: new Date(2026, 6, 25),
        departure_date: new Date(2026, 6, 28)
      }];
      if (sql.includes('FROM guest_records')) return [{
        id: 31,
        stay_id: 21,
        line_number: 1,
        arrival_date: new Date(2026, 6, 25),
        departure_date: new Date(2026, 6, 28),
        encrypted_record: null
      }];
      return [];
    }
  };
  const batch = await new ReportingStore(db).getBatch(14);
  assert.equal(batch.arrival_from, '2026-07-25');
  assert.equal(batch.stays[0].arrival_date, '2026-07-25');
  assert.equal(batch.stays[0].departure_date, '2026-07-28');
  assert.equal(batch.stays[0].records[0].arrival_date, '2026-07-25');
});
