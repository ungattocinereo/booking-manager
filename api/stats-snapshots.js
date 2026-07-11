// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!db.pool && !db.db) await db.init();

    const snapshots = await db.getStatsSnapshots({
      seasonYear: req.query?.season_year,
      limit: req.query?.limit
    });
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json(snapshots);
  } catch (error) {
    console.error('Error fetching statistics snapshots:', error);
    return res.status(500).json({ error: 'Failed to load statistics history' });
  }
};
