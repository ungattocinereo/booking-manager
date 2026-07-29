const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.ALLOGGIATI_CARINA_USER = 'test-user';
process.env.ALLOGGIATI_CARINA_PASSWORD = 'test-password';
process.env.ALLOGGIATI_CARINA_WSKEY = 'test-key';
process.env.REPORTING_EXTERNAL_SEND_ENABLED = 'true';

const SAMPLE = '1625/07/20263 ALLAN                                             TIMOTHY FRASER                222/10/1997           100000701100000701PASORRB1474082           100000701';

function sampleWithSurname(surname) {
  return `${SAMPLE.slice(0, 14)}${String(surname).padEnd(50).slice(0, 50)}${SAMPLE.slice(64)}`;
}

async function withReportingDb(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-reporting-workflow-'));
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
    const createBatch = async (surname) => store.createBatch({
      unit,
      filename: `${surname}.txt`,
      parsed: parseAlloggiatiTxt(Buffer.from(sampleWithSurname(surname), 'latin1')),
      operatorEmail: 'test@example.com'
    });
    await run({ db, store, ReportingService, createBatch });
  } finally {
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  }
}

test('a parsed TXT is immediately testable and ISTAT edits do not reset Alloggiati state', async () => {
  await withReportingDb(async ({ db, store, ReportingService, createBatch }) => {
    const service = new ReportingService(db);
    await assert.rejects(service.importTxt({
      unitId: 'carina', filename: 'wrong.txt', contentBase64: Buffer.from('invalid').toString('base64'), operator: 'test@example.com'
    }), error => error.status === 400 && error.code === 'INVALID_TXT');
    assert.equal((await store.listBatches('carina')).length, 0);

    const batch = await createBatch('READY');
    assert.equal(batch.status, 'ready');

    await store.markBatchTested(batch.id, true, [{ lineNumber: 1, ok: true }]);
    await service.updateStay(batch.stays[0].id, {
      batch_id: batch.id,
      property_id: 'carina',
      booking_id: null,
      rooms_occupied: 1,
      records: [{ id: batch.stays[0].records[0].id, origin_kind: 'country', origin_code: '701', origin_label: 'Australia' }]
    });

    const updated = await store.getBatch(batch.id);
    assert.equal(updated.status, 'tested');
    assert.equal(updated.stays[0].review_status, 'ready');

    await db.run("UPDATE guest_import_batches SET status='sent', alloggiati_sent_at=CURRENT_TIMESTAMP WHERE id=?", [batch.id]);
    await service.updateStay(batch.stays[0].id, {
      batch_id: batch.id,
      property_id: 'carina',
      booking_id: null,
      rooms_occupied: 2,
      records: [{ id: batch.stays[0].records[0].id, origin_kind: 'country', origin_code: '701', origin_label: 'Australia' }]
    });
    const sentWithIstat = await store.getBatch(batch.id);
    assert.equal(sentWithIstat.status, 'sent');
    assert.equal(sentWithIstat.stays[0].rooms_occupied, 2);
  });
});

test('deleting a draft purges guest data, preserves detached Test audit, and permits re-upload', async () => {
  await withReportingDb(async ({ db, store, ReportingService, createBatch }) => {
    const batch = await createBatch('DELETE');
    await store.addAlloggiatiSubmission({
      unitId: 'carina', batchId: batch.id, operation: 'test', payloadFingerprint: 'fingerprint',
      status: 'passed', validRecords: 1, totalRecords: 1, responseSummary: { ok: true }, operatorEmail: 'test@example.com'
    });

    const service = new ReportingService(db);
    const deleted = await service.deleteImport(batch.id);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.batch_id, batch.id);
    assert.equal(await store.getBatch(batch.id), null);
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM guest_records WHERE batch_id=?', [batch.id])).total, 0);
    assert.equal((await db.get('SELECT batch_id FROM alloggiati_submissions WHERE payload_fingerprint=?', ['fingerprint'])).batch_id, null);

    const reuploaded = await createBatch('DELETE');
    assert.equal(reuploaded.status, 'ready');
    await db.run("UPDATE guest_import_batches SET status='partial' WHERE id=?", [reuploaded.id]);
    await assert.rejects(service.deleteImport(reuploaded.id), error => error.status === 409 && error.code === 'BATCH_NOT_DELETABLE');
  });
});

test('sent history is scoped, sorted, and limited to five successful batches', async () => {
  await withReportingDb(async ({ db, store, createBatch }) => {
    for (let index = 0; index < 7; index++) {
      const batch = await createBatch(`HISTORY${index}`);
      if (index < 6) {
        await db.run(
          "UPDATE guest_import_batches SET status='sent', alloggiati_sent_at=datetime('now', ?) WHERE id=?",
          [`-${6 - index} minutes`, batch.id]
        );
      } else {
        await db.run("UPDATE guest_import_batches SET status='unknown' WHERE id=?", [batch.id]);
      }
    }

    const history = await store.listBatches('carina', 5, 'sent');
    assert.equal(history.length, 5);
    assert.ok(history.every(batch => batch.status === 'sent'));
    assert.deepEqual(history.map(batch => batch.filename), ['HISTORY5.txt', 'HISTORY4.txt', 'HISTORY3.txt', 'HISTORY2.txt', 'HISTORY1.txt']);
    const open = await store.listBatches('carina', 100, 'open');
    assert.deepEqual(open.map(batch => batch.filename), ['HISTORY6.txt']);
  });
});

test('only one concurrent send reaches Alloggiati and definite failures become retryable', async () => {
  await withReportingDb(async ({ store, ReportingService, createBatch }) => {
    const batch = await createBatch('CONCURRENT');
    await store.markBatchTested(batch.id, true, [{ lineNumber: 1, ok: true }]);
    let releaseSend;
    let markSendStarted;
    let sendCalls = 0;
    const sendGate = new Promise(resolve => { releaseSend = resolve; });
    const sendStarted = new Promise(resolve => { markSendStarted = resolve; });
    class SlowClient {
      async send() {
        sendCalls += 1;
        markSendStarted();
        await sendGate;
        return { ok: true, validRecords: 1, totalRecords: 1, details: [{ lineNumber: 1, ok: true }] };
      }
    }
    const service = new ReportingService(store.db, { AlloggiatiClient: SlowClient });
    const input = { batchId: batch.id, action: 'send', expectedVersion: batch.version, confirmed: true, operator: 'test@example.com' };
    const first = service.alloggiatiAction(input);
    await sendStarted;
    await assert.rejects(service.alloggiatiAction(input), error => error.status === 409);
    releaseSend();
    const sent = await first;
    assert.equal(sendCalls, 1);
    assert.equal(sent.batch.status, 'sent');

    const failedBatch = await createBatch('RETRY');
    await store.markBatchTested(failedBatch.id, true, [{ lineNumber: 1, ok: true }]);
    class FailedClient {
      async send() {
        const error = new Error('Connection refused');
        error.code = 'ECONNREFUSED';
        throw error;
      }
    }
    const failedService = new ReportingService(store.db, { AlloggiatiClient: FailedClient });
    await assert.rejects(failedService.alloggiatiAction({
      batchId: failedBatch.id, action: 'send', expectedVersion: failedBatch.version,
      confirmed: true, operator: 'test@example.com'
    }), /Connection refused/);
    assert.equal((await store.getBatch(failedBatch.id)).status, 'tested');
  });
});
