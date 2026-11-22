const { randomBytes } = require('node:crypto');
const { hasMobileAccess } = require('./mobile-dashboard');
const { listCleaners } = require('./cleaners-service');
const { normalizeCleanerName, cleanerIdFromName, normalizeCleanerSlug, normalizePropertyIds } = require('./api-validation');

const property = p => ({ id: String(p.id), name: p.name, color: p.color || null });
async function directory(db) {
  const [cleaners, properties] = await Promise.all([listCleaners(db), db.getProperties()]);
  return {
    public_base_url: 'https://b.amalfi.day',
    properties: properties.map(property),
    cleaners: cleaners.map(c => ({ id: c.id, name: c.name, slug: c.slug || null, properties: c.properties.map(property) })),
  };
}

async function handleMobileCleaners(req, res, db) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'x-widget-token');
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!hasMobileAccess(req)) return res.status(404).json({ error: 'Not found' });
  const body = req.body || {};
  const name = normalizeCleanerName(body.name);
  const id = req.method === 'POST' ? cleanerIdFromName(name) : body.id;
  const slug = normalizeCleanerSlug(body.slug);
  const ids = normalizePropertyIds(body.property_ids);
  if (req.method !== 'GET' && (!name || typeof id !== 'string' || !id || id.length > 50)) {
    return res.status(400).json({ error: 'Укажите имя уборщицы.' });
  }
  if (req.method === 'PUT' && (!ids || (typeof body.slug !== 'string' && body.slug !== null) || slug === undefined || (body.slug && slug !== body.slug))) {
    return res.status(400).json({ error: 'Проверьте комнаты и адрес ссылки: латинские буквы, цифры и дефис.' });
  }
  try {
    if (!db.pool && !db.db) await db.init();
    if (req.method === 'POST') {
      const result = await db.createCleaner(id, name, `cleaner-${randomBytes(8).toString('hex')}`);
      if (!(result.rowCount ?? result.changes)) return res.status(409).json({ error: 'Уборщица с таким именем уже существует.' });
      return res.status(201).json({ ...await directory(db), created_id: id });
    }
    if (req.method === 'PUT') {
      const properties = await db.getProperties();
      if (ids.some(id => !properties.some(p => p.id === id))) return res.status(400).json({ error: 'Одна из комнат больше не существует. Обновите список.' });
      if (!await db.saveMobileCleaner(id, name, slug, ids)) return res.status(404).json({ error: 'Уборщица не найдена. Обновите список.' });
    }
    return res.status(200).json(await directory(db));
  } catch (error) {
    if (error.code === '23505' || (error.code === 'SQLITE_CONSTRAINT' && /UNIQUE/.test(error.message))) return res.status(409).json({ error: 'Эта ссылка уже занята. Выберите другую.' });
    console.error('Mobile cleaners failed:', error.message);
    return res.status(500).json({ error: 'Не удалось сохранить или загрузить уборщиц. Попробуйте ещё раз.' });
  }
}
module.exports = { handleMobileCleaners };
