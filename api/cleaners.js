// Vercel Serverless Function
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES 
  ? require('../backend/src/database-postgres')
  : require('../backend/src/database');
const { normalizeCleanerName, cleanerIdFromName, normalizeCleanerSlug } = require('../lib/api-validation');

module.exports = async (req, res) => {
  try {
    // Initialize database connection
    if (!db.pool && !db.db) {
      await db.init();
    }

    if (req.method === 'GET') {
      const cleaners = await db.getCleaners();
      await Promise.all(cleaners.map(async cleaner => {
        cleaner.properties = await db.getCleanerProperties(cleaner.id);
      }));
      return res.status(200).json(cleaners);
    }

    if (req.method === 'POST') {
      const name = normalizeCleanerName(req.body?.name);
      if (!name) return res.status(400).json({ error: 'Valid name required' });
      const id = cleanerIdFromName(name);
      if (!id) return res.status(400).json({ error: 'Name must contain letters or numbers' });
      const result = await db.createCleaner(id, name);
      const inserted = USE_POSTGRES ? result.rowCount : result.changes;
      if (!inserted) return res.status(409).json({ error: 'Cleaner already exists' });
      return res.status(201).json({ success: true, id, name });
    }

    if (req.method === 'PUT') {
      const { id, name, slug } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const fields = {};
      if (name !== undefined) {
        fields.name = normalizeCleanerName(name);
        if (!fields.name) return res.status(400).json({ error: 'Invalid name' });
      }
      if (slug !== undefined) {
        fields.slug = normalizeCleanerSlug(slug);
        if (fields.slug === undefined) return res.status(400).json({ error: 'Invalid slug' });
      }
      await db.updateCleaner(id, fields);
      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error with cleaners:', error);
    res.status(500).json({ error: error.message });
  }
};
