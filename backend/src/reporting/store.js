const { encryptRecord, decryptRecord, fingerprint, sha256 } = require('./crypto');
const { istatOriginFromCitizenship } = require('./parser');

function isPostgres(db) {
  return Boolean(db.pool);
}

function parseJson(value, fallback = []) {
  if (value == null) return fallback;
  if (typeof value === 'object' && !Buffer.isBuffer(value)) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeBatch(row) {
  if (!row) return row;
  return {
    ...row,
    id: Number(row.id),
    version: Number(row.version),
    record_count: Number(row.record_count),
    stay_count: Number(row.stay_count)
  };
}

class ReportingStore {
  constructor(db) {
    this.db = db;
  }

  async rows(pgSql, sqliteSql, params = []) {
    return isPostgres(this.db) ? this.db.query(pgSql, params) : this.db.all(sqliteSql, params);
  }

  async one(pgSql, sqliteSql, params = []) {
    return isPostgres(this.db) ? this.db.queryOne(pgSql, params) : this.db.get(sqliteSql, params);
  }

  async execute(pgSql, sqliteSql, params = []) {
    return isPostgres(this.db) ? this.db.execute(pgSql, params) : this.db.run(sqliteSql, params);
  }

  async syncUnits(units) {
    for (const unit of units) {
      const propertyIds = JSON.stringify(unit.propertyIds || []);
      await this.execute(
        `INSERT INTO reporting_units (id, name, property_ids, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, property_ids = EXCLUDED.property_ids, enabled = TRUE, updated_at = NOW()`,
        `INSERT INTO reporting_units (id, name, property_ids, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, property_ids = excluded.property_ids, enabled = 1, updated_at = CURRENT_TIMESTAMP`,
        [unit.id, unit.name, propertyIds]
      );
    }

    const ids = units.map(unit => unit.id);
    const pgPlaceholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const sqlitePlaceholders = ids.map(() => '?').join(', ');
    await this.execute(
      ids.length
        ? `UPDATE reporting_units SET enabled = FALSE, updated_at = NOW() WHERE id NOT IN (${pgPlaceholders})`
        : 'UPDATE reporting_units SET enabled = FALSE, updated_at = NOW()',
      ids.length
        ? `UPDATE reporting_units SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id NOT IN (${sqlitePlaceholders})`
        : 'UPDATE reporting_units SET enabled = 0, updated_at = CURRENT_TIMESTAMP',
      ids
    );
  }

  async unitSummaries() {
    const rows = await this.rows(
      `SELECT ru.*,
              COUNT(DISTINCT gib.id)::int AS batch_count,
              COUNT(DISTINCT gib.id) FILTER (WHERE gib.status IN ('needs_review', 'ready', 'tested'))::int AS open_batches,
              MAX(gib.imported_at) AS last_imported_at
       FROM reporting_units ru
       LEFT JOIN guest_import_batches gib ON gib.reporting_unit_id = ru.id
       WHERE ru.enabled = TRUE
       GROUP BY ru.id ORDER BY ru.name`,
      `SELECT ru.*,
              COUNT(DISTINCT gib.id) AS batch_count,
              COUNT(DISTINCT CASE WHEN gib.status IN ('needs_review', 'ready', 'tested') THEN gib.id END) AS open_batches,
              MAX(gib.imported_at) AS last_imported_at
       FROM reporting_units ru
       LEFT JOIN guest_import_batches gib ON gib.reporting_unit_id = ru.id
       WHERE ru.enabled = 1
       GROUP BY ru.id ORDER BY ru.name`
    );
    return rows.map(row => ({
      ...row,
      property_ids: parseJson(row.property_ids),
      batch_count: Number(row.batch_count) || 0,
      open_batches: Number(row.open_batches) || 0
    }));
  }

  async listBatches(unitId, limit = 100) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const rows = await this.rows(
      `SELECT * FROM guest_import_batches
       WHERE ($1::text IS NULL OR reporting_unit_id = $1)
       ORDER BY imported_at DESC, id DESC LIMIT $2`,
      `SELECT * FROM guest_import_batches
       WHERE (? IS NULL OR reporting_unit_id = ?)
       ORDER BY imported_at DESC, id DESC LIMIT ?`,
      isPostgres(this.db) ? [unitId || null, safeLimit] : [unitId || null, unitId || null, safeLimit]
    );
    return rows.map(normalizeBatch);
  }

  async createBatch({ unit, filename, parsed, operatorEmail, bookingMatches = [] }) {
    const contentFingerprint = fingerprint(Buffer.from(parsed.decoded, 'utf8'));
    const existing = await this.one(
      'SELECT * FROM guest_import_batches WHERE reporting_unit_id = $1 AND content_fingerprint = $2',
      'SELECT * FROM guest_import_batches WHERE reporting_unit_id = ? AND content_fingerprint = ?',
      [unit.id, contentFingerprint]
    );
    if (existing) {
      const error = new Error('Этот TXT уже импортирован для выбранной структуры');
      error.code = 'DUPLICATE_IMPORT';
      error.batchId = Number(existing.id);
      throw error;
    }

    let batchId;
    if (isPostgres(this.db)) {
      const inserted = await this.db.execute(
        `INSERT INTO guest_import_batches
          (reporting_unit_id, filename, content_fingerprint, record_count, stay_count, arrival_from, arrival_to, imported_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [unit.id, filename, contentFingerprint, parsed.recordCount, parsed.stayCount, parsed.arrivalFrom, parsed.arrivalTo, operatorEmail]
      );
      batchId = Number(inserted.rows[0].id);
    } else {
      const inserted = await this.db.run(
        `INSERT INTO guest_import_batches
          (reporting_unit_id, filename, content_fingerprint, record_count, stay_count, arrival_from, arrival_to, imported_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [unit.id, filename, contentFingerprint, parsed.recordCount, parsed.stayCount, parsed.arrivalFrom, parsed.arrivalTo, operatorEmail]
      );
      batchId = Number(inserted.lastID);
    }

    for (let index = 0; index < parsed.groups.length; index++) {
      const group = parsed.groups[index];
      const matched = bookingMatches[index] || null;
      let stayId;
      const stayParams = [
        batchId,
        group.groupIndex,
        group.head.recordType,
        group.head.arrivalDate,
        group.head.departureDate,
        group.records.length,
        matched?.id || null,
        matched?.property_id || null
      ];
      if (isPostgres(this.db)) {
        const inserted = await this.db.execute(
          `INSERT INTO guest_stays
            (batch_id, group_index, head_record_type, arrival_date, departure_date, guest_count, booking_id, property_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          stayParams
        );
        stayId = Number(inserted.rows[0].id);
      } else {
        const inserted = await this.db.run(
          `INSERT INTO guest_stays
            (batch_id, group_index, head_record_type, arrival_date, departure_date, guest_count, booking_id, property_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          stayParams
        );
        stayId = Number(inserted.lastID);
      }

      for (const record of group.records) {
        const encrypted = encryptRecord(record.raw);
        const automaticOrigin = istatOriginFromCitizenship(record.citizenshipCode);
        await this.execute(
          `INSERT INTO guest_records
            (batch_id, stay_id, line_number, record_type, arrival_date, departure_date, record_fingerprint, encrypted_record, encryption_key_version, origin_kind, origin_code, origin_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          `INSERT INTO guest_records
            (batch_id, stay_id, line_number, record_type, arrival_date, departure_date, record_fingerprint, encrypted_record, encryption_key_version, origin_kind, origin_code, origin_label)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            batchId, stayId, record.lineNumber, record.recordType, record.arrivalDate,
            record.departureDate, record.fingerprint, encrypted.value, encrypted.keyVersion,
            automaticOrigin?.originKind || null,
            automaticOrigin?.originCode || null,
            automaticOrigin?.originLabel || null
          ]
        );
      }
    }
    return this.getBatch(batchId, { includePii: true });
  }

  async duplicateRecordFingerprints(unitId, recordFingerprints) {
    if (!recordFingerprints.length) return [];
    if (isPostgres(this.db)) {
      return this.db.query(
        `SELECT gr.record_fingerprint, gib.id AS batch_id, gib.filename
         FROM guest_records gr JOIN guest_import_batches gib ON gib.id=gr.batch_id
         WHERE gib.reporting_unit_id=$1 AND gr.record_fingerprint = ANY($2::varchar[])`,
        [unitId, recordFingerprints]
      );
    }
    const placeholders = recordFingerprints.map(() => '?').join(',');
    return this.db.all(
      `SELECT gr.record_fingerprint, gib.id AS batch_id, gib.filename
       FROM guest_records gr JOIN guest_import_batches gib ON gib.id=gr.batch_id
       WHERE gib.reporting_unit_id=? AND gr.record_fingerprint IN (${placeholders})`,
      [unitId, ...recordFingerprints]
    );
  }

  async getBatch(batchId, options = {}) {
    const batch = normalizeBatch(await this.one(
      'SELECT * FROM guest_import_batches WHERE id = $1',
      'SELECT * FROM guest_import_batches WHERE id = ?',
      [batchId]
    ));
    if (!batch) return null;
    const stays = await this.rows(
      `SELECT gs.*, b.guest_name AS booking_guest_name, p.name AS property_name
       FROM guest_stays gs
       LEFT JOIN bookings b ON b.id = gs.booking_id
       LEFT JOIN properties p ON p.id = gs.property_id
       WHERE gs.batch_id = $1 ORDER BY gs.group_index`,
      `SELECT gs.*, b.guest_name AS booking_guest_name, p.name AS property_name
       FROM guest_stays gs
       LEFT JOIN bookings b ON b.id = gs.booking_id
       LEFT JOIN properties p ON p.id = gs.property_id
       WHERE gs.batch_id = ? ORDER BY gs.group_index`,
      [batchId]
    );
    const records = await this.rows(
      'SELECT * FROM guest_records WHERE batch_id = $1 ORDER BY line_number',
      'SELECT * FROM guest_records WHERE batch_id = ? ORDER BY line_number',
      [batchId]
    );
    const byStay = new Map();
    for (const record of records) {
      let pii = null;
      if (options.includePii && record.encrypted_record) {
        const raw = decryptRecord(record.encrypted_record);
        pii = {
          surname: raw.slice(14, 64).trim(),
          name: raw.slice(64, 94).trim(),
          citizenship_code: raw.slice(125, 134).trim(),
          document_type: raw.slice(134, 139).trim(),
          document_number_masked: raw.slice(139, 159).trim().replace(/.(?=.{4})/g, '*')
        };
      }
      const normalized = {
        ...record,
        id: Number(record.id),
        stay_id: Number(record.stay_id),
        line_number: Number(record.line_number),
        pii
      };
      if (!byStay.has(normalized.stay_id)) byStay.set(normalized.stay_id, []);
      byStay.get(normalized.stay_id).push(normalized);
    }
    return {
      ...batch,
      stays: stays.map(stay => ({
        ...stay,
        id: Number(stay.id),
        booking_id: stay.booking_id == null ? null : Number(stay.booking_id),
        guest_count: Number(stay.guest_count),
        rooms_occupied: Number(stay.rooms_occupied),
        origin_confirmed: Boolean(stay.origin_confirmed),
        records: byStay.get(Number(stay.id)) || []
      }))
    };
  }

  async updateStay(stayId, input) {
    const records = Array.isArray(input.records) ? input.records : [];
    for (const record of records) {
      await this.execute(
        `UPDATE guest_records SET origin_kind=$1, origin_code=$2, origin_label=$3 WHERE id=$4 AND stay_id=$5`,
        `UPDATE guest_records SET origin_kind=?, origin_code=?, origin_label=? WHERE id=? AND stay_id=?`,
        [record.origin_kind, String(record.origin_code || '').trim(), String(record.origin_label || '').trim(), record.id, stayId]
      );
    }
    const originCounts = await this.one(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE origin_kind IN ('country','province') AND NULLIF(TRIM(origin_code),'') IS NOT NULL)::int AS complete
       FROM guest_records WHERE stay_id=$1`,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN origin_kind IN ('country','province') AND NULLIF(TRIM(origin_code),'') IS NOT NULL THEN 1 ELSE 0 END) AS complete
       FROM guest_records WHERE stay_id=?`,
      [stayId]
    );
    const originsComplete = Number(originCounts?.total) > 0 && Number(originCounts.total) === Number(originCounts.complete);
    await this.execute(
      `UPDATE guest_stays SET booking_id=$1, property_id=$2, rooms_occupied=$3,
       origin_confirmed=$4, review_status=$5 WHERE id=$6`,
      `UPDATE guest_stays SET booking_id=?, property_id=?, rooms_occupied=?,
       origin_confirmed=?, review_status=? WHERE id=?`,
      [input.booking_id || null, input.property_id || null, input.rooms_occupied, originsComplete, originsComplete && input.property_id ? 'ready' : 'needs_review', stayId]
    );
    const stay = await this.one('SELECT batch_id FROM guest_stays WHERE id=$1', 'SELECT batch_id FROM guest_stays WHERE id=?', [stayId]);
    if (stay) await this.refreshBatchStatus(stay.batch_id);
  }

  async refreshBatchStatus(batchId) {
    const row = await this.one(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE review_status='ready')::int AS ready
       FROM guest_stays WHERE batch_id=$1`,
      `SELECT COUNT(*) AS total, SUM(CASE WHEN review_status='ready' THEN 1 ELSE 0 END) AS ready
       FROM guest_stays WHERE batch_id=?`,
      [batchId]
    );
    const ready = Number(row?.total) > 0 && Number(row.total) === Number(row.ready);
    await this.execute(
      `UPDATE guest_import_batches SET status=$1, version=version+1, alloggiati_tested_at=NULL WHERE id=$2 AND alloggiati_sent_at IS NULL`,
      `UPDATE guest_import_batches SET status=?, version=version+1, alloggiati_tested_at=NULL WHERE id=? AND alloggiati_sent_at IS NULL`,
      [ready ? 'ready' : 'needs_review', batchId]
    );
  }

  async decryptedLines(batchId) {
    const rows = await this.rows(
      'SELECT line_number, encrypted_record FROM guest_records WHERE batch_id=$1 ORDER BY line_number',
      'SELECT line_number, encrypted_record FROM guest_records WHERE batch_id=? ORDER BY line_number',
      [batchId]
    );
    if (rows.some(row => !row.encrypted_record)) throw new Error('PII этого пакета уже удалены');
    return rows.map(row => decryptRecord(row.encrypted_record));
  }

  async addAlloggiatiSubmission({ unitId, batchId, operation, payloadFingerprint, status, validRecords, totalRecords, responseSummary, operatorEmail }) {
    const summary = JSON.stringify(responseSummary || {});
    await this.execute(
      `INSERT INTO alloggiati_submissions
       (reporting_unit_id,batch_id,operation,payload_fingerprint,status,valid_records,total_records,response_summary,operator_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      `INSERT INTO alloggiati_submissions
       (reporting_unit_id,batch_id,operation,payload_fingerprint,status,valid_records,total_records,response_summary,operator_email)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [unitId, batchId, operation, payloadFingerprint, status, validRecords, totalRecords, summary, operatorEmail]
    );
  }

  async markBatchTested(batchId, passed, details = []) {
    const status = passed ? 'tested' : 'ready';
    await this.execute(
      `UPDATE guest_import_batches SET status=$1, alloggiati_tested_at=CASE WHEN $2 THEN NOW() ELSE NULL END WHERE id=$3`,
      `UPDATE guest_import_batches SET status=?, alloggiati_tested_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`,
      [status, passed, batchId]
    );
    for (const detail of details) {
      await this.execute(
        `UPDATE guest_records SET alloggiati_status=$1, alloggiati_error_code=$2, alloggiati_error_detail=$3
         WHERE batch_id=$4 AND line_number=$5`,
        `UPDATE guest_records SET alloggiati_status=?, alloggiati_error_code=?, alloggiati_error_detail=?
         WHERE batch_id=? AND line_number=?`,
        [detail.ok ? 'valid' : 'invalid', detail.code || null, detail.detail || null, batchId, detail.lineNumber]
      );
    }
  }

  async markBatchSent(batchId, status, details = []) {
    const sent = status === 'sent';
    await this.execute(
      `UPDATE guest_import_batches SET status=$1, alloggiati_sent_at=CASE WHEN $2 THEN NOW() ELSE alloggiati_sent_at END WHERE id=$3`,
      `UPDATE guest_import_batches SET status=?, alloggiati_sent_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE alloggiati_sent_at END WHERE id=?`,
      [status, sent, batchId]
    );
    for (const detail of details) {
      await this.execute(
        `UPDATE guest_records SET alloggiati_status=$1, alloggiati_error_code=$2, alloggiati_error_detail=$3
         WHERE batch_id=$4 AND line_number=$5`,
        `UPDATE guest_records SET alloggiati_status=?, alloggiati_error_code=?, alloggiati_error_detail=?
         WHERE batch_id=? AND line_number=?`,
        [detail.ok ? 'sent' : 'rejected', detail.code || null, detail.detail || null, batchId, detail.lineNumber]
      );
    }
  }

  async pendingReceiptDates() {
    const rows = await this.rows(
      `SELECT reporting_unit_id, to_char(alloggiati_sent_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD') AS receipt_date
       FROM guest_import_batches
       WHERE alloggiati_sent_at IS NOT NULL AND receipt_received_at IS NULL
         AND alloggiati_sent_at < CURRENT_DATE
         AND alloggiati_sent_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY reporting_unit_id, receipt_date ORDER BY receipt_date`,
      `SELECT reporting_unit_id, date(alloggiati_sent_at) AS receipt_date
       FROM guest_import_batches
       WHERE alloggiati_sent_at IS NOT NULL AND receipt_received_at IS NULL
         AND date(alloggiati_sent_at) < date('now')
         AND date(alloggiati_sent_at) >= date('now', '-30 days')
       GROUP BY reporting_unit_id, receipt_date ORDER BY receipt_date`
    );
    return rows;
  }

  async saveReceipt(unitId, receiptDate, pdf) {
    const digest = sha256(pdf);
    if (isPostgres(this.db)) {
      await this.db.execute(
        `INSERT INTO alloggiati_receipts (reporting_unit_id, receipt_date, pdf_data, pdf_sha256)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (reporting_unit_id,receipt_date) DO UPDATE SET pdf_data=EXCLUDED.pdf_data,pdf_sha256=EXCLUDED.pdf_sha256,received_at=NOW()`,
        [unitId, receiptDate, pdf, digest]
      );
      await this.db.execute(
        `UPDATE guest_import_batches SET receipt_received_at=NOW()
         WHERE reporting_unit_id=$1 AND (alloggiati_sent_at AT TIME ZONE 'Europe/Rome')::date=$2::date`,
        [unitId, receiptDate]
      );
    } else {
      await this.db.run(
        `INSERT INTO alloggiati_receipts (reporting_unit_id, receipt_date, pdf_data, pdf_sha256)
         VALUES (?,?,?,?)
         ON CONFLICT(reporting_unit_id,receipt_date) DO UPDATE SET pdf_data=excluded.pdf_data,pdf_sha256=excluded.pdf_sha256,received_at=CURRENT_TIMESTAMP`,
        [unitId, receiptDate, pdf, digest]
      );
      await this.db.run(
        `UPDATE guest_import_batches SET receipt_received_at=CURRENT_TIMESTAMP
         WHERE reporting_unit_id=? AND date(alloggiati_sent_at)=date(?)`,
        [unitId, receiptDate]
      );
    }
    return digest;
  }

  async getReceipt(unitId, receiptDate) {
    return this.one(
      'SELECT * FROM alloggiati_receipts WHERE reporting_unit_id=$1 AND receipt_date=$2::date',
      'SELECT * FROM alloggiati_receipts WHERE reporting_unit_id=? AND receipt_date=date(?)',
      [unitId, receiptDate]
    );
  }

  async staysForMonth(unitId, month) {
    const start = `${month}-01`;
    const next = new Date(`${start}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const end = next.toISOString().slice(0, 10);
    const stays = await this.rows(
      `SELECT gs.* FROM guest_stays gs
       JOIN guest_import_batches gib ON gib.id=gs.batch_id
       WHERE gib.reporting_unit_id=$1 AND gs.arrival_date < $3::date AND gs.departure_date >= $2::date
       ORDER BY gs.arrival_date, gs.id`,
      `SELECT gs.* FROM guest_stays gs
       JOIN guest_import_batches gib ON gib.id=gs.batch_id
       WHERE gib.reporting_unit_id=? AND gs.arrival_date < ? AND gs.departure_date >= ?
       ORDER BY gs.arrival_date, gs.id`,
      isPostgres(this.db) ? [unitId, start, end] : [unitId, end, start]
    );
    for (const stay of stays) {
      stay.id = Number(stay.id);
      stay.rooms_occupied = Number(stay.rooms_occupied);
      stay.origin_confirmed = Boolean(stay.origin_confirmed);
      stay.records = await this.rows(
        `SELECT id, origin_kind, origin_code, arrival_date::text, departure_date::text FROM guest_records WHERE stay_id=$1`,
        `SELECT id, origin_kind, origin_code, arrival_date, departure_date FROM guest_records WHERE stay_id=?`,
        [stay.id]
      );
    }
    return stays;
  }

  async saveIstatSubmission({ unitId, month, payload, status, remoteSnapshot, operatorEmail, verified = false }) {
    const payloadJson = JSON.stringify(payload);
    const remoteJson = remoteSnapshot == null ? null : JSON.stringify(remoteSnapshot);
    const payloadFingerprint = sha256(payloadJson);
    await this.execute(
      `INSERT INTO istat_month_submissions
        (reporting_unit_id,month,payload,payload_fingerprint,status,remote_snapshot,operator_email,submitted_at,verified_at,updated_at)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7,CASE WHEN $5 IN ('submitted','verified') THEN NOW() END,CASE WHEN $8 THEN NOW() END,NOW())
       ON CONFLICT (reporting_unit_id,month) DO UPDATE SET payload=EXCLUDED.payload,payload_fingerprint=EXCLUDED.payload_fingerprint,
       status=EXCLUDED.status,remote_snapshot=EXCLUDED.remote_snapshot,operator_email=EXCLUDED.operator_email,
       submitted_at=COALESCE(istat_month_submissions.submitted_at,EXCLUDED.submitted_at),verified_at=EXCLUDED.verified_at,updated_at=NOW()`,
      `INSERT INTO istat_month_submissions
        (reporting_unit_id,month,payload,payload_fingerprint,status,remote_snapshot,operator_email,submitted_at,verified_at,updated_at)
       VALUES (?,?,?,?,?,?,?,CASE WHEN ? IN ('submitted','verified') THEN CURRENT_TIMESTAMP END,CASE WHEN ? THEN CURRENT_TIMESTAMP END,CURRENT_TIMESTAMP)
       ON CONFLICT(reporting_unit_id,month) DO UPDATE SET payload=excluded.payload,payload_fingerprint=excluded.payload_fingerprint,
       status=excluded.status,remote_snapshot=excluded.remote_snapshot,operator_email=excluded.operator_email,
       submitted_at=COALESCE(istat_month_submissions.submitted_at,excluded.submitted_at),verified_at=excluded.verified_at,updated_at=CURRENT_TIMESTAMP`,
      isPostgres(this.db)
        ? [unitId, month, payloadJson, payloadFingerprint, status, remoteJson, operatorEmail, verified]
        : [unitId, month, payloadJson, payloadFingerprint, status, remoteJson, operatorEmail, status, verified]
    );
    return payloadFingerprint;
  }

  async purgeExpiredPii(retentionDays = 30) {
    const days = Math.max(1, Number(retentionDays) || 30);
    const candidates = await this.rows(
      `SELECT gib.id FROM guest_import_batches gib
       WHERE gib.alloggiati_sent_at < NOW() - ($1 || ' days')::interval
         AND gib.receipt_received_at IS NOT NULL AND gib.pii_purged_at IS NULL`,
      `SELECT id FROM guest_import_batches
       WHERE alloggiati_sent_at < datetime('now', '-' || ? || ' days')
         AND receipt_received_at IS NOT NULL AND pii_purged_at IS NULL`,
      [days]
    );
    for (const row of candidates) {
      await this.execute(
        'UPDATE guest_records SET encrypted_record=NULL, alloggiati_error_detail=NULL WHERE batch_id=$1',
        'UPDATE guest_records SET encrypted_record=NULL, alloggiati_error_detail=NULL WHERE batch_id=?',
        [row.id]
      );
      await this.execute(
        `UPDATE alloggiati_submissions SET response_summary='{"pii_purged":true}'::jsonb WHERE batch_id=$1`,
        `UPDATE alloggiati_submissions SET response_summary='{"pii_purged":true}' WHERE batch_id=?`,
        [row.id]
      );
      await this.execute('UPDATE guest_import_batches SET pii_purged_at=NOW(), status=\'pii_purged\' WHERE id=$1', "UPDATE guest_import_batches SET pii_purged_at=CURRENT_TIMESTAMP, status='pii_purged' WHERE id=?", [row.id]);
    }
    return candidates.length;
  }
}

module.exports = { ReportingStore, parseJson };
