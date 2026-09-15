const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregate, movement, sourceObservation, optionsFromQuery } = require('../backend/src/booking-analytics');
const properties = [{ id:'a',name:'A' }];
const booking = (extra={}) => ({id:1, property_id:'a',platform:'airbnb',start_date:'2026-10-01',end_date:'2026-10-05',guest_count:2,booking_type:'reservation',active:true,...extra});
const feed = (events=[]) => ({property_id:'a',platform:'airbnb',events});
const event = (extra={}) => ({uid:'id-1',startDate:'2026-10-01',endDate:'2026-10-05',...extra});
const first = '2026-09-01T10:00:00Z', next = '2026-09-02T10:00:00Z';
const observe = (rows, events, prior, at=next) => sourceObservation(rows,feed(events),prior,at);

test('initial observation is a baseline; repeated sync is idempotent',()=>{
 const baseline=observe([booking()],[event()],null,first);
 assert.equal(baseline.events.length,0);
 assert.equal(observe([booking()],[event()],baseline.state).events.length,0);
 const newer=observe([booking(),booking({id:2,start_date:'2026-11-01',end_date:'2026-11-04'})],[event(),event({uid:'id-2',startDate:'2026-11-01',endDate:'2026-11-04'})],baseline.state);
 assert.deepEqual(newer.events.map(e=>e.kind),['created']);
 assert.equal(observe([booking(),booking({id:2,start_date:'2026-11-01',end_date:'2026-11-04'})],[event(),event({uid:'id-2',startDate:'2026-11-01',endDate:'2026-11-04'})],newer.state).events.length,0);
});
test('a stable UID date change is one change even while the old database row remains active',()=>{
 const base=observe([booking()],[event()],null,first);
 const result=observe([booking(),booking({id:2,start_date:'2026-10-02'})],[event({startDate:'2026-10-02'})],base.state);
 assert.deepEqual(result.events.map(e=>e.kind),['changed']);
 assert.equal(Object.values(result.state.bookings).filter(b=>b.status==='active').length,1);
});
test('archived future reservation is removed, then restored; completed stays are retained',()=>{
 const base=observe([booking()],[event()],null,first);
 const gone=observe([],[],base.state);
 assert.deepEqual(gone.events.map(e=>e.kind),['removed']);
 assert.deepEqual(observe([booking()],[event()],gone.state).events.map(e=>e.kind),['restored']);
 assert.equal(observe([],[],base.state,'2026-11-01T10:00:00Z').events.length,0);
});
test('explicit cancellation and later confirmation do not subtract the booking twice',()=>{
 const base=observe([booking()],[event()],null,first);
 assert.deepEqual(observe([booking()],[event({status:'CANCELLED'})],base.state).events.map(e=>e.kind),['cancelled']);
 const removed=observe([],[],base.state);
 const confirmed=observe([], [{uid:'id-1',status:'CANCELLED'}],removed.state);
 assert.deepEqual(confirmed.events.map(e=>e.kind),['cancellation_confirmed']);
 const m=movement([...removed.events,...confirmed.events],[confirmed.state],optionsFromQuery({year:2026},next));
 assert.equal(m.totals.net,-1);
});
test('markers are excluded; metadata, row ids and names do not create bookings',()=>{
 const base=observe([booking(),booking({id:2,start_date:'2026-11-01',end_date:'2026-11-05',booking_type:'blocked',guest_count:null})],[event()],null,first);
 assert.equal(Object.keys(base.state.bookings).length,1);
 assert.equal(observe([booking({guest_name:'private',guest_count:4})],[event()],base.state).events.length,0);
 assert.doesNotMatch(JSON.stringify(base.state),/guest_name|reservation_url|phone/);
});
test('year boundaries, leap years and overlapping nights use explicit inventory',()=>{
 const o=aggregate([booking({start_date:'2025-12-30',end_date:'2026-01-03'}),booking({id:2,start_date:'2026-01-02',end_date:'2026-01-04'})],[],properties,optionsFromQuery({year:2026}));
 assert.equal(o.bookings,2);assert.equal(o.arrivals,1);assert.equal(o.nights,3);assert.equal(o.months.length,12);assert.equal(o.sellable,365);
 assert.equal(aggregate([],[],properties,optionsFromQuery({year:2024})).sellable,366);
 assert.equal(aggregate([],[],[],optionsFromQuery({year:2026})).occupancy,null);
});
test('closed nights exclude inventory, but a real reservation wins overlapping blocks',()=>{
 const o=aggregate([booking()], [booking({start_date:'2026-10-01',end_date:'2026-10-07'})], properties,optionsFromQuery({year:2026}));
 assert.equal(o.nights,4);assert.equal(o.sellable,363);
 assert.equal(o.months[9].sellable,29);
});
test('unknown guest counts remain null; countries and weekdays use arrivals',()=>{
 const o=aggregate([booking({guest_count:null,guest_country:null})],[],properties,optionsFromQuery({year:2026}));
 assert.equal(o.guests,null);assert.equal(o.countries.unknown,1);assert.equal(o.weekdays[3],1);
});
test('movement counts event year independently from arrival year and exposes missing history',()=>{
 const base=observe([booking()],[event()],null,first);
 const e={kind:'created',occurred_at:next,property_id:'a',platform:'airbnb',after:booking({start_date:'2027-01-01'})};
 const m=movement([e],[base.state],optionsFromQuery({year:2026},next));
 assert.equal(m.totals.created,1);assert.equal(m.buckets[0].coverage,'none');assert.equal(m.buckets[8].coverage,'partial');
 assert.equal(movement([e],[],optionsFromQuery({year:2026},next)).coverage_start,null);
});
test('invalid filters are rejected before database access',()=>{
 for(const q of [{year:'oops'},{year:Infinity},{year:2026,group:'quarter'},{period:'all'},{platform:'bad'}])assert.throws(()=>optionsFromQuery(q));
});
test('a cancelled row still in database grace does not revive without a live source event',()=>{
 const base=observe([booking()],[event()],null,first);
 const cancelled=observe([booking()],[event({status:'CANCELLED'})],base.state);
 const absent=observe([booking()],[],cancelled.state);
 assert.equal(absent.events.length,0);assert.equal(Object.values(absent.state.bookings)[0].status,'cancelled');
 assert.deepEqual(observe([booking()],[event()],absent.state).events.map(e=>e.kind),['restored']);
});
test('a different source reservation on the same dates is not merged into the old identity',()=>{
 const base=observe([booking()],[event()],null,first);
 const replacement=observe([booking()],[event({uid:'replacement'})],base.state);
 assert.deepEqual(replacement.events.map(e=>e.kind).sort(),['created','removed']);
});
test('month comparison uses equal complete days and disables comparisons across gaps',()=>{
 const {compareMonths}=require('../backend/src/booking-analytics');
 const sources=[{property_id:'a',platform:'airbnb',started_at:first,last_observed_at:'2026-10-15T10:00:00Z'}];
 const options=optionsFromQuery({year:2026},'2026-10-15T10:00:00Z');
 const result=compareMonths([],sources,options);
 assert.equal(result.days,14);assert.equal(result.current.through,'2026-10-14');assert.equal(result.previous.through,'2026-09-14');assert.equal(result.current.available,true);
 sources[0].gaps=[{start:'2026-10-04T10:00:00Z',end:'2026-10-05T10:00:00Z'}];
 assert.equal(compareMonths([],sources,options).current.available,false);
});
test('the parser preserves source UID and explicit cancelled status, including undated cancellation notices',()=>{
 const {parseICalData}=require('../backend/src/sync-calendars');
 const events=parseICalData('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:cancel-1\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR');
 assert.deepEqual(events,[{uid:'cancel-1',status:'CANCELLED'}]);
});
