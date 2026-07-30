const { fingerprint } = require('./crypto');

const RECORD_LENGTH = 168;
const HEAD_TYPES = new Set(['16', '17', '18']);
const MEMBER_TYPES = new Set(['19', '20']);
const ALL_TYPES = new Set([...HEAD_TYPES, ...MEMBER_TYPES]);

function parseItalianDate(value, field, lineNumber) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error(`Строка ${lineNumber}: неверное поле ${field}`);
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error(`Строка ${lineNumber}: невозможная дата ${field}`);
  }
  return iso;
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function field(line, from, to) {
  return line.slice(from, to);
}

function istatOriginFromCitizenship(value) {
  const match = String(value || '').trim().match(/^100000(\d{3})$/);
  if (!match || match[1] === '100') return null;
  return {
    originKind: 'country',
    originCode: match[1],
    originLabel: 'citizenship'
  };
}

function parseRecord(line, lineNumber) {
  if (line.length !== RECORD_LENGTH) {
    throw new Error(`Строка ${lineNumber}: ожидается ${RECORD_LENGTH} символов, получено ${line.length}`);
  }

  const recordType = field(line, 0, 2);
  if (!ALL_TYPES.has(recordType)) throw new Error(`Строка ${lineNumber}: неизвестный тип гостя ${recordType}`);
  const arrivalDate = parseItalianDate(field(line, 2, 12), 'дата заезда', lineNumber);
  const days = Number.parseInt(field(line, 12, 14).trim(), 10);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error(`Строка ${lineNumber}: срок проживания должен быть от 1 до 30 дней`);
  }
  const surname = field(line, 14, 64).trim();
  const name = field(line, 64, 94).trim();
  const sex = field(line, 94, 95);
  const birthDate = parseItalianDate(field(line, 95, 105), 'дата рождения', lineNumber);
  const documentType = field(line, 134, 139).trim();
  const documentNumber = field(line, 139, 159).trim();
  const documentIssuer = field(line, 159, 168).trim();

  if (!surname || !name) throw new Error(`Строка ${lineNumber}: отсутствует имя или фамилия`);
  if (!['1', '2'].includes(sex)) throw new Error(`Строка ${lineNumber}: неверный код пола`);
  if (HEAD_TYPES.has(recordType) && (!documentType || !documentNumber || !documentIssuer)) {
    throw new Error(`Строка ${lineNumber}: для главной записи обязателен документ`);
  }

  return {
    lineNumber,
    raw: line,
    fingerprint: fingerprint(line),
    recordType,
    arrivalDate,
    departureDate: addDays(arrivalDate, days),
    days,
    surname,
    name,
    sex,
    birthDate,
    birthTownCode: field(line, 105, 114).trim(),
    birthProvince: field(line, 114, 116).trim(),
    birthStateCode: field(line, 116, 125).trim(),
    citizenshipCode: field(line, 125, 134).trim(),
    documentType,
    documentNumber,
    documentIssuer
  };
}

function validateMember(head, member) {
  const expectedHead = member.recordType === '19' ? '17' : '18';
  if (!head || head.recordType !== expectedHead) {
    throw new Error(`Строка ${member.lineNumber}: тип ${member.recordType} указан без соответствующей главной записи ${expectedHead}`);
  }
  if (head.arrivalDate !== member.arrivalDate) {
    throw new Error(`Строка ${member.lineNumber}: дата заезда участника не совпадает с главной записью группы`);
  }
}

function decodeTxt(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length > 256 * 1024) throw new Error('TXT превышает допустимый размер 256 KB');
  return new TextDecoder('windows-1252', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
}

function parseAlloggiatiTxt(buffer) {
  const decoded = decodeTxt(buffer);
  const lines = decoded.split(/\r?\n/).filter(line => line.length > 0);
  if (!lines.length) throw new Error('TXT не содержит записей');
  if (lines.length > 1000) throw new Error('TXT содержит более 1000 записей');

  const records = lines.map((line, index) => parseRecord(line, index + 1));
  const groups = [];
  let currentHead = null;
  for (const record of records) {
    if (HEAD_TYPES.has(record.recordType)) {
      currentHead = record;
      groups.push({
        groupIndex: groups.length + 1,
        head: record,
        members: [],
        records: [record]
      });
      continue;
    }
    validateMember(currentHead, record);
    const group = groups[groups.length - 1];
    group.members.push(record);
    group.records.push(record);
  }

  const arrivals = records.map(record => record.arrivalDate).sort();
  return {
    decoded,
    records,
    groups,
    recordCount: records.length,
    stayCount: groups.length,
    arrivalFrom: arrivals[0],
    arrivalTo: arrivals[arrivals.length - 1]
  };
}

function maskDocument(value) {
  if (!value) return '';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function publicRecord(record) {
  return {
    line_number: record.lineNumber,
    record_type: record.recordType,
    arrival_date: record.arrivalDate,
    departure_date: record.departureDate,
    surname: record.surname,
    name: record.name,
    citizenship_code: record.citizenshipCode,
    document_type: record.documentType,
    document_number_masked: maskDocument(record.documentNumber)
  };
}

module.exports = { RECORD_LENGTH, parseRecord, parseAlloggiatiTxt, publicRecord, addDays, istatOriginFromCitizenship };
