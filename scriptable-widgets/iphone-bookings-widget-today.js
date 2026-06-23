// Scriptable widget: today's guest arrivals from Booking Manager.
// Paste into Scriptable on iPhone, then add a Scriptable Large widget and select this script.

// Replace placeholders before pasting into Scriptable.
const API_URL = 'https://booking-manager-cinereos-projects.vercel.app/api/bookings?widget=today&token=YOUR_WIDGET_TOKEN';
const VERCEL_BYPASS = 'YOUR_VERCEL_PROTECTION_BYPASS_TOKEN';

const WIDGET_TITLE = 'Гости сегодня';
const ARRIVALS_TITLE = 'Заезды сегодня';
const CHECKOUTS_TITLE = 'Выезды';
const OCCUPIED_TITLE = 'Живут';
const HEADER_SYMBOL = 'house.fill';
const ARRIVAL_ROOM_WIDTH = 132;
const ARRIVAL_GUEST_WIDTH = 126;
const BOTTOM_NAME_WIDTH = 86;

const colors = {
  bgTop: Color.dynamic(new Color('#F7FBF8'), new Color('#111816')),
  bgBottom: Color.dynamic(new Color('#EAF3EF'), new Color('#07100D')),
  surface: Color.dynamic(new Color('#FFFFFF'), new Color('#16201D')),
  surfaceSoft: Color.dynamic(new Color('#F1F8F5'), new Color('#1D2A25')),
  surfaceWarm: Color.dynamic(new Color('#FFF8EF'), new Color('#2B2119')),
  text: Color.dynamic(new Color('#17231F'), new Color('#F3F8F5')),
  muted: Color.dynamic(new Color('#65736C'), new Color('#AAB8B1')),
  faint: Color.dynamic(new Color('#9BA7A0'), new Color('#6F7C76')),
  accent: Color.dynamic(new Color('#087765'), new Color('#78DFC7')),
  accentSoft: Color.dynamic(new Color('#DFF2EC'), new Color('#183B34')),
  coral: Color.dynamic(new Color('#D4614F'), new Color('#FFAA99')),
  gold: Color.dynamic(new Color('#B98422'), new Color('#F2C66D')),
  line: Color.dynamic(new Color('#DCE7E1'), new Color('#2B3934')),
};

function appFont(size, weight = 'regular') {
  if (weight === 'bold') return Font.boldSystemFont(size);
  if (weight === 'semibold') return Font.semiboldSystemFont(size);
  if (weight === 'medium') return Font.mediumSystemFont(size);
  return Font.systemFont(size);
}

function addText(stack, text, size, color, weight = 'regular', scale = 0.72) {
  const t = stack.addText(String(text == null ? '' : text));
  t.font = appFont(size, weight);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = scale;
  if (typeof t.leftAlignText === 'function') t.leftAlignText();
  return t;
}

function centerText(text) {
  if (typeof text.centerAlignText === 'function') text.centerAlignText();
  return text;
}

function addSymbol(stack, name, size, color) {
  const symbol = SFSymbol.named(name);
  const image = stack.addImage(symbol.image);
  image.tintColor = color;
  image.imageSize = new Size(size, size);
  return image;
}

function addIconBox(parent, symbolName, tintColor, backgroundColor, size = 30) {
  const box = parent.addStack();
  box.layoutHorizontally();
  box.centerAlignContent();
  box.size = new Size(size, size);
  box.cornerRadius = 9;
  box.backgroundColor = backgroundColor;
  box.addSpacer();
  addSymbol(box, symbolName, Math.round(size * 0.52), tintColor);
  box.addSpacer();
  return box;
}

function addPill(parent, text, tintColor, backgroundColor) {
  const pill = parent.addStack();
  pill.layoutHorizontally();
  pill.centerAlignContent();
  pill.backgroundColor = backgroundColor;
  pill.cornerRadius = 8;
  pill.setPadding(3, 7, 3, 7);
  centerText(addText(pill, text, 11, tintColor, 'semibold', 0.75));
  return pill;
}

function shortDate(value) {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  return `${parts[2]}.${parts[1]}`;
}

function shortTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function propertyName(item) {
  return item && item.property ? String(item.property) : '—';
}

