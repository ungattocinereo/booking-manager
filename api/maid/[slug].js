// Vercel Serverless Function — Maid calendar data
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../../backend/src/database-postgres')
  : require('../../backend/src/database');
const { cleanerServiceStatus, getMaidCalendar } = require('../../lib/cleaners-service');

module.exports = async (req, res) => {
  try {
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slug } = req.query;
    res.status(200).json(await getMaidCalendar(db, slug));
  } catch (error) {
    console.error('Error with maid calendar:', error);
    res.status(cleanerServiceStatus(error)).json({ error: error.message });
  }
};
