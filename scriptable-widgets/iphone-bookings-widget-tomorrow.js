// Scriptable widget: tomorrow's guest status from Booking Manager.
// Paste into Scriptable on iPhone, then add a Scriptable Large widget and select this script.

// Replace placeholders before pasting into Scriptable.
const API_URL = 'https://booking-manager-cinereos-projects.vercel.app/api/bookings?widget=today&token=YOUR_WIDGET_TOKEN';
const VERCEL_BYPASS = 'YOUR_VERCEL_PROTECTION_BYPASS_TOKEN';

const MAX_ARRIVAL_ROWS = 3;
const MAX_STAY_ROWS = 5;
const MAX_CHECKOUT_ROWS = 5;
const CONTENT_WIDTH = 340;
const CARD_GAP = 8;
const METRIC_WIDTH = 108;
const BOTTOM_CARD_WIDTH = 166;
const ARRIVAL_SECTION_HEIGHT = 110;
const BOTTOM_SECTION_HEIGHT = 120;

const colors = {
  bgTop: Color.dynamic(new Color('#F7F8F3'), new Color('#07100D')),
  bgBottom: Color.dynamic(new Color('#EAF2F1'), new Color('#111B18')),
  surface: Color.dynamic(new Color('#FEFFFC'), new Color('#141F1B')),
  surfaceSoft: Color.dynamic(new Color('#F1F6F3'), new Color('#1B2A25')),
  ink: Color.dynamic(new Color('#14201C'), new Color('#F2F7F4')),
  muted: Color.dynamic(new Color('#62706B'), new Color('#AAB8B1')),
  faint: Color.dynamic(new Color('#9AA8A1'), new Color('#6C7A73')),
  line: Color.dynamic(new Color('#D7E0DB'), new Color('#2A3933')),
  arrival: Color.dynamic(new Color('#007C78'), new Color('#66E2CF')),
  checkout: Color.dynamic(new Color('#C65648'), new Color('#FF9C8D')),
  stay: Color.dynamic(new Color('#A17016'), new Color('#F1C866')),
  booking: Color.dynamic(new Color('#2457D6'), new Color('#8FB1FF')),
  airbnb: Color.dynamic(new Color('#D84670'), new Color('#FF93B1')),
  direct: Color.dynamic(new Color('#58616B'), new Color('#C4CED8')),
};

const PROPERTY_META = {
  awesome: { name: 'Awesome', group: 'dragone', order: 1 },
  central: { name: 'Central', group: 'dragone', order: 2 },
  orange: { name: 'Orange', group: 'dragone', order: 3 },
  vingtage: { name: 'Vingtage', group: 'dragone', order: 4 },
  youth: { name: 'Youth', group: 'dragone', order: 5 },
  solo: { name: 'Solo', group: 'dragone', order: 6 },
  carina: { name: 'Carina', group: 'dipino', order: 7 },
  royal: { name: 'Royal', group: 'dipino', order: 8 },
  harmony: { name: 'Harmony', group: 'dipino', order: 9 },
  susy: { name: 'Villa Susy', group: 'susy', order: 10 },
  carmela: { name: 'Carmela', group: 'oliva', order: 11 },
};

function appFont(size, weight = 'regular') {
  if (weight === 'bold') return Font.boldSystemFont(size);
  if (weight === 'semibold') return Font.semiboldSystemFont(size);
  if (weight === 'medium') return Font.mediumSystemFont(size);
  return Font.systemFont(size);
}

function addText(stack, text, size, color, weight = 'regular', scale = 0.72, lines = 1) {
  const t = stack.addText(String(text == null ? '' : text));
  t.font = appFont(size, weight);
  t.textColor = color;
  t.lineLimit = lines;
  t.minimumScaleFactor = scale;
  if (typeof t.leftAlignText === 'function') t.leftAlignText();
  return t;
}

function centerText(text) {
  if (typeof text.centerAlignText === 'function') text.centerAlignText();
  return text;
}

function rightText(text) {
  if (typeof text.rightAlignText === 'function') text.rightAlignText();
  return text;
}