function guestName(item) {
  if (!item || !item.guest || item.guest === '—') return '';
  return String(item.guest);
}

function platformIcon(item) {
  const platform = String((item && item.platform) || '').toLowerCase();
  if (platform.includes('airbnb')) return '🩷';
  if (platform.includes('booking')) return '🔵';
  if (platform.includes('direct')) return '🤝';
  if (item && item.icon && item.icon !== '—') return String(item.icon);
  return '•';
}

async function loadData() {
  const req = new Request(`${API_URL}&_=${Date.now()}`);
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
  widget.setPadding(16, 17, 15, 17);
  return widget;
}

function addHeader(widget, data) {
  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  addIconBox(header, HEADER_SYMBOL, colors.gold, colors.surfaceWarm, 32);
  header.addSpacer(9);

  const titleBox = header.addStack();
  titleBox.layoutVertically();
  addText(titleBox, WIDGET_TITLE, 22, colors.text, 'bold', 0.78);
  addText(titleBox, `Atrani · ${shortDate(data.date)}`, 12, colors.muted, 'medium', 0.78);

  header.addSpacer();

  const update = shortTime(data.updated_at);
  const updateBox = header.addStack();
  updateBox.layoutHorizontally();
  updateBox.centerAlignContent();
  updateBox.backgroundColor = colors.surface;
  updateBox.cornerRadius = 9;
  updateBox.borderWidth = 1;
  updateBox.borderColor = colors.line;
  updateBox.setPadding(4, 7, 4, 7);
  addSymbol(updateBox, 'clock.fill', 10, colors.faint);
  updateBox.addSpacer(4);
  addText(updateBox, update || '—', 11, colors.muted, 'semibold', 0.78);
}

function addMetric(parent, symbolName, label, value, tintColor, backgroundColor) {
  const box = parent.addStack();
  box.layoutVertically();
  box.backgroundColor = backgroundColor;
  box.cornerRadius = 12;
  box.borderWidth = 1;
  box.borderColor = colors.line;
  box.size = new Size(92, 53);
  box.setPadding(7, 8, 7, 8);

  const top = box.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  addSymbol(top, symbolName, 11, tintColor);
  top.addSpacer(5);
  addText(top, label, 9, colors.muted, 'bold', 0.8);

  box.addSpacer(3);
  const valueRow = box.addStack();
  valueRow.layoutHorizontally();
  valueRow.centerAlignContent();
  valueRow.addSpacer();
  centerText(addText(valueRow, String(value), 22, tintColor, 'bold', 0.8));
  valueRow.addSpacer();
}

function addMetrics(widget, checkIns, checkOuts, occupied) {
  const metrics = widget.addStack();
  metrics.layoutHorizontally();
  metrics.centerAlignContent();
  addMetric(metrics, 'arrow.down.circle.fill', 'ЗАЕЗДЫ', checkIns.length, colors.accent, colors.surface);
  metrics.addSpacer(8);
  addMetric(metrics, 'arrow.up.circle.fill', 'ВЫЕЗДЫ', checkOuts.length, colors.coral, colors.surface);
  metrics.addSpacer(8);
  addMetric(metrics, 'bed.double.fill', 'ЖИВУТ', occupied.length, colors.gold, colors.surface);
}

function addSection(parent, title, symbolName, count, tintColor, renderContent) {
  const section = parent.addStack();
  section.layoutVertically();
  section.backgroundColor = colors.surface;
  section.cornerRadius = 12;
  section.borderWidth = 1;
  section.borderColor = colors.line;
  section.setPadding(9, 10, 9, 10);

  const head = section.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  addSymbol(head, symbolName, 12, tintColor);
  head.addSpacer(6);
  addText(head, title, 13, colors.text, 'semibold', 0.78);
  head.addSpacer();
  addPill(head, String(count), tintColor, colors.accentSoft);

  section.addSpacer(7);
  renderContent(section);
  return section;
}

function addEmpty(parent, text) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(0, 19);
  addSymbol(row, 'checkmark.circle.fill', 11, colors.faint);
  row.addSpacer(5);
  addText(row, text, 12, colors.muted, 'medium', 0.78);
}

