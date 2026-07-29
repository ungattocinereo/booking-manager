// Vercel Serverless Function — Cleaner operations by ID
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../../backend/src/database-postgres')
  : require('../../backend/src/database');
const {
  cleanerServiceStatus,
  updateCleaner,
  deleteCleaner
} = require('../../lib/cleaners-service');

module.exports = async (req, res) => {
  try {
    if (!db.pool && !db.db) {
      await db.init();
    }

    const { id } = req.query;

    if (req.method === 'PUT') {
      return res.status(200).json(await updateCleaner(db, id, req.body));
    }

    if (req.method === 'DELETE') {
      return res.status(200).json(await deleteCleaner(db, id));
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error with cleaner operation:', error);
    res.status(cleanerServiceStatus(error)).json({ error: error.message });
  }
};
