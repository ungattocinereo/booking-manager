const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('./test-ui-performance');
(async () => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForSelector('#statTodayList button');
      const counts = await page.evaluate(() => {
        const today = toLocalIso(todayLocal());
        const tomorrow = toLocalIso(addCalendarDays(todayLocal(), 1));
        bookings = properties.map((p, i) => ({ id: 9900 + i, property_id: p.id, platform: 'airbnb', start_date: tomorrow, end_date: toLocalIso(addCalendarDays(todayLocal(), 4)), guest_name: i === 0 ? '<img src=x onerror=alert(1)>' : `Гость ${i}`, booking_type: 'reservation' }));
        updateStats(); return properties.length;
      });
      await page.locator('[data-arrival-select=tomorrow]').click();
      assert.equal(await page.locator('[data-arrival-panel=tomorrow]').isVisible(), true);
      assert.equal(await page.locator('#statNextList button:visible').count(), counts);
      assert.equal(await page.locator('#statNextList img').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      await page.locator('#statNextList button').first().click();
      assert.equal(await page.locator('#bookingPanel').getAttribute('aria-hidden'), 'false');
      await page.evaluate(() => closeBookingPanel());
      await page.locator('[data-arrival-select=today]').click();
      assert.match(await page.locator('#statTodayCount').textContent(), /нет/);
      await page.evaluate(() => { bookings = bookings.slice(0, 1); updateStats(); });
      await page.locator('[data-arrival-select=tomorrow]').click();
      assert.equal(await page.locator('[data-arrival-panel=tomorrow]').getAttribute('data-density'), 'single');
      await page.close();
    }
    console.log('Arrival board: all apartments, day switching, empty/single/busy days, safe names and mobile widths passed');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
