const { chromium } = require('playwright');
const { createServer } = require('./test-ui-performance');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

async function main(){
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 try{
  // Reproduce the actual launch state: old saved history, one new snapshot, no events.
  for(const width of [375,1440]){
   const context=await browser.newContext({viewport:{width,height:950},locale:'ru-RU'});
   const page=await context.newPage();
   await page.route('**/api/dashboard?analytics=1&**',async route=>{
    const response=await route.fetch();const data=await response.json();
    for(const series of [data.movement,data.movement_monthly]){
     for(const key of Object.keys(series.totals))series.totals[key]=0;
     series.cancellations_by_arrival=[];
     for(const bucket of series.buckets)for(const key of Object.keys(series.totals))bucket[key]=0;
    }
    if(data.legacy_snapshots.length){
     const old={...data.legacy_snapshots[0],snapshot_date:new Date(Date.now()-3*86400000).toISOString().slice(0,10),booking_count:110,payload:{calculation_version:0}};
     data.legacy_snapshots.forEach(r=>r.payload={...r.payload,calculation_version:2});
     data.legacy_snapshots.unshift(old);
    }
    data.snapshots=[{...data.overview,date:new Date().toISOString().slice(0,10),version:1}];
    await route.fulfill({json:data});
   });
   await page.goto(`${base}/stats`);
   await page.waitForFunction(()=>typeof Chart!=='undefined'&&Chart.getChart('analyticsHistoryChart'));
   assert.equal(await page.locator('#statsDynamicBookings').innerText(),'131','existing history is immediately selected');
   assert.deepEqual(await page.evaluate(()=>Chart.getChart('analyticsHistoryChart').data.datasets[0].data),[110,128,131]);
   assert.deepEqual(await page.locator('.a-history-summary strong').allTextContents(),['128','131','+3'],'default comparison excludes incompatible methods');
   const earliest=await page.locator('#analytics-historyFrom option').first().getAttribute('value');
   await page.locator('#analytics-historyFrom').selectOption(earliest);
   assert.equal(await page.locator('.a-history-delta').innerText(),'—');
   assert.match(await page.locator('#analyticsHistoryContent').innerText(),/Сравнение недоступно/);
   assert.match(await page.locator('.a-history-scope').innerText(),/апрель–ноябрь/);
   assert.equal(await page.locator('#analyticsMovementChart').count(),0,'no empty movement chart');
   assert.equal(await page.locator('#analyticsCancellationChart').count(),0,'no empty cancellation chart');
   assert.equal(await page.locator('#analyticsMovementSummary').isVisible(),false,'baseline zeros do not compete with actual totals');
   assert.ok(await page.evaluate(()=>document.querySelector('#statsDynamicsCard').compareDocumentPosition(document.querySelector('#analyticsMovement'))&Node.DOCUMENT_POSITION_FOLLOWING));
   if(process.env.UI_SCREENSHOT_DIR){fs.mkdirSync(process.env.UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_SCREENSHOT_DIR,`analytics-baseline-${width}.png`),fullPage:true});}
   await page.locator('#analytics-historyMode').selectOption('annual');
   assert.equal(await page.locator('#analyticsHistoryChart').count(),0,'one observation is a value, not an empty trend');
   assert.match(await page.locator('#analyticsHistoryContent').innerText(),/первая точка/);
   await page.locator('#analytics-property').selectOption('orange');
   await page.waitForFunction(()=>!document.querySelector('#statsTab').hasAttribute('aria-busy'));
   assert.equal(await page.locator('#analyticsHistoryChart').count(),0,'unfiltered legacy history cannot leak into property filters');
   assert.ok(await page.locator('#statsDynamicBookings').isVisible());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1));
   await context.close();
   console.log(`Baseline with existing history passed at ${width}px`);
  }
  for(const width of [375,768,1024,1440]){
   const context=await browser.newContext({viewport:{width,height:950},locale:'ru-RU',colorScheme:'light'});
   // Use the same pinned libraries as production, without modifying the app runtime.
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${base}/stats`);
   await page.waitForFunction(()=>document.querySelectorAll('#analyticsRoot .a-kpi').length===8&&!document.querySelector('#statsTab').hasAttribute('aria-busy'));
   const originalYear=await page.locator('#analytics-year').inputValue();
   await page.locator('#analytics-year').selectOption(String(Number(originalYear)+1));
   await page.waitForFunction(()=>!document.querySelector('#statsTab').hasAttribute('aria-busy'));
   assert.deepEqual(await page.locator('#analyticsMovementSummary strong').allTextContents(),['—','—','—','—'],'future event periods have no observations');
   await page.locator('#analytics-year').selectOption(originalYear);
   await page.waitForFunction(()=>!document.querySelector('#statsTab').hasAttribute('aria-busy'));
   await page.locator('#analytics-group').selectOption('week');
   await page.waitForFunction(()=>document.querySelector('#analytics-group').value==='week'&&!document.querySelector('#statsTab').hasAttribute('aria-busy'));
   assert.equal(await page.locator('#analyticsCancellationTable tbody tr').count(),12);
   await page.locator('#analytics-cancellationBasis').selectOption('arrival');
   await page.locator('#analytics-period').selectOption('season');
   await page.waitForFunction(()=>document.querySelectorAll('.a-matrix thead th').length===10&&!document.querySelector('#statsTab').hasAttribute('aria-busy'));
   await page.locator('#analytics-property').selectOption('orange');
   await page.waitForFunction(()=>document.querySelectorAll('.a-matrix tbody tr').length===1&&!document.querySelector('#statsTab').hasAttribute('aria-busy'));
   await page.locator('#analytics-property').selectOption('');
   await page.locator('#analytics-period').selectOption('year');
   await page.waitForFunction(()=>document.querySelectorAll('.a-matrix thead th').length===14&&!document.querySelector('#statsTab').hasAttribute('aria-busy'));
   await page.locator('#analytics-historyMode').selectOption('legacy');
   assert.ok(await page.locator('#statsDynamicBookings').isVisible());
   await page.locator('#analytics-historyMetric').selectOption('occupancy');
   assert.match(await page.locator('#statsDynamicBookings').innerText(),/%/);
   for(const theme of ['light','dark']){
    // Theme controls are inspected by the existing suite; use the public preference action here.
    await page.evaluate(value=>window.AtraniTheme.setPreference(value),theme);
    await page.waitForFunction(()=>!document.querySelector('#statsTab').hasAttribute('aria-busy'));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,`${width} ${theme} overflows by ${overflow}`);
    if(process.env.UI_SCREENSHOT_DIR){fs.mkdirSync(process.env.UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_SCREENSHOT_DIR,`analytics-${theme}-${width}.png`),fullPage:true});}
   }
   assert.deepEqual(errors,[]);
   console.log(`Analytics filters, history and themes passed at ${width}px`);
   await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
