// Vercel Serverless Function — Assign cleaner to task
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../../../backend/src/database-postgres')
  : require('../../../backend/src/database');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!db.pool && !db.db) await db.init();

    const { id } = req.query;
    const { cleaner_id } = req.body;
    const query = USE_POSTGRES
      ? 'UPDATE cleaning_tasks SET cleaner_id = $1 WHERE id = $2'
      : 'UPDATE cleaning_tasks SET cleaner_id = ? WHERE id = ?';
    await (USE_POSTGRES ? db.execute(query, [cleaner_id, id]) : db.run(query, [cleaner_id, id]));
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error assigning task:', error);
    res.status(500).json({ error: error.message });
  }
};
