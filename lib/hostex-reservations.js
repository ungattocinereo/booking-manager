// Hostex identities are explicit: San Sebastiano is the existing Awesome apartment.
// Never create another property from a channel-manager display name.
const PROPERTY_MAP = new Map([
  [12843798, 'vingtage'], [12843799, 'orange'], [12843800, 'solo'],
  [12843801, 'youth'], [12843802, 'central'], [12843803, 'awesome'],
]);
const CANCELLED = new Set(['cancelled', 'canceled', 'declined', 'expired', 'denied', 'timeout']);

function reservationRow(reservation) {
  const propertyId = PROPERTY_MAP.get(Number(reservation.property_id));
  if (!propertyId) return null;
  const status = String(reservation.status || '').toLowerCase();
  const cancelled = CANCELLED.has(status) || Boolean(reservation.cancelled_at);
  // Pending requests are not confirmed stays.
  if (!cancelled && status !== 'accepted') return null;
  const start = String(reservation.check_in_date || '').slice(0, 10);
  const end = String(reservation.check_out_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end <= start) return null;
  const channel = String(reservation.channel_type || '').toLowerCase();
  return {
    code: reservation.reservation_code,
    property_id: propertyId,
    platform: ({ airbnb: 'airbnb', 'booking.com': 'booking' })[channel] || 'direct',
    channel,
    start_date: start,
    end_date: end,
    guest_name: String(reservation.guest_name || '').trim() || null,
    guest_count: Number(reservation.number_of_guests) || 0,
    cancelled,
    raw_summary: `Hostex: ${channel || 'direct'} reservation`,
  };
}
function guestChanges(existing, row) {
  return {
    // Hostex is authoritative when it provides a value; a missing name must not erase evidence.
    needsName: Boolean(row.guest_name) && String(existing.guest_name || '').trim() !== row.guest_name,
    needsCount: row.guest_count > 0 && Number(existing.guest_count) !== row.guest_count,
    needsActive: existing.active === false,
  };
}
module.exports = { PROPERTY_MAP, reservationRow, guestChanges };
