const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES ? require('../../backend/src/database-postgres') : require('../../backend/src/database');
const { ReportingService, operatorEmail } = require('../../backend/src/reporting/service');

module.exports = async (req, res) => {
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
      const batch = await service.updateStay(stayId, { ...req.body, batch_id: batchId });
      return res.status(200).json(batch);
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const status = error.status || (error.code === 'DUPLICATE_IMPORT' ? 409 : 500);
    console.error('Reporting import error:', error.message);
    return res.status(status).json({ error: error.message, batch_id: error.batchId || null });
  }
};
