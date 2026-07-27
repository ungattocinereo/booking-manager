const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES ? require('../../backend/src/database-postgres') : require('../../backend/src/database');
const { ReportingService, operatorEmail } = require('../../backend/src/reporting/service');
const { isDateOnly } = require('../../lib/api-validation');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method === 'GET') {
    const unitId = typeof req.query.unit_id === 'string' ? req.query.unit_id.trim() : '';
    const receiptDate = req.query.date;
    if (!unitId || !isDateOnly(receiptDate)) {
      return res.status(400).json({ error: 'Нужны unit_id и date в формате YYYY-MM-DD' });
    }
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
    const service = new ReportingService(db);
    const result = await service.alloggiatiAction({
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
};
