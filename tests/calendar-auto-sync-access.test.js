const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../frontend/public/index.html'), 'utf8');

test('calendar auto-sync skips Vercel preview hosts', () => {
  assert.match(html, /CALENDAR_AUTO_SYNC_PRODUCTION_HOSTS/);
  assert.match(html, /hostname\.endsWith\('\.vercel\.app'\)/);
  assert.match(html, /if \(isPreviewHost\) return false/);
});
