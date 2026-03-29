// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');

module.exports = async (req, res) => {
  try {
    // Initialize database connection
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.method === 'GET') {
      const cleaners = await db.getCleaners();
      for (const cleaner of cleaners) {
        cleaner.properties = await db.getCleanerProperties(cleaner.id);
      }
      return res.status(200).json(cleaners);
    }

    if (req.method === 'POST') {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name required' });
      const id = name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '_').replace(/_+/g, '_');
      await db.createCleaner(id, name);
      return res.status(201).json({ success: true, id, name });
    }

    if (req.method === 'PUT') {
      const { id, name, slug } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const fields = {};
      if (name !== undefined) fields.name = name;
      if (slug !== undefined) fields.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-') || null;
      await db.updateCleaner(id, fields);
      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error with cleaners:', error);
    res.status(500).json({ error: error.message });
  }
};
