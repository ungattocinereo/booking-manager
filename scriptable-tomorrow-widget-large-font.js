// Scriptable widget: tomorrow's guest status from Booking Manager.
// Paste into Scriptable on iPhone, then add a Scriptable Large widget and select this script.

// Replace placeholders before pasting into Scriptable.
const API_URL = 'https://booking-manager-cinereos-projects.vercel.app/api/bookings?widget=today&token=YOUR_WIDGET_TOKEN';
const VERCEL_BYPASS = 'YOUR_VERCEL_PROTECTION_BYPASS_TOKEN';

const MAX_ARRIVAL_ROWS = 5;
const MAX_CHECKOUT_ROOMS = 4;
const CONTENT_WIDTH = 340;
const HEADER_HEIGHT = 44;
const ARRIVAL_SECTION_HEIGHT = 226;
const ARRIVAL_ROW_HEIGHT = 34;
const CHECKOUT_SECTION_HEIGHT = 54;

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

function platformName(item) {
  const platform = String((item && item.platform) || '').toLowerCase();
  if (platform.includes('airbnb')) return 'Airbnb';
  if (platform.includes('booking')) return 'Booking';
  if (platform.includes('direct')) return 'Прямое';
  return 'Источник не указан';
}

function pluralNights(value) {
  const number = Math.abs(Number(value)) % 100;
  const last = number % 10;
  if (number >= 11 && number <= 14) return 'ночей';
  if (last === 1) return 'ночь';
  if (last >= 2 && last <= 4) return 'ночи';
  return 'ночей';
}

function stayLength(item) {
  const nights = item.nights || daysBetween(item.start, item.end);
  return nights ? `${nights} ${pluralNights(nights)}` : 'ночей ?';
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
  row.size = new Size(CONTENT_WIDTH, HEADER_HEIGHT);

  const left = row.addStack();
  left.layoutVertically();
  left.size = new Size(214, HEADER_HEIGHT);
  addText(left, 'Что завтра', 24, colors.ink, 'bold', 0.84);
  left.addSpacer(1);
  addText(left, tomorrowLabel(data.date), 13, colors.muted, 'medium', 0.82);

  row.addSpacer(8);

  const right = row.addStack();
  right.layoutVertically();
  right.size = new Size(118, HEADER_HEIGHT);
  right.addSpacer(4);
  const labelRow = right.addStack();
  labelRow.layoutHorizontally();
  labelRow.addSpacer();
  rightText(addText(labelRow, 'обновлено', 9, colors.faint, 'bold', 0.82));
  const timeRow = right.addStack();
  timeRow.layoutHorizontally();
  timeRow.addSpacer();
  rightText(addText(timeRow, shortTime(data.updated_at), 14, colors.muted, 'semibold', 0.82));
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
  section.setPadding(8, 8, 8, 8);

  const head = section.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  addText(head, title, 15, colors.ink, 'bold', 0.82);
  head.addSpacer();
  rightText(addText(head, String(count), 15, colors.arrival, 'bold', 0.86));

  return section;
}

function addArrivalRow(parent, item) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.backgroundColor = colors.surfaceSoft;
  row.cornerRadius = 9;
  row.size = new Size(CONTENT_WIDTH - 16, ARRIVAL_ROW_HEIGHT);
  row.setPadding(3, 7, 3, 7);

  addPlatformMark(row, item, 20, ARRIVAL_ROW_HEIGHT - 6, 14);
  row.addSpacer(7);

  const details = row.addStack();
  details.layoutVertically();
  details.size = new Size(277, ARRIVAL_ROW_HEIGHT - 6);

  const guestRow = details.addStack();
  guestRow.layoutHorizontally();
  guestRow.centerAlignContent();
  addText(guestRow, guestName(item), 15, colors.ink, 'semibold', 0.78);

  const metaRow = details.addStack();
  metaRow.layoutHorizontally();
  metaRow.centerAlignContent();
  addText(metaRow, `${propertyName(item)} · ${platformName(item)}`, 10, colors.muted, 'medium', 0.72);
  metaRow.addSpacer(6);
  rightText(addText(metaRow, stayLength(item), 11, colors.arrival, 'bold', 0.82));
}

function addArrivalsSection(widget, items) {
  const visible = items.slice(0, MAX_ARRIVAL_ROWS);
  const count = items.length > visible.length ? `${visible.length}/${items.length}` : items.length;
  const section = addSectionShell(widget, 'Заезды завтра', count);
  section.addSpacer(5);

  if (!items.length) {
    section.addSpacer();
    const empty = section.addStack();
    empty.layoutVertically();
    empty.centerAlignContent();
    centerText(addText(empty, 'Завтра без заездов', 18, colors.muted, 'semibold', 0.84));
    empty.addSpacer(4);
    centerText(addText(empty, 'Выезды всё равно видны внизу', 11, colors.faint, 'medium', 0.82));
    section.addSpacer();
    return;
  }

  visible.forEach((item, index) => {
    addArrivalRow(section, item);
    if (index !== visible.length - 1) section.addSpacer(3);
  });
}

function checkoutSummary(items) {
  if (!items.length) return 'Выездов нет';
  const visible = items.slice(0, MAX_CHECKOUT_ROOMS).map(propertyName);
  const more = items.length - visible.length;
  return `${visible.join(' · ')}${more > 0 ? ` · +${more}` : ''}`;
}

function addCheckoutSection(widget, items) {
  const section = widget.addStack();
  section.layoutVertically();
  section.backgroundColor = colors.surface;
  section.cornerRadius = 13;
  section.borderWidth = 1;
  section.borderColor = colors.line;
  section.size = new Size(CONTENT_WIDTH, CHECKOUT_SECTION_HEIGHT);
  section.setPadding(7, 9, 7, 9);

  const head = section.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  addText(head, 'Выезды', 11, colors.checkout, 'bold', 0.84);
  head.addSpacer();
  rightText(addText(head, String(items.length), 11, colors.muted, 'bold', 0.86));

  section.addSpacer(3);
  const summary = section.addStack();
  summary.layoutHorizontally();
  summary.centerAlignContent();
  addText(summary, checkoutSummary(items), 11, colors.ink, 'medium', 0.78);
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
  addHeader(widget, data);
  widget.addSpacer(6);
  addArrivalsSection(widget, checkIns);
  widget.addSpacer();
  addCheckoutSection(widget, checkOuts);

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
