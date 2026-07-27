const { dateOnly } = require('../../../lib/booking-normalization');

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim();
}

function suggestBookings(group, bookings, propertyIds) {
  const surname = normalized(group.head.surname);
  const exactDates = bookings.filter(booking =>
    propertyIds.includes(booking.property_id) &&
    dateOnly(booking.start_date) === group.head.arrivalDate &&
    dateOnly(booking.end_date) === group.head.departureDate
  );
  return exactDates.map(booking => {
    const guest = normalized(booking.guest_name || booking.raw_summary);
    const surnameMatch = Boolean(surname && guest.includes(surname));
    return { booking, score: surnameMatch ? 100 : 60, surnameMatch };
  }).sort((a, b) => b.score - a.score || Number(a.booking.id) - Number(b.booking.id));
}

function chooseBookingSuggestion(group, bookings, propertyIds) {
  const suggestions = suggestBookings(group, bookings, propertyIds);
  if (!suggestions.length) return { selected: null, suggestions: [] };
  if (suggestions.length === 1) return { selected: suggestions[0].booking, suggestions };
  const nameMatches = suggestions.filter(item => item.surnameMatch);
  return { selected: nameMatches.length === 1 ? nameMatches[0].booking : null, suggestions };
}

module.exports = { suggestBookings, chooseBookingSuggestion };
