// Helper functions for API endpoints

// Convert Postgres TIMESTAMP to DATE string (YYYY-MM-DD)
function formatDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
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

module.exports = {
  formatDate,
  formatBooking,
  formatCleaningTask
};
