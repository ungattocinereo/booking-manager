function eachDay(from, toExclusive) {
  const days = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${toExclusive}T00:00:00Z`);
  while (cursor < end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM');
  const start = `${month}-01`;
  const date = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== month) throw new Error('Invalid month');
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { start, end: date.toISOString().slice(0, 10) };
}

function toItalianDate(iso) {
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
}

function aggregateIstatMonth({ month, stays, roomOverrides = {}, closedDates = [] }) {
  const bounds = monthBounds(month);
  const closed = new Set(closedDates);
  const days = eachDay(bounds.start, bounds.end);
  const errors = [];

  for (const stay of stays) {
    const records = Array.isArray(stay.records) ? stay.records : [];
    if (!stay.origin_confirmed || !records.length || records.some(record => !record.origin_kind || !record.origin_code)) {
      errors.push(`Soggiorno ${stay.id}: provenienza non confermata`);
    }
    if (!stay.property_id && !stay.booking_id) errors.push(`Soggiorno ${stay.id}: alloggio non assegnato`);
    if (Number(stay.rooms_occupied) < 1) errors.push(`Soggiorno ${stay.id}: numero camere non valido`);
  }

  const giornate = days.map(day => {
    const grouped = new Map();
    let occupiedRooms = 0;
    for (const stay of stays) {
      const records = Array.isArray(stay.records) ? stay.records : [];
      for (const record of records) {
        if (!record.origin_kind || !record.origin_code) continue;
        const key = `${record.origin_kind}:${record.origin_code}`;
        const item = grouped.get(key) || {
          origin_kind: record.origin_kind,
          origin_code: record.origin_code,
          arrivi: 0,
          presentiNottePrecedente: 0,
          partenze: 0
        };
        if (record.arrival_date === day) item.arrivi++;
        if (record.arrival_date < day && record.departure_date >= day) item.presentiNottePrecedente++;
        if (record.departure_date === day) item.partenze++;
        grouped.set(key, item);
      }
      if (stay.arrival_date <= day && stay.departure_date > day) {
        occupiedRooms += Number(stay.rooms_occupied) || 1;
      }
    }

    const movimentazioni = [...grouped.values()]
      .filter(item => item.arrivi || item.presentiNottePrecedente || item.partenze)
      .map(item => ({
        ...(item.origin_kind === 'province'
          ? { codiceProvincia: item.origin_code }
          : { codiceNazione: item.origin_code }),
        arrivi: item.arrivi,
        presentiNottePrecedente: item.presentiNottePrecedente,
        partenze: item.partenze
      }));

    return {
      dataRilevazione: toItalianDate(day),
      camereOccupate: roomOverrides[day] == null ? occupiedRooms : Number(roomOverrides[day]),
      strutturaChiusa: closed.has(day),
      movimentazioni
    };
  });

  return { month, giornate, errors, ready: errors.length === 0 };
}

module.exports = { aggregateIstatMonth, monthBounds, eachDay, toItalianDate };
