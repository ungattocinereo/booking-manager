const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_TYPES = new Set(['checkout_cleaning', 'general_cleaning', 'deep_cleaning', 'manual']);

function normalizeCleanerName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.length <= 255 ? name : null;
}

function cleanerIdFromName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

function normalizeCleanerSlug(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return slug ? slug.slice(0, 100) : null;
}

function normalizePropertyIds(value) {
  if (!Array.isArray(value)) return null;
  const ids = value.map(id => typeof id === 'string' ? id.trim() : '').filter(Boolean);
  if (ids.some(id => id.length > 50)) return null;
  return [...new Set(ids)];
}

function isDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeTaskType(value) {
  const taskType = value == null || value === '' ? 'manual' : String(value);
  return TASK_TYPES.has(taskType) ? taskType : null;
}

module.exports = {
  normalizeCleanerName,
  cleanerIdFromName,
  normalizeCleanerSlug,
  normalizePropertyIds,
  isDateOnly,
  normalizeTaskType
};
