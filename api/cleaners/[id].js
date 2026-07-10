// Vercel Serverless Function — Cleaner operations by ID
const USE_POSTGRES = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const db = USE_POSTGRES
  ? require('../../backend/src/database-postgres')
  : require('../../backend/src/database');
const { normalizeCleanerName, normalizeCleanerSlug, normalizePropertyIds } = require('../../lib/api-validation');

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
        const normalizedIds = normalizePropertyIds(property_ids);
        if (!normalizedIds) return res.status(400).json({ error: 'property_ids must be an array of valid IDs' });
        await db.replaceCleanerProperties(id, normalizedIds);
        return res.status(200).json({ success: true });
      }

      // Update name/slug
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

    if (req.method === 'DELETE') {
      await db.deleteCleanerWithRelations(id);

      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error with cleaner operation:', error);
    res.status(500).json({ error: error.message });
  }
};
