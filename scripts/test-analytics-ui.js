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
  for(const width of [375,768,1024,1440]){
   const context=await browser.newContext({viewport:{width,height:950},locale:'ru-RU',colorScheme:'light'});
   // Use the same pinned libraries as production, without modifying the app runtime.
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`${base}/stats`);
   await page.waitForFunction(()=>document.querySelectorAll('#analyticsRoot .a-kpi').length===8&&!document.querySelector('#statsTab').hasAttribute('aria-busy'));
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
   await page.locator('#analyticsHistory > summary').click();
   await page.locator('#analytics-historyMode').selectOption('legacy');
   assert.ok(await page.locator('#statsDynamicBookings').isVisible());
   await page.locator('#analytics-historyMetric').selectOption('occupancy');
   assert.match(await page.locator('#statsDynamicBookings').innerText(),/%/);
   await page.locator('#analyticsHistory > summary').click();
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
