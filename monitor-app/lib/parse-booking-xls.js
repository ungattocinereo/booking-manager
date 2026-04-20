const { BOOKING_ROOM_MAP } = require('./properties');

function parseBookingXls(filePath) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (err) {
    return [];
  }
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const parsed = [];
  for (const row of rows) {
    const roomType = row['Unit type'] || '';
    const propertyId = BOOKING_ROOM_MAP[roomType];
    if (!propertyId) continue;

    const startDate = row['Check-in'] || '';
    const endDate = row['Check-out'] || '';
    if (!startDate || !endDate) continue;

    const statusRaw = (row['Status'] || '').toString().toLowerCase();
    const status = statusRaw.includes('cancel') ? 'cancelled' : 'active';

    parsed.push({
      propertyId,
      platform: 'booking',
      startDate,
      endDate,
      guestName: row['Guest Name(s)'] || null,
      confirmationCode: row['Book Number'] ? String(row['Book Number']) : null,
      bookedAt: null,
      status,
      bookingKey: `${propertyId}|booking|${startDate}|${endDate}`
    });
  }
  return parsed;
}

module.exports = { parseBookingXls };
