const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { parseAlloggiatiTxt, parseRecord } = require('../backend/src/reporting/parser');
const { encryptRecord, decryptRecord, fingerprint } = require('../backend/src/reporting/crypto');

const SAMPLE = [
  '1625/07/20263 ALLAN                                             TIMOTHY FRASER                222/10/1997           100000701100000701PASORRB1474082           100000701',
  '1725/07/20264 JENSEN                                            EMILIE KAY                    211/01/2005           100000536100000536PATEN231446071           100000536',
  '1925/07/20264 YOUNG                                             MAX BENNION                   208/12/2004           100000536100000536                                  '
];

test('parses Comune fixed-width TXT into one single stay and one family', () => {
  const parsed = parseAlloggiatiTxt(Buffer.from(SAMPLE.join('\r\n'), 'latin1'));
  assert.equal(parsed.recordCount, 3);
  assert.equal(parsed.stayCount, 2);
  assert.equal(parsed.arrivalFrom, '2026-07-25');
  assert.equal(parsed.groups[0].head.recordType, '16');
  assert.equal(parsed.groups[0].head.surname, 'ALLAN');
  assert.equal(parsed.groups[0].head.name, 'TIMOTHY FRASER');
  assert.equal(parsed.groups[0].head.departureDate, '2026-07-28');
  assert.equal(parsed.groups[1].head.recordType, '17');
  assert.equal(parsed.groups[1].members[0].recordType, '19');
  assert.equal(parsed.groups[1].records.length, 2);
});

test('rejects malformed line length and orphaned family members', () => {
  assert.throws(() => parseRecord(SAMPLE[0].slice(1), 1), /168 символов/);
  assert.throws(() => parseAlloggiatiTxt(Buffer.from(SAMPLE[2], 'latin1')), /без соответствующей главной записи/);
});

test('encrypts fixed records and uses a non-reversible stable fingerprint', () => {
  const encrypted = encryptRecord(SAMPLE[0]);
  assert.ok(!encrypted.value.includes('ALLAN'));
  assert.equal(decryptRecord(encrypted.value), SAMPLE[0]);
  assert.equal(fingerprint(SAMPLE[0]), fingerprint(SAMPLE[0]));
  assert.notEqual(fingerprint(SAMPLE[0]), fingerprint(SAMPLE[1]));
});
