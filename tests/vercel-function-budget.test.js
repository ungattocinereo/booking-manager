const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function apiFunctions(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return apiFunctions(target);
    if (!entry.name.endsWith('.js') || entry.name.startsWith('_')) return [];
    return [path.relative(root, target)];
  });
}

test('Vercel Hobby deployment stays within the 12-function limit', () => {
  const functions = apiFunctions(path.join(root, 'api'));
  assert.ok(functions.length <= 12, `Expected at most 12 serverless functions, found ${functions.length}: ${functions.join(', ')}`);
});

test('reporting endpoints are rewritten to the existing dashboard function', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const rewrites = new Map(config.rewrites.map(item => [item.source, item.destination]));
  for (const route of ['dashboard', 'imports', 'alloggiati', 'istat', 'maintenance']) {
    const source = route === 'dashboard' ? '/api/reporting' : `/api/reporting/${route}`;
    assert.equal(rewrites.get(source), `/api/dashboard?reporting_route=${route}`);
  }
});
