const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../frontend/public/index.html'), 'utf8');

test('reporting UI keeps apartment context visible with a distinct icon', () => {
  assert.match(html, /id="reportingCurrentUnitIcon"/);
  assert.match(html, /id="reportingCurrentUnitName"/);
  assert.match(html, /class="reporting-unit-icon"/);
  assert.match(html, /function reportingUnitMeta/);
  assert.match(html, /reportingUploadTitle'\)\.textContent = `Выбрать или перетащить TXT для \$\{name\}`/);
  assert.match(html, /reportingHistoryTitle'\)\.textContent = `Последние отправки · \$\{name\}`/);
  assert.match(html, /reportingIstatTitle'\)\.textContent = `ISTAT · \$\{name\}`/);
});

test('reporting upload snapshots its apartment even if the visible selection changes', () => {
  assert.match(html, /const requestedUnitId = reportingState\.unitId/);
  assert.match(html, /unit_id: requestedUnitId/);
  assert.match(html, /requestedUnitId !== reportingState\.unitId/);
  assert.match(html, /reportingState\.actionInFlight \|\| unitId === reportingState\.unitId/);
});

test('reporting workspace keeps ISTAT separate and accepts dropped TXT files', () => {
  assert.match(html, /class="reporting-primary-grid"/);
  assert.match(html, /class="reporting-istat-area"/);
  assert.match(html, /id="reportingIstatDeadline"/);
  assert.match(html, /До 4-го числа осталось/);
  assert.match(html, /addEventListener\('dragenter'/);
  assert.match(html, /addEventListener\('drop'/);
  assert.match(html, /uploadReportingFiles\(event\.dataTransfer\.files\)/);
});

test('reporting UI keeps the two-click Alloggiati flow and a folded ISTAT ledger', () => {
  assert.match(html, /const labels = \['TXT', 'Проверка', 'Отправка'\]/);
  assert.match(html, /runAlloggiatiAction\('test'\)/);
  assert.match(html, /runAlloggiatiAction\('send'\)/);
  assert.doesNotMatch(html, /action !== 'send' \|\| window\.confirm/);
  assert.match(html, /<details class="reporting-fold" id="reportingIstatFold"/);
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
  assert.match(html, /title="Удалить файл"/);
  assert.match(html, /function deleteReportingBatch\(batchId\)/);
  assert.match(html, /method:'DELETE'/);
  assert.match(html, /Персональные данные этого файла будут удалены/);
  assert.match(html, /\['needs_review', 'ready', 'tested'\]\.includes\(batch\.status\)/);
});

test('ISTAT ledger distinguishes confirmed, pending and late-update days', () => {
  assert.match(html, /Отправлено в ISTAT/);
  assert.match(html, /Ожидает отправки/);
  assert.match(html, /Нужно обновить/);
  assert.match(html, /preview\.pending_dates/);
  assert.match(html, /preview\.latest_date/);
  assert.match(html, /replace = Boolean/);
});
