const { loadReportingUnits, publicReportingUnit, getReportingUnit, externalSendEnabled } = require('./config');
const { parseAlloggiatiTxt } = require('./parser');
const { chooseBookingSuggestion } = require('./matcher');
const { ReportingStore } = require('./store');
const { AlloggiatiClient } = require('./alloggiati-client');
const { IstatClient } = require('./istat-client');
const { aggregateIstatMonth } = require('./istat-movements');
const { fingerprint, sha256 } = require('./crypto');
const { dateOnly } = require('../../../lib/booking-normalization');

function operatorEmail(req) {
  return String(req.headers?.['cf-access-authenticated-user-email'] || req.headers?.['x-reporting-operator'] || 'local-operator').slice(0, 255);
}

function italianDateToIso(value) {
  const match = String(value || '').trim().match(/^(\d{2})\/?(\d{2})\/?(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function istatMonthWindow(month) {
  const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) throw Object.assign(new Error('month must be YYYY-MM'), { status: 400 });
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  if (monthNumber < 1 || monthNumber > 12 || !Number.isInteger(days)) {
    throw Object.assign(new Error('Invalid month'), { status: 400 });
  }
  return {
    start: `01${match[2]}${match[1]}`,
    days,
    endDate: `${match[1]}-${match[2]}-${String(days).padStart(2, '0')}`
  };
}

function canonicalIstatDays(days) {
  return (Array.isArray(days) ? days : []).map(day => ({
    dataRilevazione: String(day.dataRilevazione || ''),
    camereOccupate: Number(day.camereOccupate) || 0,
    strutturaChiusa: day.strutturaChiusa === true,
    movimentazioni: (Array.isArray(day.movimentazioni) ? day.movimentazioni : []).map(move => ({
      ...(move.codiceProvincia != null ? { codiceProvincia: String(move.codiceProvincia) } : { codiceNazione: String(move.codiceNazione || '') }),
      arrivi: Number(move.arrivi) || 0,
      presentiNottePrecedente: Number(move.presentiNottePrecedente) || 0,
      partenze: Number(move.partenze) || 0
    })).sort((a, b) => String(a.codiceProvincia || a.codiceNazione).localeCompare(String(b.codiceProvincia || b.codiceNazione)))
  })).sort((a, b) => a.dataRilevazione.localeCompare(b.dataRilevazione));
}

function dayHasIstatData(day) {
  return Boolean(
    day?.strutturaChiusa ||
    Number(day?.camereOccupate) ||
    (Array.isArray(day?.movimentazioni) && day.movimentazioni.some(move =>
      Number(move.arrivi) || Number(move.presentiNottePrecedente) || Number(move.partenze)
    ))
  );
}

function addIstatDay(remote, local) {
  const movements = new Map();
  for (const move of [...(remote?.movimentazioni || []), ...(local?.movimentazioni || [])]) {
    const province = move.codiceProvincia != null;
    const code = String(province ? move.codiceProvincia : (move.codiceNazione || ''));
    const key = `${province ? 'province' : 'country'}:${code}`;
    const current = movements.get(key) || {
      ...(province ? { codiceProvincia: code } : { codiceNazione: code }),
      arrivi: 0,
      presentiNottePrecedente: 0,
      partenze: 0
    };
    current.arrivi += Number(move.arrivi) || 0;
    current.presentiNottePrecedente += Number(move.presentiNottePrecedente) || 0;
    current.partenze += Number(move.partenze) || 0;
    movements.set(key, current);
  }
  return {
    dataRilevazione: local?.dataRilevazione || remote?.dataRilevazione,
    camereOccupate: (Number(remote?.camereOccupate) || 0) + (Number(local?.camereOccupate) || 0),
    strutturaChiusa: remote?.strutturaChiusa === true || local?.strutturaChiusa === true,
    movimentazioni: [...movements.values()]
  };
}

function mergeIstatDays(localDays, remoteDays, latestDate, monthEndDate) {
  const remoteByDate = new Map((Array.isArray(remoteDays) ? remoteDays : []).map(day => [italianDateToIso(day.dataRilevazione), day]));
  return (Array.isArray(localDays) ? localDays : []).map(day => {
    const iso = italianDateToIso(day.dataRilevazione);
    if (!latestDate || !iso || iso > latestDate || !remoteByDate.has(iso)) return day;
    if (monthEndDate && latestDate >= monthEndDate) return remoteByDate.get(iso);
    return addIstatDay(remoteByDate.get(iso), day);
  });
}

function istatPendingDates(localDays, latestDate, monthEndDate) {
  if (latestDate && monthEndDate && latestDate >= monthEndDate) return [];
  return (Array.isArray(localDays) ? localDays : [])
    .filter(day => {
      const iso = italianDateToIso(day.dataRilevazione);
      return !latestDate || iso > latestDate || (iso <= latestDate && dayHasIstatData(day));
    })
    .map(day => italianDateToIso(day.dataRilevazione));
}

class ReportingService {
  constructor(db, clients = {}) {
    this.db = db;
    this.store = new ReportingStore(db);
    this.AlloggiatiClient = clients.AlloggiatiClient || AlloggiatiClient;
    this.IstatClient = clients.IstatClient || IstatClient;
  }

  async init() {
    if (!this.db.pool && !this.db.db) await this.db.init();
    const units = loadReportingUnits();
    await this.store.syncUnits(units);
    return units;
  }

  async dashboard() {
    const configuredUnits = await this.init();
    const summaries = await this.store.unitSummaries();
    const configById = new Map(configuredUnits.map(unit => [unit.id, unit]));
    return {
      external_send_enabled: externalSendEnabled(),
      units: summaries.map(summary => ({
        ...publicReportingUnit(configById.get(summary.id)),
        batch_count: summary.batch_count,
        open_batches: summary.open_batches,
        last_imported_at: summary.last_imported_at
      }))
    };
  }

  async importTxt({ unitId, filename, contentBase64, operator }) {
    await this.init();
    const unit = getReportingUnit(unitId);
    if (!unit) throw Object.assign(new Error('Неизвестная отчётная структура'), { status: 400 });
    if (!contentBase64 || typeof contentBase64 !== 'string') throw Object.assign(new Error('content_base64 is required'), { status: 400 });
    const buffer = Buffer.from(contentBase64, 'base64');
    let parsed;
    try {
      parsed = parseAlloggiatiTxt(buffer);
    } catch (error) {
      error.status = 400;
      error.code = 'INVALID_TXT';
      throw error;
    }
    const duplicateRecords = await this.store.duplicateRecordFingerprints(unit.id, parsed.records.map(record => record.fingerprint));
    if (duplicateRecords.length) {
      const error = new Error(`TXT содержит ${duplicateRecords.length} ранее импортированных записей`);
      error.status = 409;
      error.details = duplicateRecords.map(record => ({ batch_id: Number(record.batch_id), filename: record.filename }));
      throw error;
    }
    const bookings = await this.db.getBookings(null, parsed.arrivalFrom, { includeInactive: false });
    const bookingMatches = parsed.groups.map(group => chooseBookingSuggestion(group, bookings, unit.propertyIds).selected);
    const batch = await this.store.createBatch({
      unit,
      filename: String(filename || 'alloggiati.txt').slice(0, 255),
      parsed,
      operatorEmail: operator,
      bookingMatches
    });
    return { batch, suggestions: parsed.groups.map(group => {
      const match = chooseBookingSuggestion(group, bookings, unit.propertyIds);
      return match.suggestions.map(item => ({
        booking_id: item.booking.id,
        property_id: item.booking.property_id,
        start_date: item.booking.start_date,
        end_date: item.booking.end_date,
        guest_name: item.booking.guest_name,
        score: item.score
      }));
    }) };
  }

  async updateStay(stayId, body) {
    await this.init();
    const batchId = Number(body.batch_id);
    const batch = await this.store.getBatch(batchId, { includePii: false });
    if (!batch) throw Object.assign(new Error('Пакет не найден'), { status: 404 });
    if (batch.status === 'sending') throw Object.assign(new Error('Дождитесь завершения отправки Alloggiati'), { status: 409 });
    if (batch.status === 'pii_purged') throw Object.assign(new Error('Персональные данные этого пакета уже удалены'), { status: 409 });
    const stay = batch.stays.find(item => item.id === Number(stayId));
    if (!stay) throw Object.assign(new Error('Группа гостей не принадлежит этому пакету'), { status: 409 });

    const unit = getReportingUnit(batch.reporting_unit_id);
    const propertyId = typeof body.property_id === 'string' && body.property_id.trim() ? body.property_id.trim() : null;
    if (propertyId && !unit?.propertyIds.includes(propertyId)) {
      throw Object.assign(new Error('Апартамент не относится к выбранной отчётной структуре'), { status: 400 });
    }
    const roomsOccupied = Number(body.rooms_occupied);
    if (!Number.isInteger(roomsOccupied) || roomsOccupied < 1 || roomsOccupied > 100) {
      throw Object.assign(new Error('Количество комнат должно быть целым числом от 1 до 100'), { status: 400 });
    }
    const records = Array.isArray(body.records) ? body.records : [];
    const recordIds = new Set(stay.records.map(record => record.id));
    if (records.some(record => !recordIds.has(Number(record.id)))) {
      throw Object.assign(new Error('Запись гостя не принадлежит выбранной группе'), { status: 409 });
    }
    if (records.some(record => !['country', 'province'].includes(record.origin_kind) || !String(record.origin_code || '').trim() || String(record.origin_code).trim().length > 20)) {
      throw Object.assign(new Error('Для каждого изменяемого гостя нужен корректный код страны или провинции'), { status: 400 });
    }

    const bookingId = body.booking_id == null || body.booking_id === '' ? null : Number(body.booking_id);
    if (bookingId != null) {
      if (!Number.isInteger(bookingId) || !propertyId) throw Object.assign(new Error('Некорректная связь с бронью'), { status: 400 });
      const bookings = await this.db.getBookings(propertyId, stay.arrival_date, { includeInactive: false });
      const booking = bookings.find(item => Number(item.id) === bookingId);
      if (!booking || dateOnly(booking.start_date) !== dateOnly(stay.arrival_date) || dateOnly(booking.end_date) !== dateOnly(stay.departure_date)) {
        throw Object.assign(new Error('Бронь не совпадает с объектом и датами проживания'), { status: 409 });
      }
    }

    await this.store.updateStay(stayId, {
      ...body,
      booking_id: bookingId,
      property_id: propertyId,
      rooms_occupied: roomsOccupied,
      records
    });
    return this.store.getBatch(batchId, { includePii: true });
  }

  async deleteImport(batchId) {
    await this.init();
    return this.store.deleteUnsentBatch(batchId);
  }

  async alloggiatiAction({ batchId, action, expectedVersion, confirmed, operator }) {
    await this.init();
    const batch = await this.store.getBatch(batchId, { includePii: false });
    if (!batch) throw Object.assign(new Error('Пакет не найден'), { status: 404 });
    if (Number(expectedVersion) !== batch.version) throw Object.assign(new Error('Пакет изменился; обновите страницу'), { status: 409 });
    const unit = getReportingUnit(batch.reporting_unit_id);
    if (!unit?.configured.alloggiati) throw Object.assign(new Error('Alloggiati credentials are not configured'), { status: 503 });
    if (action === 'send' && !externalSendEnabled()) throw Object.assign(new Error('Реальная отправка пока отключена feature flag'), { status: 503 });
    if (action === 'send' && (!confirmed || batch.status !== 'tested')) {
      throw Object.assign(new Error('Сначала выполните Test и подтвердите отправку'), { status: 409 });
    }
    if (!['test', 'send'].includes(action)) throw Object.assign(new Error('Unknown Alloggiati action'), { status: 400 });
    if (action === 'test' && !['needs_review', 'ready', 'tested'].includes(batch.status)) {
      throw Object.assign(new Error('Этот пакет нельзя проверить в текущем состоянии'), { status: 409 });
    }

    if (action === 'send') {
      const claimed = await this.store.claimBatchForSend(batchId, expectedVersion);
      if (!claimed) throw Object.assign(new Error('Отправка уже началась или пакет изменился; обновите страницу'), { status: 409 });
    }

    let lines = [];
    let payloadFingerprint = '';
    let sendSubmissionId = null;
    let result;
    try {
      lines = await this.store.decryptedLines(batchId);
      payloadFingerprint = fingerprint(lines.join('\r\n'));
      const client = new this.AlloggiatiClient(unit.alloggiati);
      if (action === 'send') {
        sendSubmissionId = await this.store.startAlloggiatiSend({
          unitId: unit.id, batchId, payloadFingerprint, totalRecords: lines.length, operatorEmail: operator
        });
      }
      result = action === 'test' ? await client.test(lines) : await client.send(lines);
    } catch (error) {
      const ambiguous = action === 'send' && ['ALLOGGIATI_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code);
      const submission = {
        status: ambiguous ? 'unknown' : 'failed', totalRecords: lines.length || batch.record_count,
        responseSummary: { code: error.code || null, message: error.message }
      };
      if (action === 'send') {
        if (ambiguous) await this.store.markBatchSent(batchId, 'unknown', []);
        else await this.store.releaseBatchAfterSendFailure(batchId);
      }
      try {
        if (sendSubmissionId) await this.store.finishAlloggiatiSend(sendSubmissionId, submission);
        else await this.store.addAlloggiatiSubmission({
          unitId: unit.id, batchId, operation: action, payloadFingerprint, ...submission, operatorEmail: operator
        });
      } catch (logError) {
        console.error('Alloggiati submission log error:', logError.message);
      }
      throw error;
    }

    const allValid = result.ok && result.validRecords === lines.length && result.details.every(item => item.ok);
    if (action === 'test') await this.store.markBatchTested(batchId, allValid, result.details);
    else await this.store.markBatchSent(batchId, allValid ? 'sent' : 'partial', result.details);
    const submission = {
      status: allValid ? (action === 'test' ? 'passed' : 'sent') : 'partial',
      validRecords: result.validRecords, totalRecords: result.totalRecords,
      responseSummary: { ok: result.ok, code: result.code, description: result.description, details: result.details }
    };
    if (sendSubmissionId) await this.store.finishAlloggiatiSend(sendSubmissionId, submission);
    else await this.store.addAlloggiatiSubmission({
      unitId: unit.id, batchId, operation: action, payloadFingerprint, ...submission, operatorEmail: operator
    });
    return { result, batch: await this.store.getBatch(batchId, { includePii: true }) };
  }

  async istatPreview(unitId, month) {
    await this.init();
    const unit = getReportingUnit(unitId);
    if (!unit) throw Object.assign(new Error('Неизвестная отчётная структура'), { status: 400 });
    const stays = await this.store.staysForMonth(unitId, month);
    const preview = aggregateIstatMonth({ month, stays });
    return { unit: publicReportingUnit(unit), ...preview };
  }

  async istatLedger(unitId, month) {
    const preview = await this.istatPreview(unitId, month);
    if (!preview.unit.configured.istat) {
      return { ...preview, latest_date: null, remote_days: [] };
    }
    const status = await this.istatStatus(unitId, month);
    const window = istatMonthWindow(month);
    const pendingDates = istatPendingDates(preview.giornate, status.latest_date, window.endDate);
    return {
      ...preview,
      giornate: mergeIstatDays(preview.giornate, status.remote_days, status.latest_date, window.endDate),
      latest_date: status.latest_date,
      remote_days: status.remote_days,
      pending_dates: pendingDates
    };
  }

  async istatStatus(unitId, month = null) {
    await this.init();
    const unit = getReportingUnit(unitId);
    if (!unit) throw Object.assign(new Error('Неизвестная отчётная структура'), { status: 400 });
    if (!unit.configured.istat) {
      return { unit: publicReportingUnit(unit), configured: false, latest_date: null, month, remote_days: [] };
    }
    const client = new this.IstatClient(unit.istat);
    const latest = await client.latest();
    const latestDate = italianDateToIso(latest?.dataUltimaRilevazione);
    let remoteDays = [];
    if (month) {
      const window = istatMonthWindow(month);
      if (latestDate && latestDate >= `${month}-01`) {
        const remote = await client.movements(window.start, window.days);
        remoteDays = (Array.isArray(remote?.giornate) ? remote.giornate : []).filter(day => {
          const iso = italianDateToIso(day.dataRilevazione);
          return iso && iso.startsWith(`${month}-`) && iso <= latestDate;
        });
      }
    }
    return {
      unit: publicReportingUnit(unit),
      configured: true,
      latest_date: latestDate,
      month,
      remote_days: remoteDays
    };
  }

  async sendIstat({ unitId, month, expectedHash, confirmed, replace, operator }) {
    const preview = await this.istatLedger(unitId, month);
    if (!preview.ready) throw Object.assign(new Error('ISTAT preview содержит блокирующие ошибки'), { status: 409, details: preview.errors });
    const unit = getReportingUnit(unitId);
    if (!unit.configured.istat) throw Object.assign(new Error('ISTAT credentials are not configured'), { status: 503 });
    if (!externalSendEnabled()) throw Object.assign(new Error('Реальная отправка пока отключена feature flag'), { status: 503 });
    const payload = { giornate: preview.giornate };
    const payloadHash = sha256(JSON.stringify(payload));
    if (!confirmed || expectedHash !== payloadHash) throw Object.assign(new Error('Preview изменился; повторите подтверждение'), { status: 409 });
    const client = new this.IstatClient(unit.istat);
    const window = istatMonthWindow(month);
    let response;
    try {
      const latest = await client.latest();
      const latestIso = italianDateToIso(latest?.dataUltimaRilevazione);
      let existingRemote = null;
      if (latestIso && latestIso >= `${month}-01`) {
        existingRemote = await client.movements(window.start, window.days);
        const localCanonical = canonicalIstatDays(payload.giornate);
        const remoteCanonical = canonicalIstatDays(existingRemote?.giornate);
        if (remoteCanonical.length && JSON.stringify(remoteCanonical) === JSON.stringify(localCanonical)) {
          await this.store.saveIstatSubmission({ unitId, month, payload, status: 'verified', remoteSnapshot: existingRemote, operatorEmail: operator, verified: true });
          return { verified: true, no_op: true, payload_hash: payloadHash, remote: existingRemote };
        }
        if (remoteCanonical.length && !replace) {
          const conflict = new Error('В Sinfonia уже есть отличающиеся данные за этот месяц; требуется отдельное подтверждение замены');
          conflict.status = 409;
          conflict.details = { latest_remote_date: latestIso };
          throw conflict;
        }
      }
      response = replace ? await client.replace(payload) : await client.create(payload);
    } catch (error) {
      await this.store.saveIstatSubmission({ unitId, month, payload, status: error.status === 409 ? 'conflict' : (error.code === 'ISTAT_TIMEOUT' ? 'unknown' : 'failed'), remoteSnapshot: error.response, operatorEmail: operator });
      throw error;
    }
    const remote = await client.movements(window.start, window.days);
    const verified = JSON.stringify(canonicalIstatDays(remote?.giornate)) === JSON.stringify(canonicalIstatDays(payload.giornate));
    await this.store.saveIstatSubmission({ unitId, month, payload, status: verified ? 'verified' : 'submitted', remoteSnapshot: remote, operatorEmail: operator, verified });
    return { verified, payload_hash: payloadHash, response, remote };
  }

  async maintenance() {
    await this.init();
    const pending = await this.store.pendingReceiptDates();
    const receipts = [];
    for (const item of pending) {
      const unit = getReportingUnit(item.reporting_unit_id);
      if (!unit?.configured.alloggiati) continue;
      try {
        const result = await new this.AlloggiatiClient(unit.alloggiati).receipt(item.receipt_date);
        if (result.ok && result.pdf?.length) {
          const sha256 = await this.store.saveReceipt(unit.id, item.receipt_date, result.pdf);
          receipts.push({ unit_id: unit.id, date: item.receipt_date, status: 'saved', sha256 });
        } else {
          receipts.push({ unit_id: unit.id, date: item.receipt_date, status: 'not_available' });
        }
      } catch (error) {
        receipts.push({ unit_id: unit.id, date: item.receipt_date, status: 'failed', code: error.code || null });
      }
    }
    const purged = await this.store.purgeExpiredPii(process.env.REPORTING_PII_RETENTION_DAYS || 30);
    return { receipts, pii_batches_purged: purged };
  }
}

module.exports = {
  ReportingService,
  operatorEmail,
  canonicalIstatDays,
  italianDateToIso,
  istatMonthWindow,
  mergeIstatDays,
  istatPendingDates
};
