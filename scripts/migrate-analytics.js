// This migration only adds analytics tables. Existing bookings and snapshots are untouched.
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { schema } = require('../backend/src/analytics-store');
require('dotenv').config({path:path.join(__dirname,'../.env')});
require('dotenv').config({path:path.join(__dirname,'../.env.local')});
async function main(){
 if(!process.argv.includes('--apply')){console.log(schema);return;}
 const index=process.argv.indexOf('--backup-dir');
 const backup=index>=0?process.argv[index+1]:null;
 if(!backup)throw new Error('Supply --backup-dir from backup:data before applying the migration');
 const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));
 for(const table of ['bookings','properties','booking_stats_snapshots']){
  const info=manifest.tables[table];
  if(!info||info.missing||!fs.existsSync(path.join(backup,`${table}.json`)))throw new Error(`Backup missing ${table}`);
 }
 const pool=new Pool({connectionString:process.env.POSTGRES_URL||process.env.DATABASE_URL});
 const client=await pool.connect();
 try{await client.query('BEGIN');await client.query(schema);await client.query('COMMIT');console.log('Analytics tables ready; existing booking data unchanged.');}
 catch(e){await client.query('ROLLBACK');throw e;}
 finally{client.release();await pool.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
