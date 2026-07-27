const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES ? require('../backend/src/database-postgres') : require('../backend/src/database');
const { ReportingService } = require('../backend/src/reporting/service');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const service = new ReportingService(db);
    return res.status(200).json(await service.dashboard());
  } catch (error) {
    console.error('Reporting dashboard error:', error.message);
    return res.status(error.status || 500).json({ error: error.message });
  }
};
