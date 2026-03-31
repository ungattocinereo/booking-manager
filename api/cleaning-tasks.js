// Vercel Serverless Function — Cleaning Tasks
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

module.exports = async (req, res) => {
  try {
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.method === 'GET') {
      const { cleaner_id, from_date } = req.query;
      const tasks = await db.getCleaningTasks(cleaner_id, from_date);
      return res.status(200).json(tasks);
    }

    if (req.method === 'POST') {
      const { property_id, scheduled_date, task_type, notes } = req.body;
      if (!property_id || !scheduled_date) {
        return res.status(400).json({ error: 'property_id and scheduled_date required' });
      }
      const query = USE_POSTGRES
        ? `INSERT INTO cleaning_tasks (property_id, scheduled_date, task_type, notes) VALUES ($1, $2, $3, $4) RETURNING id`
        : `INSERT INTO cleaning_tasks (property_id, scheduled_date, task_type, notes) VALUES (?, ?, ?, ?)`;
      const params = [property_id, scheduled_date, task_type || 'manual', notes || ''];
      const result = USE_POSTGRES
        ? await db.execute(query, params)
        : await db.run(query, params);
      const id = USE_POSTGRES ? result.rows[0]?.id : result.lastID;
      return res.status(201).json({ success: true, id });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error with cleaning-tasks:', error);
    res.status(500).json({ error: error.message });
  }
};
