const { ReportingService, operatorEmail } = require('./service');
const { IstatClient } = require('./istat-client');
const { getReportingUnit } = require('./config');
const { sha256 } = require('./crypto');
const { isDateOnly } = require('../../../lib/api-validation');

async function dashboard(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    return res.status(200).json(await new ReportingService(db).dashboard());
  } catch (error) {
    console.error('Reporting dashboard error:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
}

async function imports(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  try {
    const service = new ReportingService(db);
    if (req.method === 'GET') {
      await service.init();
      if (req.query.batch_id) {
        const batch = await service.store.getBatch(req.query.batch_id, { includePii: true });
        if (!batch) return res.status(404).json({ error: 'Пакет не найден' });
        return res.status(200).json(batch);
      }
      return res.status(200).json(await service.store.listBatches(req.query.unit_id || null, req.query.limit));
    }
    if (req.method === 'POST') {
      const result = await service.importTxt({
        unitId: req.body?.unit_id,
        filename: req.body?.filename,
        contentBase64: req.body?.content_base64,
        operator: operatorEmail(req)
      });
      return res.status(201).json(result);
    }
    if (req.method === 'PATCH') {
      const stayId = Number(req.body?.stay_id);
      const batchId = Number(req.body?.batch_id);
      if (!Number.isInteger(stayId) || !Number.isInteger(batchId)) return res.status(400).json({ error: 'stay_id and batch_id are required' });
      return res.status(200).json(await service.updateStay(stayId, { ...req.body, batch_id: batchId }));
    }
    if (req.method === 'DELETE') {
      const batchId = Number(req.query.batch_id || req.body?.batch_id);
      if (!Number.isInteger(batchId)) return res.status(400).json({ error: 'batch_id is required' });
      return res.status(200).json(await service.deleteImport(batchId));
    }
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const status = error.status || (error.code === 'DUPLICATE_IMPORT' ? 409 : 500);
    console.error('Reporting import error:', error.message);
    return res.status(status).json({ error: error.message, batch_id: error.batchId || null });
  }
}

async function alloggiati(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method === 'GET') {
    const unitId = typeof req.query.unit_id === 'string' ? req.query.unit_id.trim() : '';
    const receiptDate = req.query.date;
    if (!unitId || !isDateOnly(receiptDate)) return res.status(400).json({ error: 'Нужны unit_id и date в формате YYYY-MM-DD' });
    try {
      const service = new ReportingService(db);
      await service.init();
      const receipt = await service.store.getReceipt(unitId, receiptDate);
      if (!receipt) return res.status(404).json({ error: 'Квитанция не найдена' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="alloggiati-${unitId}-${receiptDate}.pdf"`);
      return res.status(200).send(receipt.pdf_data);
    } catch (error) {
      console.error('Alloggiati receipt error:', error.message);
      return res.status(500).json({ error: 'Не удалось получить квитанцию' });
    }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const result = await new ReportingService(db).alloggiatiAction({
      batchId: Number(req.body?.batch_id),
      action: req.body?.action,
      expectedVersion: Number(req.body?.expected_version),
      confirmed: req.body?.confirmed === true,
      operator: operatorEmail(req)
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Alloggiati action error:', error.code || error.message);
    return res.status(error.status || (error.code === 'ALLOGGIATI_TIMEOUT' ? 504 : 500)).json({ error: error.message, code: error.code || null });
  }
}

async function istat(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  try {
    const service = new ReportingService(db);
    if (req.method === 'GET') {
      if (req.query.action === 'status') {
        return res.status(200).json(await service.istatStatus(req.query.unit_id, req.query.month || null));
      }
      if (req.query.action === 'codes') {
        const unit = getReportingUnit(req.query.unit_id) || { istat: {} };
        return res.status(200).json(await new IstatClient(unit.istat).codes());
      }
      const preview = await service.istatLedger(req.query.unit_id, req.query.month);
      const payload = { giornate: preview.giornate };
      return res.status(200).json({ ...preview, payload_hash: sha256(JSON.stringify(payload)) });
    }
    if (req.method === 'POST') {
      return res.status(200).json(await service.sendIstat({
        unitId: req.body?.unit_id,
        month: req.body?.month,
        expectedHash: req.body?.expected_hash,
        confirmed: req.body?.confirmed === true,
        replace: req.body?.replace === true,
        operator: operatorEmail(req)
      }));
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('ISTAT reporting error:', error.code || error.message);
    return res.status(error.status || (error.code === 'ISTAT_TIMEOUT' ? 504 : 500)).json({ error: error.message, details: error.details || null });
  }
}

async function maintenance(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const expected = process.env.CRON_SECRET || '';
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) return res.status(404).json({ error: 'Not found' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    return res.status(200).json(await new ReportingService(db).maintenance());
  } catch (error) {
    console.error('Reporting maintenance error:', error.message);
    return res.status(500).json({ error: 'Reporting maintenance failed' });
  }
}

const handlers = { dashboard, imports, alloggiati, istat, maintenance };

function handleReportingRequest(route, req, res, db) {
  const handler = handlers[route];
  if (!handler) return res.status(404).json({ error: 'Not found' });
  return handler(req, res, db);
}

module.exports = { handleReportingRequest, handlers };
