// Vercel Serverless Function — Mark cleaning task as completed
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../../../backend/src/database-postgres')
  : require('../../../backend/src/database');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!db.pool && !db.db) await db.init();

    const { id } = req.query;
    const now = new Date().toISOString();
    await db.updateTaskStatus(id, 'completed', now);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ error: error.message });
  }
};
