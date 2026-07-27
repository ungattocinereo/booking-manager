const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES ? require('../../backend/src/database-postgres') : require('../../backend/src/database');
const { ReportingService } = require('../../backend/src/reporting/service');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  const expected = process.env.CRON_SECRET || '';
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) return res.status(404).json({ error: 'Not found' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const result = await new ReportingService(db).maintenance();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Reporting maintenance error:', error.message);
    return res.status(500).json({ error: 'Reporting maintenance failed' });
  }
};