function topAlign(stack) {
  if (typeof stack.topAlignContent === 'function') stack.topAlignContent();
  return stack;
}

function targetDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateMs(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function daysBetween(start, end) {
  const startMs = dateMs(start);
  const endMs = dateMs(end);
  if (startMs == null || endMs == null) return null;
  const days = Math.round((endMs - startMs) / 86400000);
  return days > 0 ? days : null;
}

function dateTitle(value) {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || !Number.isFinite(parts[1])) return 'завтра';
  const month = months[Math.max(0, Math.min(11, parts[1] - 1))];
  return `${parts[2]} ${month}`;
}

function tomorrowLabel(value) {
  return `Завтра, ${dateTitle(value)}`;
}

function shortTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function propertyMeta(item) {
  const key = String((item && item.property_id) || '').toLowerCase();
  return PROPERTY_META[key] || null;
}

function propertyName(item) {
  const meta = propertyMeta(item);
  if (meta) return meta.name;
  return item && item.property ? String(item.property) : '—';
}

function guestName(item) {
  if (!item || !item.guest || item.guest === '—') return 'без имени';
  return String(item.guest);
}

function platformSymbol(item) {
  const platform = String((item && item.platform) || '').toLowerCase();
  if (platform.includes('airbnb')) return { name: 'heart.fill', tint: colors.airbnb };
  if (platform.includes('booking')) return { name: 'circle.fill', tint: colors.booking };
  if (platform.includes('direct')) return { name: 'person.2.fill', tint: colors.direct };
  return { name: 'circle', tint: colors.faint };
}

function stayLength(item) {
  const nights = item.nights || daysBetween(item.start, item.end);
  return nights ? `${nights}д` : '?д';
}

function compareByProperty(a, b) {
  const groupOrder = { dragone: 0, dipino: 1, susy: 2, oliva: 3, apartments: 4 };
  const aMeta = propertyMeta(a);
  const bMeta = propertyMeta(b);
  const aGroup = groupOrder[String((aMeta && aMeta.group) || a.group || '').toLowerCase()] ?? 9;
  const bGroup = groupOrder[String((bMeta && bMeta.group) || b.group || '').toLowerCase()] ?? 9;
  const aOrder = (aMeta && aMeta.order) || a.order || 99;
  const bOrder = (bMeta && bMeta.order) || b.order || 99;
  return aGroup - bGroup || aOrder - bOrder || propertyName(a).localeCompare(propertyName(b));
}

async function loadData() {
  const req = new Request(`${API_URL}&date=${targetDate()}&_=${Date.now()}`);
  req.headers = { 'x-vercel-protection-bypass': VERCEL_BYPASS };
  req.timeoutInterval = 10;
  return await req.loadJSON();
}

function makeBaseWidget() {
  const widget = new ListWidget();
  const gradient = new LinearGradient();
  gradient.colors = [colors.bgTop, colors.bgBottom];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;
  widget.setPadding(9, 12, 9, 12);
  return widget;
}

function addPlatformMark(parent, item, width = 22, height = 18, size = 13) {
  const style = platformSymbol(item);
  const mark = parent.addStack();
  mark.layoutHorizontally();
  mark.centerAlignContent();
  mark.size = new Size(width, height);
  const left = Math.max(0, Math.floor((width - size) / 2));
  mark.addSpacer(left);
  const symbol = SFSymbol.named(style.name);
  const image = mark.addImage(symbol.image);
  image.tintColor = style.tint;
  image.imageSize = new Size(size, size);
  mark.addSpacer(Math.max(0, width - size - left));
  return mark;
}

