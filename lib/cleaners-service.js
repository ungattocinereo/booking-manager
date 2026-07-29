const {
  normalizeCleanerName,
  cleanerIdFromName,
  normalizeCleanerSlug,
  normalizePropertyIds
} = require('./api-validation');
const { normalizeBookingsForDisplay } = require('./booking-normalization');
const { formatBooking, todayInRome } = require('../api/_helpers');

class CleanerServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'CleanerServiceError';
    this.statusCode = statusCode;
  }
}

function requireCleanerId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 50) throw new CleanerServiceError(400, 'Valid cleaner id required');
  return id;
}

async function listCleaners(db) {
  const cleaners = await db.getCleaners();
  return Promise.all(cleaners.map(async cleaner => ({
    ...cleaner,
    properties: await db.getCleanerProperties(cleaner.id)
  })));
}

async function createCleaner(db, payload = {}) {
  const name = normalizeCleanerName(payload.name);
  if (!name) throw new CleanerServiceError(400, 'Valid name required');

  const id = cleanerIdFromName(name);
  if (!id) throw new CleanerServiceError(400, 'Name must contain letters or numbers');

  const result = await db.createCleaner(id, name);
  const inserted = result?.rowCount ?? result?.changes ?? 0;
  if (!inserted) throw new CleanerServiceError(409, 'Cleaner already exists');

  return { success: true, id, name };
}

async function updateCleaner(db, cleanerId, payload = {}) {
  const id = requireCleanerId(cleanerId);

  if (payload.property_ids !== undefined) {
    const propertyIds = normalizePropertyIds(payload.property_ids);
    if (!propertyIds) {
      throw new CleanerServiceError(400, 'property_ids must be an array of valid IDs');
    }
    await db.replaceCleanerProperties(id, propertyIds);
    return { success: true };
  }

  const fields = {};
  if (payload.name !== undefined) {
    fields.name = normalizeCleanerName(payload.name);
    if (!fields.name) throw new CleanerServiceError(400, 'Invalid name');
  }
  if (payload.slug !== undefined) {
    fields.slug = normalizeCleanerSlug(payload.slug);
    if (fields.slug === undefined) throw new CleanerServiceError(400, 'Invalid slug');
  }

  await db.updateCleaner(id, fields);
  return { success: true };
}

async function deleteCleaner(db, cleanerId) {
  const id = requireCleanerId(cleanerId);
  await db.deleteCleanerWithRelations(id);
  return { success: true };
}

async function getMaidCalendar(db, slugValue) {
  const slug = normalizeCleanerSlug(slugValue);
  if (!slug) throw new CleanerServiceError(404, 'Not found');

  const cleaner = await db.getCleanerBySlug(slug);
  if (!cleaner) throw new CleanerServiceError(404, 'Not found');

  const properties = await db.getCleanerProperties(cleaner.id);
  const propertyIds = new Set(properties.map(property => property.id));
  const bookings = normalizeBookingsForDisplay(await db.getBookings(null, todayInRome()))
    .filter(booking => propertyIds.has(booking.property_id))
    .map(formatBooking);

  return {
    cleaner: { id: cleaner.id, name: cleaner.name, slug: cleaner.slug },
    properties,
    bookings
  };
}

function cleanerServiceStatus(error) {
  return error instanceof CleanerServiceError ? error.statusCode : 500;
}

module.exports = {
  CleanerServiceError,
  cleanerServiceStatus,
  listCleaners,
  createCleaner,
  updateCleaner,
  deleteCleaner,
  getMaidCalendar
};
