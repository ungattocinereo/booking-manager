const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  assert.match(html, /reportingState\.uploading \|\| reportingState\.deleting \? 'disabled' : ''/);
});

test('reporting UI keeps Alloggiati as step three and ISTAT as a monthly ledger', () => {
  assert.match(html, /Шаг 3 · Alloggiati Web/);
  assert.doesNotMatch(html, /Шаг 3 · статистика/);
  assert.match(html, /Какие данные у меня уже внесены в Институт статистики/);
  assert.match(html, /action=status/);
  assert.match(html, /class="reporting-istat-table"/);
  assert.match(html, /до 4-го числа/);
});

test('reporting dates accept PostgreSQL ISO timestamps and never render Invalid Date', () => {
  assert.match(html, /const isoMatch = value\.match/);
  assert.match(html, /const italianMatch = value\.match/);
  assert.match(html, /Дата не определена/);
  const source = html.match(/function formatTaxDate\(iso\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const values = vm.runInNewContext(`${source}; [
    formatTaxDate('2026-07-25T00:00:00.000Z'),
    formatTaxDate('25/07/2026'),
    formatTaxDate('25072026')
  ]`);
  assert.equal(values.every(value => value.includes('25') && !value.includes('Invalid')), true);
});

test('reporting UI deletes only an unsubmitted TXT after explicit confirmation', () => {
  assert.match(html, /Удалить TXT/);
  assert.match(html, /function deleteReportingBatch\(\)/);
  assert.match(html, /method:'DELETE'/);
  assert.match(html, /Гости исчезнут и из черновика ISTAT/);
  assert.match(html, /!\['sent', 'partial', 'unknown', 'pii_purged'\]\.includes\(batch\.status\)/);
});