function addHeader(widget, data) {
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(CONTENT_WIDTH, 39);

  const left = row.addStack();
  left.layoutVertically();
  left.size = new Size(214, 39);
  addText(left, 'Что завтра', 21, colors.ink, 'bold', 0.78);
  left.addSpacer(1);
  addText(left, tomorrowLabel(data.date), 11, colors.muted, 'medium', 0.72);

  row.addSpacer(CARD_GAP);

  const right = row.addStack();
  right.layoutVertically();
  right.size = new Size(118, 39);
  right.addSpacer(4);
  const labelRow = right.addStack();
  labelRow.layoutHorizontally();
  labelRow.addSpacer();
  rightText(addText(labelRow, 'обновлено', 8, colors.faint, 'bold', 0.78));
  const timeRow = right.addStack();
  timeRow.layoutHorizontally();
  timeRow.addSpacer();
  rightText(addText(timeRow, shortTime(data.updated_at), 13, colors.muted, 'semibold', 0.78));
}

function addMetric(parent, label, value, tintColor) {
  const box = parent.addStack();
  box.layoutVertically();
  box.backgroundColor = colors.surface;
  box.cornerRadius = 12;
  box.borderWidth = 1;
  box.borderColor = colors.line;
  box.size = new Size(METRIC_WIDTH, 50);
  box.setPadding(6, 6, 6, 6);

  const labelRow = box.addStack();
  labelRow.layoutHorizontally();
  labelRow.centerAlignContent();
  labelRow.addSpacer();
  centerText(addText(labelRow, label, 9, colors.muted, 'bold', 0.62));
  labelRow.addSpacer();

  box.addSpacer(2);

  const valueRow = box.addStack();
  valueRow.layoutHorizontally();
  valueRow.centerAlignContent();
  valueRow.addSpacer();
  centerText(addText(valueRow, String(value), 25, tintColor, 'bold', 0.82));
  valueRow.addSpacer();
}

function addMetrics(widget, checkIns, checkOuts, occupied) {
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(CONTENT_WIDTH, 50);
  addMetric(row, 'Заезды', checkIns.length, colors.arrival);
  row.addSpacer(CARD_GAP);
  addMetric(row, 'Выезды', checkOuts.length, colors.checkout);
  row.addSpacer(CARD_GAP);
  addMetric(row, 'Остаются', occupied.length, colors.stay);
}

function addSectionShell(parent, title, count) {
  const section = parent.addStack();
  section.layoutVertically();
  topAlign(section);
  section.backgroundColor = colors.surface;
  section.cornerRadius = 13;
  section.borderWidth = 1;
  section.borderColor = colors.line;
  section.size = new Size(CONTENT_WIDTH, ARRIVAL_SECTION_HEIGHT);
  section.setPadding(7, 8, 7, 8);

  const head = section.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  addText(head, title, 13, colors.ink, 'bold', 0.72);
  head.addSpacer();
  rightText(addText(head, String(count), 13, colors.muted, 'bold', 0.82));

  return section;
}

function addEmptyLine(parent, text, width) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(width, 17);
  addText(row, text, 10, colors.faint, 'medium', 0.7);
}

function addMoreLine(parent, count, width) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(width, 14);
  row.addSpacer();
  addText(row, `+${count}`, 9, colors.faint, 'semibold', 0.8);
}

function addArrivalRow(parent, item) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(CONTENT_WIDTH - 16, 22);

  addPlatformMark(row, item, 22, 20, 14);
  row.addSpacer(8);

  const roomBox = row.addStack();
  roomBox.layoutHorizontally();
  roomBox.centerAlignContent();
  roomBox.size = new Size(88, 22);
  addText(roomBox, propertyName(item), 11, colors.ink, 'semibold', 0.5);

  row.addSpacer(CARD_GAP);

  const guestBox = row.addStack();
  guestBox.layoutHorizontally();
  guestBox.centerAlignContent();
  guestBox.size = new Size(158, 22);
  addText(guestBox, guestName(item), 11, colors.ink, 'medium', 0.38);

  row.addSpacer(CARD_GAP);

  const daysBox = row.addStack();
  daysBox.layoutHorizontally();
  daysBox.centerAlignContent();
  daysBox.size = new Size(32, 22);
  daysBox.addSpacer();
  rightText(addText(daysBox, stayLength(item), 10, colors.muted, 'semibold', 0.78));
}

