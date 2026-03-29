// Vercel Serverless Function — Cleaner operations by ID
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../../backend/src/database-postgres')
  : require('../../backend/src/database');

module.exports = async (req, res) => {
  try {
    if (!db.pool && !db.db) {
      await db.init();
    }

    const { id } = req.query;

    if (req.method === 'PUT') {
      const { name, slug, property_ids } = req.body;

      // Update property assignments
      if (property_ids !== undefined) {
        const delQuery = USE_POSTGRES
          ? `DELETE FROM cleaner_properties WHERE cleaner_id = $1`
          : `DELETE FROM cleaner_properties WHERE cleaner_id = ?`;
        await (USE_POSTGRES ? db.execute(delQuery, [id]) : db.run(delQuery, [id]));
        for (const pid of property_ids) {
          await db.assignCleanerToProperty(id, pid);
        }
        return res.status(200).json({ success: true });
      }

      // Update name/slug
      const fields = {};
      if (name !== undefined) fields.name = name;
      if (slug !== undefined) fields.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-') || null;
      await db.updateCleaner(id, fields);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const delProps = USE_POSTGRES
        ? `DELETE FROM cleaner_properties WHERE cleaner_id = $1`
        : `DELETE FROM cleaner_properties WHERE cleaner_id = ?`;
      const nullifyTasks = USE_POSTGRES
        ? `UPDATE cleaning_tasks SET cleaner_id = NULL WHERE cleaner_id = $1`
        : `UPDATE cleaning_tasks SET cleaner_id = NULL WHERE cleaner_id = ?`;
      const delCleaner = USE_POSTGRES
        ? `DELETE FROM cleaners WHERE id = $1`
        : `DELETE FROM cleaners WHERE id = ?`;

      await (USE_POSTGRES ? db.execute(delProps, [id]) : db.run(delProps, [id]));
      await (USE_POSTGRES ? db.execute(nullifyTasks, [id]) : db.run(nullifyTasks, [id]));
      await (USE_POSTGRES ? db.execute(delCleaner, [id]) : db.run(delCleaner, [id]));

      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error with cleaner operation:', error);
    res.status(500).json({ error: error.message });
  }
};
