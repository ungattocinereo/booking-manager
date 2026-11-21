const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('arrival board stylesheet is routed on Vercel as well as Express', () => {
  const root = path.join(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json')));
  const rewrite = config.rewrites.find(r => r.source === '/arrival-board.css');
  assert.equal(rewrite?.destination, '/frontend/public/arrival-board.css');
  assert.ok(fs.existsSync(path.join(root, rewrite.destination)));
  assert.match(fs.readFileSync(path.join(root, 'frontend/public/index.html'), 'utf8'), /href="\/arrival-board\.css"/);
});
