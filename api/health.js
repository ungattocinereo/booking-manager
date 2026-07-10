const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');
const { checkApplicationHealth } = require('../lib/health-check');

module.exports = async (req, res) => {
  const result = await checkApplicationHealth(db);
  res.setHeader('Cache-Control', 'no-store');
  res.status(result.httpStatus).json(result.body);
};
