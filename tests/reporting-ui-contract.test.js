const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../frontend/public/index.html'), 'utf8');

test('reporting UI keeps the selected destination visible throughout the workflow', () => {
  assert.match(html, /id="reportingDestination" aria-live="polite"/);
  assert.match(html, /aria-pressed="\$\{active\}"/);
  assert.match(html, /Сейчас выбрана структура/);
  assert.match(html, /Назначение: Alloggiati Web/);
  assert.match(html, /Назначение: ISTAT/);
  assert.match(html, /Отправить в Alloggiati ·/);
});

test('reporting upload snapshots its destination while unit switching is locked', () => {
  assert.match(html, /const targetUnitId = targetUnit\?\.id/);
  assert.match(html, /unit_id: targetUnitId/);
  assert.match(html, /reportingState\.uploading = true/);
  assert.match(html, /reportingState\.uploading \? 'disabled' : ''/);
});

test('reporting UI keeps Alloggiati as step three and ISTAT as a monthly ledger', () => {
  assert.match(html, /Шаг 3 · Alloggiati Web/);
  assert.doesNotMatch(html, /Шаг 3 · статистика/);
  assert.match(html, /Какие данные у меня уже внесены в Институт статистики/);
  assert.match(html, /action=status/);
  assert.match(html, /class="reporting-istat-table"/);
  assert.match(html, /до 4-го числа/);
});
