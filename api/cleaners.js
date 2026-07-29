// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');
const {
  cleanerServiceStatus,
  listCleaners,
  createCleaner,
  updateCleaner
} = require('../lib/cleaners-service');

module.exports = async (req, res) => {
  try {
    // Initialize database connection
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.method === 'GET') {
      return res.status(200).json(await listCleaners(db));
    }

    if (req.method === 'POST') {
      return res.status(201).json(await createCleaner(db, req.body));
    }

    if (req.method === 'PUT') {
      return res.status(200).json(await updateCleaner(db, req.body?.id, req.body));
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error with cleaners:', error);
    res.status(cleanerServiceStatus(error)).json({ error: error.message });
  }
};