function addMore(parent, count) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.size = new Size(0, 18);
  row.addSpacer(23);
  addText(row, `+ еще ${count}`, 12, colors.muted, 'semibold', 0.78);
}

function addPlatformMarker(parent, item, tintColor, backgroundColor = colors.surfaceSoft) {
  const marker = parent.addStack();
  marker.layoutHorizontally();
  marker.centerAlignContent();
  marker.size = new Size(18, 18);
  marker.cornerRadius = 6;
  marker.backgroundColor = backgroundColor;
  marker.addSpacer();
  centerText(addText(marker, platformIcon(item), 10, tintColor, 'semibold', 0.7));
  marker.addSpacer();
}

function addArrivalRows(parent, items, maxRows) {
  if (!items.length) {
    addEmpty(parent, 'Заездов нет');
    return;
  }

  for (const item of items.slice(0, maxRows)) {
    const row = parent.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.size = new Size(0, 19);

    const room = row.addStack();
    room.layoutHorizontally();
    room.centerAlignContent();
    room.size = new Size(ARRIVAL_ROOM_WIDTH, 19);

    addPlatformMarker(room, item, colors.accent);
    room.addSpacer(6);
    addText(room, propertyName(item), 12, colors.text, 'semibold', 0.62);

    row.addSpacer(8);
    const guest = guestName(item);
    const guestBox = row.addStack();
    guestBox.layoutHorizontally();
    guestBox.centerAlignContent();
    guestBox.size = new Size(ARRIVAL_GUEST_WIDTH, 19);
    addText(guestBox, guest || 'Без имени', 12, guest ? colors.muted : colors.faint, 'regular', 0.54);
  }

  if (items.length > maxRows) addMore(parent, items.length - maxRows);
}

function addRoomRows(parent, items, emptyText, maxRows) {
  if (!items.length) {
    addEmpty(parent, emptyText);
    return;
  }

  for (const item of items.slice(0, maxRows)) {
    const row = parent.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.size = new Size(0, 18);
    addPlatformMarker(row, item, colors.faint, colors.surfaceSoft);
    row.addSpacer(5);
    const nameBox = row.addStack();
    nameBox.layoutHorizontally();
    nameBox.centerAlignContent();
    nameBox.size = new Size(BOTTOM_NAME_WIDTH, 18);
    addText(nameBox, propertyName(item), 11, colors.text, 'medium', 0.58);
  }

  if (items.length > maxRows) addMore(parent, items.length - maxRows);
}

function renderError(message) {
  const widget = makeBaseWidget();
  const data = { date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() };
  addHeader(widget, data);
  widget.addSpacer(12);

  addSection(
    widget,
    'Не загрузилось',
    'exclamationmark.triangle.fill',
    '!',
    colors.coral,
    (section) => {
      addText(section, message || 'Проверь URL', 13, colors.muted, 'medium', 0.72);
    }
  );

  return widget;
}

function renderWidget(data) {
  const widget = makeBaseWidget();

  const checkIns = data.check_ins || [];
  const checkOuts = data.check_outs || [];
  const occupied = data.occupied || [];

  addHeader(widget, data);
  widget.addSpacer(10);
  addMetrics(widget, checkIns, checkOuts, occupied);
  widget.addSpacer(10);

  addSection(
    widget,
    ARRIVALS_TITLE,
    'person.crop.circle.badge.plus',
    checkIns.length,
    colors.accent,
    (section) => addArrivalRows(section, checkIns, 4)
  );

  widget.addSpacer(8);

  const bottom = widget.addStack();
  bottom.layoutHorizontally();
  bottom.centerAlignContent();

  const left = bottom.addStack();
  left.layoutVertically();
  left.size = new Size(142, 94);
  addSection(
    left,
    CHECKOUTS_TITLE,
    'arrow.up.circle.fill',
    checkOuts.length,
    colors.coral,
    (section) => addRoomRows(section, checkOuts, 'Выездов нет', 3)
  );

  bottom.addSpacer(8);

  const right = bottom.addStack();
  right.layoutVertically();
  right.size = new Size(142, 94);
  addSection(
    right,
    OCCUPIED_TITLE,
    'bed.double.fill',
    occupied.length,
    colors.gold,
    (section) => addRoomRows(section, occupied, 'Никого', 3)
  );

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
