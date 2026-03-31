// Vercel Serverless Function — Cleaning task operations by ID
// Handles: POST /api/cleaning-tasks/:id?action=complete|assign
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../../backend/src/database-postgres')
  : require('../../backend/src/database');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!db.pool && !db.db) await db.init();

    const { id, action } = req.query;

    if (action === 'complete') {
      const now = new Date().toISOString();
      await db.updateTaskStatus(id, 'completed', now);
      return res.status(200).json({ success: true });
    }

    if (action === 'assign') {
      const { cleaner_id } = req.body;
      const query = USE_POSTGRES
        ? 'UPDATE cleaning_tasks SET cleaner_id = $1 WHERE id = $2'
        : 'UPDATE cleaning_tasks SET cleaner_id = ? WHERE id = ?';
      await (USE_POSTGRES ? db.execute(query, [cleaner_id, id]) : db.run(query, [cleaner_id, id]));
      return res.status(200).json({ success: true });
    }

    res.status(400).json({ error: 'action query param required (complete or assign)' });
  } catch (error) {
    console.error('Error with cleaning task:', error);
    res.status(500).json({ error: error.message });
  }
};