function addArrivalsSection(widget, items) {
  const section = addSectionShell(widget, 'Заезды завтра', items.length);
  section.addSpacer(5);

  if (!items.length) {
    addEmptyLine(section, 'Заездов нет', CONTENT_WIDTH - 16);
    return;
  }

  const visible = items.slice(0, MAX_ARRIVAL_ROWS);
  visible.forEach((item, index) => {
    addArrivalRow(section, item);
    if (index !== visible.length - 1) section.addSpacer(1);
  });

  if (items.length > visible.length) {
    section.addSpacer(2);
    addMoreLine(section, items.length - visible.length, CONTENT_WIDTH - 16);
  }
}

function addCompactGuestRow(parent, item) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(BOTTOM_CARD_WIDTH - 14, 17);
  addPlatformMark(row, item, 20, 17, 12);
  row.addSpacer(8);
  const nameBox = row.addStack();
  nameBox.layoutHorizontally();
  nameBox.centerAlignContent();
  nameBox.size = new Size(BOTTOM_CARD_WIDTH - 42, 17);
  addText(nameBox, propertyName(item), 10, colors.ink, 'medium', 0.52);
}

function addCompactSection(parent, title, items, maxRows) {
  const section = parent.addStack();
  section.layoutVertically();
  topAlign(section);
  section.backgroundColor = colors.surface;
  section.cornerRadius = 13;
  section.borderWidth = 1;
  section.borderColor = colors.line;
  section.size = new Size(BOTTOM_CARD_WIDTH, BOTTOM_SECTION_HEIGHT);
  section.setPadding(6, 7, 6, 7);

  const head = section.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  addText(head, title, 11, colors.ink, 'bold', 0.62);
  head.addSpacer();
  rightText(addText(head, String(items.length), 11, colors.muted, 'bold', 0.82));

  section.addSpacer(4);

  if (!items.length) {
    addEmptyLine(section, 'нет', BOTTOM_CARD_WIDTH - 14);
    return section;
  }

  const visible = items.slice(0, maxRows);
  visible.forEach((item, index) => {
    addCompactGuestRow(section, item);
    if (index !== visible.length - 1) section.addSpacer(1);
  });

  if (items.length > visible.length) {
    section.addSpacer(1);
    addMoreLine(section, items.length - visible.length, BOTTOM_CARD_WIDTH - 14);
  }

  return section;
}

function addBottomSections(widget, occupied, checkOuts) {
  const row = widget.addStack();
  row.layoutHorizontally();
  topAlign(row);
  row.size = new Size(CONTENT_WIDTH, BOTTOM_SECTION_HEIGHT);
  addCompactSection(row, 'Остаются', occupied, MAX_STAY_ROWS);
  row.addSpacer(CARD_GAP);
  addCompactSection(row, 'Выезжают', checkOuts, MAX_CHECKOUT_ROWS);
}

function renderError(message) {
  const widget = makeBaseWidget();
  addHeader(widget, { date: targetDate() });
  widget.addSpacer(10);
  const section = addSectionShell(widget, 'Не загрузилось', '!');
  section.addSpacer(7);
  addText(section, message || 'Проверь URL и токены', 12, colors.muted, 'medium', 0.72, 3);
  return widget;
}

function renderWidget(data) {
  const widget = makeBaseWidget();

  const checkIns = (data.check_ins || []).slice().sort(compareByProperty);
  const checkOuts = (data.check_outs || []).slice().sort(compareByProperty);
  const occupied = (data.occupied || []).slice().sort(compareByProperty);

  addHeader(widget, data);
  widget.addSpacer(4);
  addMetrics(widget, checkIns, checkOuts, occupied);
  widget.addSpacer(6);
  addArrivalsSection(widget, checkIns);
  widget.addSpacer(6);
  addBottomSections(widget, occupied, checkOuts);

  return widget;
}

let widget;
try {
  const data = await loadData();
  widget = data.status === 'ok' ? renderWidget(data) : renderError(data.error);
} catch (error) {
  widget = renderError(String(error).replace(/^Error: /, ''));
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
