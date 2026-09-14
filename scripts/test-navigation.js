const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('./test-ui-performance');

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('atrani-theme-preference', 'light'));
    await page.goto(baseUrl);
    await page.waitForFunction(() => document.querySelector('#syncBtn').dataset.state === 'ok');
    for (const width of [320, 375, 390, 768, 820, 1024, 1180, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // Wait for existing responsive transitions before measuring the controls.
      await page.waitForTimeout(200);
      const geometry = await page.evaluate(() => {
        const selectors = ['.header-logo', '.language-switcher', '.theme-menu-trigger', '#syncBtn', ...Array.from(document.querySelectorAll('.nav-item'), el => `[data-tab="${el.dataset.tab}"]`)];
        return selectors.map(selector => {
          const el = document.querySelector(selector);
          const rect = el.getBoundingClientRect();
          return { selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height };
        });
      });
      for (const rect of geometry) {
        assert.ok(rect.left >= 0 && rect.right <= width + 1, `${width}: clipped ${JSON.stringify(rect)}`);
        assert.ok(rect.height >= 32, `${width}: hidden control ${rect.selector}`);
      }
      assert.ok(geometry[0].right <= geometry[1].left, `${width}: logo overlaps controls`);
      assert.ok(geometry[2].right <= geometry[3].left, `${width}: theme overlaps sync`);
      assert.ok(await page.locator('#syncBtn #lastSync').isVisible());
    }
    const hideCompleted = page.locator('#calendarHideCompleted');
    assert.equal(await hideCompleted.isChecked(), false, 'completed bookings must be shown by default');
    const completedCount = await page.locator('.booking-bar.completed').count();
    assert.ok(completedCount > 0, 'completed bookings were not rendered');
    await hideCompleted.check();
    assert.equal(await page.locator('.booking-bar.completed').count(), 0);
    await hideCompleted.uncheck();
    assert.equal(await page.locator('.booking-bar.completed').count(), completedCount);
    for (const [tab, route] of [['cleaners', '/maid'], ['stats', '/stats'], ['tax', '/tax'], ['reporting', '/reporting'], ['calendar', '/']]) {
      await page.locator(`[data-tab="${tab}"].nav-item`).click();
      assert.equal(new URL(page.url()).pathname, route);
      assert.equal(await page.locator('.nav-item[aria-current="page"]').getAttribute('data-tab'), tab);
    }
    // Hold a manual sync open to verify the persistent timestamp element and busy state.
    let releaseSync;
    await page.route('**/api/sync', async route => {
      await new Promise(resolve => { releaseSync = resolve; });
      await route.fulfill({ json: { success: true } });
    });
    await page.locator('#syncBtn').click();
    await page.waitForFunction(() => document.querySelector('#syncBtn').getAttribute('aria-busy') === 'true');
    assert.ok(await page.locator('#syncBtn').isDisabled());
    assert.equal(await page.locator('#lastSync').count(), 1);
    await page.waitForTimeout(100);
    releaseSync();
    await page.waitForFunction(() => !document.querySelector('#syncBtn').disabled);
    assert.match(await page.locator('#lastSync').innerText(), /Обновлено/);
    await page.unroute('**/api/sync');
    await page.route('**/api/sync', route => route.fulfill({ status: 503, json: { error: 'Test failure' } }));
    await page.locator('#syncBtn').click();
    await page.waitForFunction(() => document.querySelector('#syncBtn').dataset.state === 'error');
    assert.match(await page.locator('#lastSync').innerText(), /Ошибка/);
    assert.ok(await page.locator('#syncBtn').isEnabled());
    await page.unroute('**/api/sync');
    await page.route('**/api/sync', route => route.fulfill({ json: { success: true, partial: true, feed_errors: ['test'] } }));
    await page.locator('#syncBtn').click();
    await page.waitForFunction(() => document.querySelector('#syncBtn').dataset.state === 'warning');
    assert.match(await page.locator('#lastSync').innerText(), /внимания/);
    await page.unroute('**/api/sync');
    await page.locator('#syncBtn').click();
    await page.waitForFunction(() => document.querySelector('#syncBtn').dataset.state === 'ok' && !document.querySelector('#syncBtn').disabled);
    assert.match(await page.locator('#lastSync').innerText(), /Обновлено/);
    assert.deepEqual(errors, []);
    console.log('Navigation: 8 widths, 5 routes, busy, success, error, partial response and retry passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
