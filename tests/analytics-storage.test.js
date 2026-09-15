const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'booking-analytics-'));
process.env.SQLITE_DB_PATH=path.join(dir,'test.db');
const db=require('../backend/src/database');
const {recordAnalytics,getAnalytics}=require('../backend/src/booking-analytics');
const {readAnalytics}=require('../backend/src/analytics-store');
const start='2026-09-01T10:00:00Z';
const feeds=[{property_id:'a',platform:'airbnb',events:[{uid:'1',startDate:'2026-10-01',endDate:'2026-10-05'}]}];
test('durable analytics baselines, events, failure coverage and daily snapshots',async()=>{
 try{
  await db.init();await db.createProperty('a','A');
  await db.upsertBooking('a','airbnb','2026-10-01','2026-10-05','Reserved',{bookingType:'reservation'});
  await recordAnalytics(db,{feeds,capturedAt:start});
  let history=await readAnalytics(db);
  assert.equal(history.events.length,0);assert.equal(history.snapshots.length,1);
  // A repeated successful observation does not inflate either table.
  await recordAnalytics(db,{feeds,capturedAt:'2026-09-01T11:00:00Z'});
  assert.equal((await readAnalytics(db)).snapshots.length,1);
  await db.upsertBooking('a','airbnb','2027-01-01','2027-01-05','Reserved',{bookingType:'reservation'});
  const updated=[{...feeds[0],events:[...feeds[0].events,{uid:'2',startDate:'2027-01-01',endDate:'2027-01-05'}]}];
  await Promise.all([recordAnalytics(db,{feeds:updated,capturedAt:'2026-09-02T10:00:00Z'}),recordAnalytics(db,{feeds:updated,capturedAt:'2026-09-02T10:00:00Z'})]);
  history=await readAnalytics(db);assert.equal(history.events.length,1);assert.equal(history.events[0].kind,'created');
  const api=await getAnalytics(db,{year:'2026'},'2026-09-02T11:00:00Z');
  assert.equal(api.overview.bookings,1);assert.equal(api.movement.totals.created,1);assert.equal(api.snapshots.length,2);
  await recordAnalytics(db,{feeds:[],failures:[{property_id:'a',platform:'airbnb'}],capturedAt:'2026-09-02T12:00:00Z'});
  history=await readAnalytics(db);assert.equal(history.snapshots.at(-1).captured_at,'2026-09-02T10:00:00Z');assert.equal(history.events.length,1);
  assert.equal((await getAnalytics(db,{year:'2026'},'2026-09-02T12:00:00Z')).movement.buckets[8].coverage,'partial');
  await assert.rejects(getAnalytics(db,{property:'not-a-property'}),e=>e.statusCode===400);
  const cancelled=[{...updated[0],events:[{...updated[0].events[0],status:'CANCELLED'},updated[0].events[1]]}];
  await recordAnalytics(db,{feeds:cancelled,capturedAt:'2026-09-03T10:00:00Z'});
  assert.equal((await getAnalytics(db,{year:'2026'})).overview.bookings,0);
  const replacement=[{...updated[0],events:[{...updated[0].events[0],uid:'replacement'},updated[0].events[1]]}];
  await recordAnalytics(db,{feeds:replacement,capturedAt:'2026-09-03T11:00:00Z'});
  assert.equal((await getAnalytics(db,{year:'2026'})).overview.bookings,1,'a new reservation on previously cancelled dates must remain visible');

 }finally{await db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
