const path = require('node:path');

const country = originCode => ({ origin_kind: 'country', origin_code: originCode });

// One-time non-PII bridge between the legacy ISTAT ledger and daily TXT imports.
// Royal occupies two rooms; Harmony occupies one, matching the confirmed Sinfonia days.
const HARMONY_BASELINE_STAYS = [
  { sourceKey:'harmony-start-2026-07-14-royal', propertyId:'royal', arrivalDate:'2026-07-14', departureDate:'2026-07-17', roomsOccupied:1, origins:[country('219')] },
  { sourceKey:'harmony-start-2026-07-17-royal', propertyId:'royal', arrivalDate:'2026-07-17', departureDate:'2026-07-20', roomsOccupied:1, origins:[country('216')] },
  { sourceKey:'harmony-start-2026-07-18-harmony', propertyId:'harmony', arrivalDate:'2026-07-18', departureDate:'2026-07-22', roomsOccupied:1, origins:[country('701'), country('701')] },
  { sourceKey:'harmony-start-2026-07-20-royal', propertyId:'royal', arrivalDate:'2026-07-20', departureDate:'2026-07-24', roomsOccupied:2, origins:[country('212'), country('536')] },
  { sourceKey:'harmony-start-2026-07-22-harmony', propertyId:'harmony', arrivalDate:'2026-07-22', departureDate:'2026-07-25', roomsOccupied:1, origins:[country('536'), country('536')] },
  { sourceKey:'harmony-start-2026-07-24-royal', propertyId:'royal', arrivalDate:'2026-07-24', departureDate:'2026-07-27', roomsOccupied:2, origins:[country('509'), country('509')] },
  { sourceKey:'harmony-start-2026-07-25-harmony', propertyId:'harmony', arrivalDate:'2026-07-25', departureDate:'2026-07-29', roomsOccupied:1, origins:[country('701'), country('719')] }
].map(stay => ({ ...stay, unitId:'harmony' }));

async function main() {
  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log(JSON.stringify({ dry_run:true, unit_id:'harmony', stays:HARMONY_BASELINE_STAYS.length, guests:HARMONY_BASELINE_STAYS.reduce((sum, stay) => sum + stay.origins.length, 0), arrival_from:'2026-07-14', departure_to:'2026-07-29' }, null, 2));
    return;
  }

  require('dotenv').config({ path: process.env.ENV_FILE || path.join(__dirname, '../.env.local') });
  const usePostgres = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const db = usePostgres ? require('../backend/src/database-postgres') : require('../backend/src/database');
  const { ReportingService } = require('../backend/src/reporting/service');
  const service = new ReportingService(db);
  try {
    await service.init();
    const result = await service.store.upsertIstatBaselineStays(HARMONY_BASELINE_STAYS);
    const existingStay = await service.store.one(
      `SELECT gs.id FROM guest_stays gs JOIN guest_import_batches b ON b.id=gs.batch_id
       WHERE b.reporting_unit_id=$1 AND gs.property_id=$2 AND gs.arrival_date=$3::date AND gs.departure_date=$4::date`,
      `SELECT gs.id FROM guest_stays gs JOIN guest_import_batches b ON b.id=gs.batch_id
       WHERE b.reporting_unit_id=? AND gs.property_id=? AND gs.arrival_date=date(?) AND gs.departure_date=date(?)`,
      ['harmony', 'royal', '2026-07-27', '2026-07-30']
    );
    if (existingStay) {
      await service.store.execute(
        'UPDATE guest_stays SET rooms_occupied=$1 WHERE id=$2',
        'UPDATE guest_stays SET rooms_occupied=? WHERE id=?',
        [2, existingStay.id]
      );
      await service.store.execute(
        `UPDATE guest_records SET origin_kind=$1,origin_code=$2,origin_label=$3
         WHERE stay_id=$4 AND line_number=1`,
        `UPDATE guest_records SET origin_kind=?,origin_code=?,origin_label=?
         WHERE stay_id=? AND line_number=1`,
        ['province', '058', 'Roma', existingStay.id]
      );
    }
    console.log(JSON.stringify({ applied:true, unit_id:'harmony', corrected_existing_july_27:Boolean(existingStay), ...result }, null, 2));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Harmony ISTAT baseline failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { HARMONY_BASELINE_STAYS };
