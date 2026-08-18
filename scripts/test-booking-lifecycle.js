const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'booking-lifecycle-'));
const exportsDir = path.join(tempDir, 'exports');
fs.mkdirSync(exportsDir);

process.env.SQLITE_DB_PATH = path.join(tempDir, 'bookings.db');
process.env.BOOKING_EXPORTS_DIR = exportsDir;

const db = require('../backend/src/database');
const { enrichFromExports } = require('../backend/src/enrich-from-exports');
const { buildTodayWidgetPayload } = require('../lib/widget-today');

async function getBooking(propertyId, startDate, endDate) {
  return db.get(
    `SELECT * FROM bookings
     WHERE property_id = ? AND platform = 'booking' AND start_date = ? AND end_date = ?`,
    [propertyId, startDate, endDate]
  );
}

function writeBookingXls(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  XLSX.writeFile(workbook, path.join(exportsDir, 'booking.xls'));
}

function writeAirbnbCsv() {
  fs.writeFileSync(
    path.join(exportsDir, 'airbnb.csv'),
    [
      '"Confirmation code","Status","Guest name","Contact","# of adults","# of children","# of infants","Start date","End date","# of nights","Booked","Listing","Earnings"',
      '"TEST123","Confirmed","Terrace Guest","+39 333 000 0000","2","0","0","12/20/2026","12/23/2026","3","2026-07-13","The Sunrise Terrace - Amalfi Coast View","€300.00"',
    ].join('\n')
  );
}

