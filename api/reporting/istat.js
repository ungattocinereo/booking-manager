const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES ? require('../../backend/src/database-postgres') : require('../../backend/src/database');
const { ReportingService, operatorEmail } = require('../../backend/src/reporting/service');
const { IstatClient } = require('../../backend/src/reporting/istat-client');
const { getReportingUnit } = require('../../backend/src/reporting/config');
const { sha256 } = require('../../backend/src/reporting/crypto');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  try {
    const service = new ReportingService(db);
    if (req.method === 'GET') {
      if (req.query.action === 'codes') {
        const unit = getReportingUnit(req.query.unit_id) || { istat: {} };
        const client = new IstatClient(unit.istat);
        return res.status(200).json(await client.codes());
      }
      const preview = await service.istatPreview(req.query.unit_id, req.query.month);
      const payload = { giornate: preview.giornate };
      return res.status(200).json({ ...preview, payload_hash: sha256(JSON.stringify(payload)) });
    }
    if (req.method === 'POST') {
      const result = await service.sendIstat({
        unitId: req.body?.unit_id,
        month: req.body?.month,
        expectedHash: req.body?.expected_hash,
        confirmed: req.body?.confirmed === true,
        replace: req.body?.replace === true,
        operator: operatorEmail(req)
      });
      return res.status(200).json(result);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('ISTAT reporting error:', error.code || error.message);
    return res.status(error.status || (error.code === 'ISTAT_TIMEOUT' ? 504 : 500)).json({ error: error.message, details: error.details || null });
  }
};
