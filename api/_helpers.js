// Helper functions for API endpoints

function formatRomeDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// Convert DATE/TIMESTAMP values to YYYY-MM-DD without UTC day shifts.
function formatDate(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return formatRomeDateParts(date);
}

function todayInRome() {
  return formatRomeDateParts(new Date());
}

// Format booking object (convert dates to YYYY-MM-DD)
function formatBooking(booking) {
  return {
    ...booking,
    start_date: formatDate(booking.start_date),
    end_date: formatDate(booking.end_date)
  };
}

// Format cleaning task object
function formatCleaningTask(task) {
  return {
    ...task,
    scheduled_date: formatDate(task.scheduled_date),
    completed_at: task.completed_at ? formatDate(task.completed_at) : null
  };
}

function formatAvailabilityMarker(booking) {
  return {
    property_id: booking.property_id,
    start_date: formatDate(booking.start_date),
    end_date: formatDate(booking.end_date)
  };
}

module.exports = {
  formatDate,
  todayInRome,
  formatBooking,
  formatCleaningTask,
  formatAvailabilityMarker
};