async function main() {
  await db.init();
  await db.createProperty('solo', 'Solo Traveller room');
  await db.createProperty('carmela', 'Carmela');

  await db.upsertBooking('solo', 'booking', '2026-07-05', '2026-07-08', 'Bauerly, Addison', {
    guestName: 'Bauerly, Addison',
    guestCountry: 'US',
    bookingType: 'reservation',
  });
  await db.upsertBooking('carmela', 'airbnb', '2026-12-20', '2026-12-23', 'Reserved', {
    bookingType: 'reservation',
  });
  await db.upsertBooking('solo', 'booking', '2026-07-05', '2026-07-08', 'CLOSED - Not available', {
    bookingType: 'blocked',
  });

  const protectedReservation = await getBooking('solo', '2026-07-05', '2026-07-08');
  assert.strictEqual(protectedReservation.booking_type, 'reservation');
  assert.strictEqual(protectedReservation.guest_name, 'Bauerly, Addison');
  assert.strictEqual(Number(protectedReservation.active), 1);

  await db.upsertBooking('solo', 'booking', '2026-07-19', '2026-07-22', 'CLOSED - Not available', {
    bookingType: 'blocked',
  });
  await db.run(
    `UPDATE bookings SET active = 0, missing_since = CURRENT_TIMESTAMP
     WHERE property_id = 'solo' AND platform = 'booking'
       AND start_date = '2026-07-19' AND end_date = '2026-07-22'`
  );
  await db.run(
    `INSERT INTO bookings (
       property_id, platform, start_date, end_date, raw_summary,
       booking_type, active, missing_since, created_at
     ) VALUES ('solo', 'booking', '2026-07-20', '2026-07-22', 'CLOSED - Not available', 'blocked', 1, NULL, CURRENT_TIMESTAMP)`
  );

  const reconciledMarker = await db.upsertBooking(
    'solo',
    'booking',
    '2026-07-20',
    '2026-07-22',
    'CLOSED - Not available',
    { bookingType: 'blocked' }
  );
  const originalMarker = await getBooking('solo', '2026-07-19', '2026-07-22');
  const shiftedMarker = await getBooking('solo', '2026-07-20', '2026-07-22');
  const july20Widget = await buildTodayWidgetPayload(db, '2026-07-20');
  assert.strictEqual(reconciledMarker.canonicalStartDate, '2026-07-19');
  assert.strictEqual(Number(originalMarker.active), 1);
  assert.strictEqual(Number(shiftedMarker.active), 0);
  assert.ok(july20Widget.occupied.some(item => item.property_id === 'solo' && item.start === '2026-07-19'));
  assert.ok(!july20Widget.check_ins.some(item => item.property_id === 'solo'));

  await db.upsertBooking('solo', 'booking', '2026-08-17', '2026-08-19', 'Central Guest', {
    guestName: 'Central Guest',
    guestCountry: 'IT',
    bookingType: 'reservation',
  });
  await db.run(
    `INSERT INTO bookings (
       property_id, platform, start_date, end_date, raw_summary,
       booking_type, active, missing_since, created_at
     ) VALUES ('solo', 'booking', '2026-08-18', '2026-08-19', 'CLOSED - Not available', 'blocked', 1, NULL, CURRENT_TIMESTAMP)`
  );

  const reconciledGuestMarker = await db.upsertBooking(
    'solo',
    'booking',
    '2026-08-18',
    '2026-08-19',
    'CLOSED - Not available',
    { bookingType: 'blocked' }
  );
  const originalGuestReservation = await getBooking('solo', '2026-08-17', '2026-08-19');
  const trimmedGuestMarker = await getBooking('solo', '2026-08-18', '2026-08-19');
  const august18Widget = await buildTodayWidgetPayload(db, '2026-08-18');
  assert.strictEqual(reconciledGuestMarker.canonicalStartDate, '2026-08-17');
  assert.strictEqual(originalGuestReservation.booking_type, 'reservation');
  assert.strictEqual(originalGuestReservation.guest_name, 'Central Guest');
  assert.strictEqual(Number(originalGuestReservation.active), 1);
  assert.strictEqual(Number(trimmedGuestMarker.active), 0);
  assert.ok(august18Widget.occupied.some(item => item.property_id === 'solo' && item.start === '2026-08-17'));
  assert.ok(!august18Widget.check_ins.some(item => item.property_id === 'solo'));

  await db.run(
    `INSERT INTO bookings (
       property_id, platform, start_date, end_date, raw_summary,
       guest_name, guest_count, booking_type, active, missing_since, created_at
     ) VALUES (?, 'booking', ?, ?, ?, ?, ?, 'blocked', 1, NULL, CURRENT_TIMESTAMP)`,
    ['solo', '2026-08-01', '2026-08-03', 'CLOSED - Not available', 'Legacy Guest', 1]
  );
  await db.run(
    `INSERT INTO bookings (
       property_id, platform, start_date, end_date, raw_summary,
       booking_type, active, missing_since, created_at
     ) VALUES (?, 'booking', ?, ?, 'CLOSED - Not available', 'blocked', 1, NULL, CURRENT_TIMESTAMP)`,
    ['solo', '2026-08-04', '2026-08-06']
  );
  await db.run(
    `INSERT INTO bookings (
       property_id, platform, start_date, end_date, raw_summary,
       guest_name, guest_count, booking_type, active, missing_since, created_at
     ) VALUES (?, 'booking', ?, ?, ?, ?, ?, 'reservation', 1, NULL, CURRENT_TIMESTAMP)`,
    ['solo', '2026-08-05', '2026-08-08', 'Partially Covered Guest', 'Partially Covered Guest', 1]
  );
  await db.archiveStaleBookings(
    'solo',
    'booking',
    [{ startDate: '2026-08-01', endDate: '2026-08-06' }],
    '2026-07-01'
  );

  const legacyGuest = await getBooking('solo', '2026-08-01', '2026-08-03');
  let technicalMarker = await getBooking('solo', '2026-08-04', '2026-08-06');
  let partiallyCoveredGuest = await getBooking('solo', '2026-08-05', '2026-08-08');
  assert.strictEqual(Number(legacyGuest.active), 1);
  assert.strictEqual(Number(technicalMarker.active), 1);
  assert.strictEqual(Number(partiallyCoveredGuest.active), 1);
  assert.ok(technicalMarker.missing_since);
  assert.ok(partiallyCoveredGuest.missing_since);

  await db.run(
    `UPDATE bookings SET missing_since = datetime('now', '-7 hours')
     WHERE property_id = 'solo' AND start_date IN ('2026-08-04', '2026-08-05')`
  );
  await db.archiveStaleBookings(
    'solo',
    'booking',
    [{ startDate: '2026-08-01', endDate: '2026-08-06' }],
    '2026-07-01'
  );
  technicalMarker = await getBooking('solo', '2026-08-04', '2026-08-06');
  partiallyCoveredGuest = await getBooking('solo', '2026-08-05', '2026-08-08');
  assert.strictEqual(Number(technicalMarker.active), 0);
  assert.strictEqual(Number(partiallyCoveredGuest.active), 0);

  await db.run(
    `INSERT INTO bookings (
       property_id, platform, start_date, end_date, raw_summary,
       guest_name, guest_country, guest_count, booking_type, active, missing_since, created_at
     ) VALUES (?, 'booking', ?, ?, ?, ?, ?, ?, 'blocked', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    ['solo', '2026-12-01', '2026-12-03', 'CLOSED - Not available', 'Hidden Guest', 'US', 1]
  );
  await db.upsertBooking('solo', 'booking', '2026-12-01', '2026-12-05', 'CLOSED - Not available', {
    bookingType: 'blocked',
  });

  writeBookingXls([
    {
      Status: 'ok',
      'Unit type': 'Solo Traveller room',
      'Check-in': '2026-12-01',
      'Check-out': '2026-12-03',
      'Guest Name(s)': 'Visible Guest',
      'Booker country': 'us',
      Adults: 1,
      Children: 0,
    },
    {
      Status: 'ok',
      'Unit type': 'Solo Traveller room',
      'Check-in': '2026-12-10',
      'Check-out': '2026-12-12',
      'Guest Name(s)': 'Stale Export Guest',
      'Booker country': 'us',
      Adults: 1,
      Children: 0,
    },
  ]);
  writeAirbnbCsv();

  const enrichResult = await enrichFromExports(db, false);
  assert.strictEqual(enrichResult.updated, 2);

  const repairedBooking = await getBooking('solo', '2026-12-01', '2026-12-03');
  const staleExportBooking = await getBooking('solo', '2026-12-10', '2026-12-12');
  assert.strictEqual(repairedBooking.booking_type, 'reservation');
  assert.strictEqual(Number(repairedBooking.active), 1);
  assert.strictEqual(repairedBooking.guest_name, 'Visible Guest');
  assert.strictEqual(repairedBooking.guest_country, 'US');
  assert.strictEqual(staleExportBooking, undefined);

  const carmelaBooking = await db.get(
    `SELECT * FROM bookings
     WHERE property_id = 'carmela' AND platform = 'airbnb'
       AND start_date = '2026-12-20' AND end_date = '2026-12-23'`
  );
  assert.strictEqual(carmelaBooking.guest_name, 'Terrace Guest');
  assert.strictEqual(carmelaBooking.guest_country, 'IT');
  assert.strictEqual(Number(carmelaBooking.guest_count), 2);

  console.log('Booking lifecycle tests passed');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
