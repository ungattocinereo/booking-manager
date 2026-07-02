// JSWidget / ScriptWidget large widget: tomorrow's guest status from Booking Manager.
// Create a Large widget in JSWidget/ScriptWidget and paste this whole file as main.jsx.

const API_URL = 'https://booking-manager-cinereos-projects.vercel.app/api/bookings?widget=today&token=YOUR_WIDGET_TOKEN';
const VERCEL_BYPASS = 'YOUR_VERCEL_PROTECTION_BYPASS_TOKEN';

const MAX_ARRIVAL_ROWS = 3;
const MAX_STAY_ROWS = 5;
const MAX_CHECKOUT_ROWS = 5;
const CONTENT_WIDTH = 340;
const CARD_GAP = 8;
const METRIC_WIDTH = 108;
const BOTTOM_CARD_WIDTH = 166;
const HEADER_HEIGHT = 42;
const METRIC_HEIGHT = 52;
const ARRIVAL_SECTION_HEIGHT = 110;
const BOTTOM_SECTION_HEIGHT = 122;
const ARRIVAL_ROW_HEIGHT = 23;
const COMPACT_ROW_HEIGHT = 17;

const isDark = (() => {
  try {
    return !!(typeof $device !== 'undefined' && $device.isdarkmode && $device.isdarkmode());
  } catch (_) {
    return false;
  }
})();

const colors = isDark
  ? {
      bgTop: '#07100D',
      bgBottom: '#111B18',
      surface: '#141F1B',
      surfaceSoft: '#1B2A25',
      ink: '#F2F7F4',
      muted: '#AAB8B1',
      faint: '#6C7A73',
      arrival: '#66E2CF',
      checkout: '#FF9C8D',
      stay: '#F1C866',
      booking: '#8FB1FF',
      airbnb: '#FF93B1',
      direct: '#C4CED8',
    }
  : {
      bgTop: '#F7F8F3',
      bgBottom: '#EAF2F1',
      surface: '#FEFFFC',
      surfaceSoft: '#F1F6F3',
      ink: '#14201C',
      muted: '#62706B',
      faint: '#9AA8A1',
      arrival: '#007C78',
      checkout: '#C65648',
      stay: '#A17016',
      booking: '#2457D6',
      airbnb: '#D84670',
      direct: '#58616B',
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
  if (!value) return '--:--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function propertyMeta(item) {
  const key = String((item && item.property_id) || '').toLowerCase();
  return PROPERTY_META[key] || null;
}

function propertyName(item) {
  const meta = propertyMeta(item);
  if (meta) return meta.name;
  return item && item.property ? String(item.property) : '--';
}

function guestName(item) {
  if (!item || !item.guest || item.guest === '--') return 'без имени';
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

function fitText(value, maxLength) {
  const chars = Array.from(String(value == null ? '' : value));
  if (chars.length <= maxLength) return chars.join('');
  return chars.slice(0, Math.max(0, maxLength - 1)).join('') + '…';
}

async function loadData() {
  const url = `${API_URL}&date=${targetDate()}&_=${Date.now()}`;
  const text = await $http.get(url, {
    headers: {
      'x-vercel-protection-bypass': VERCEL_BYPASS,
    },
  });
  return JSON.parse(text);
}

const PlatformMark = ({ item, frame, size }) => {
  const symbol = platformSymbol(item);
  return <icon systemName={symbol.name} size={size || '14'} color={symbol.tint} frame={frame || '22,20,center'} />;
};

const Header = ({ data }) => {
  return (
    <row frame={`${CONTENT_WIDTH},${HEADER_HEIGHT}`} alignment="center">
      <col frame="214,42,leading" alignment="leading" spacing="0">
        <text font="24,bold,rounded" color={colors.ink} frame="214,28,leading" alignment="leading" clip="1">
          Что завтра
        </text>
        <text font="13,medium" color={colors.muted} frame="214,14,leading" alignment="leading" clip="1">
          {tomorrowLabel(data.date)}
        </text>
      </col>
      <spacer frame={`${CARD_GAP},1`} />
      <col frame="118,42,trailing" alignment="trailing" spacing="1">
        <spacer frame="1,4" />
        <text font="9,bold" color={colors.faint} frame="118,12,trailing" alignment="trailing" clip="1">
          обновлено
        </text>
        <text font="14,semibold,rounded" color={colors.muted} frame="118,18,trailing" alignment="trailing" clip="1">
          {shortTime(data.updated_at)}
        </text>
      </col>
    </row>
  );
};

const MetricCard = ({ label, value, color }) => {
  return (
    <col frame={`${METRIC_WIDTH},${METRIC_HEIGHT}`} background={colors.surface} corner="8" padding="6" spacing="1">
      <text font="10,bold" color={colors.muted} frame="96,13,center" alignment="center" clip="1">
        {label}
      </text>
      <text font="29,bold,rounded" color={color} frame="96,29,center" alignment="center" clip="1">
        {String(value)}
      </text>
    </col>
  );
};

const Metrics = ({ checkIns, checkOuts, occupied }) => {
  return (
    <row frame={`${CONTENT_WIDTH},${METRIC_HEIGHT}`} spacing={`${CARD_GAP}`}>
      <MetricCard label="Заезды" value={checkIns.length} color={colors.arrival} />
      <MetricCard label="Выезды" value={checkOuts.length} color={colors.checkout} />
      <MetricCard label="Остаются" value={occupied.length} color={colors.stay} />
    </row>
  );
};

const SectionHead = ({ title, count, width }) => {
  return (
    <row frame={`${width},18`} alignment="center">
      <text font="14,bold,rounded" color={colors.ink} frame={`${width - 40},18,leading`} alignment="leading" clip="1">
        {title}
      </text>
      <spacer />
      <text font="14,bold,rounded" color={colors.muted} frame="34,18,trailing" alignment="trailing" clip="1">
        {String(count)}
      </text>
    </row>
  );
};

const ArrivalRow = ({ item }) => {
  return (
    <row frame={`${CONTENT_WIDTH - 16},${ARRIVAL_ROW_HEIGHT}`} alignment="center" spacing="0">
      <PlatformMark item={item} frame={`22,${ARRIVAL_ROW_HEIGHT},center`} size="15" />
      <spacer frame="8,1" />
      <text font="13,semibold" color={colors.ink} frame={`88,${ARRIVAL_ROW_HEIGHT},leading`} alignment="leading" clip="1">
        {fitText(propertyName(item), 12)}
      </text>
      <spacer frame={`${CARD_GAP},1`} />
      <text font="13,medium" color={colors.ink} frame={`158,${ARRIVAL_ROW_HEIGHT},leading`} alignment="leading" clip="1">
        {fitText(guestName(item), 20)}
      </text>
      <spacer frame={`${CARD_GAP},1`} />
      <text font="11,semibold" color={colors.muted} frame={`32,${ARRIVAL_ROW_HEIGHT},trailing`} alignment="trailing" clip="1">
        {stayLength(item)}
      </text>
    </row>
  );
};

const MoreLine = ({ count, width }) => {
  return (
    <row frame={`${width},14`} alignment="center">
      <spacer />
      <text font="10,semibold" color={colors.faint} frame="48,14,trailing" alignment="trailing" clip="1">
        +{String(count)}
      </text>
    </row>
  );
};

const EmptyLine = ({ text, width }) => {
  return (
    <row frame={`${width},17`} alignment="center">
      <text font="11,medium" color={colors.faint} frame={`${width},17,leading`} alignment="leading" clip="1">
        {text}
      </text>
    </row>
  );
};

const ArrivalsSection = ({ items }) => {
  const visible = items.slice(0, MAX_ARRIVAL_ROWS);
  return (
    <col
      frame={`${CONTENT_WIDTH},${ARRIVAL_SECTION_HEIGHT},topLeading`}
      background={colors.surface}
      corner="8"
      padding="7,8,7,8"
      alignment="leading"
      spacing="1"
    >
      <SectionHead title="Заезды завтра" count={items.length} width={CONTENT_WIDTH - 16} />
      <spacer frame="1,3" />
      {items.length === 0 ? <EmptyLine text="Заездов нет" width={CONTENT_WIDTH - 16} /> : visible.map((item) => <ArrivalRow item={item} />)}
      {items.length > visible.length ? <MoreLine count={items.length - visible.length} width={CONTENT_WIDTH - 16} /> : null}
    </col>
  );
};

const CompactRow = ({ item }) => {
  return (
    <row frame={`${BOTTOM_CARD_WIDTH - 14},${COMPACT_ROW_HEIGHT}`} alignment="center" spacing="0">
      <PlatformMark item={item} frame={`20,${COMPACT_ROW_HEIGHT},center`} size="13" />
      <spacer frame="8,1" />
      <text font="11,medium" color={colors.ink} frame={`${BOTTOM_CARD_WIDTH - 42},${COMPACT_ROW_HEIGHT},leading`} alignment="leading" clip="1">
        {fitText(propertyName(item), 15)}
      </text>
    </row>
  );
};

const CompactSection = ({ title, items, maxRows }) => {
  const visible = items.slice(0, maxRows);
  return (
    <col
      frame={`${BOTTOM_CARD_WIDTH},${BOTTOM_SECTION_HEIGHT},topLeading`}
      background={colors.surface}
      corner="8"
      padding="6,7,6,7"
      alignment="leading"
      spacing="1"
    >
      <SectionHead title={title} count={items.length} width={BOTTOM_CARD_WIDTH - 14} />
      <spacer frame="1,2" />
      {items.length === 0 ? <EmptyLine text="нет" width={BOTTOM_CARD_WIDTH - 14} /> : visible.map((item) => <CompactRow item={item} />)}
      {items.length > visible.length ? <MoreLine count={items.length - visible.length} width={BOTTOM_CARD_WIDTH - 14} /> : null}
    </col>
  );
};

const BottomSections = ({ occupied, checkOuts }) => {
  return (
    <row frame={`${CONTENT_WIDTH},${BOTTOM_SECTION_HEIGHT}`} alignment="top" spacing={`${CARD_GAP}`}>
      <CompactSection title="Остаются" items={occupied} maxRows={MAX_STAY_ROWS} />
      <CompactSection title="Выезжают" items={checkOuts} maxRows={MAX_CHECKOUT_ROWS} />
    </row>
  );
};

const ErrorView = ({ message }) => {
  return (
    <col frame="max,topLeading" background={colors.bgTop} padding="8" alignment="leading" spacing="5">
      <Header data={{ date: targetDate() }} />
      <col frame={`${CONTENT_WIDTH},110,topLeading`} background={colors.surface} corner="8" padding="8" alignment="leading" spacing="6">
        <SectionHead title="Не загрузилось" count="!" width={CONTENT_WIDTH - 16} />
        <text font="13,medium" color={colors.muted} frame={`${CONTENT_WIDTH - 16},58,leading`} alignment="leading" clip="1">
          {fitText(message || 'Проверь URL и токены', 86)}
        </text>
      </col>
    </col>
  );
};

const MainView = ({ data }) => {
  const checkIns = (data.check_ins || []).slice().sort(compareByProperty);
  const checkOuts = (data.check_outs || []).slice().sort(compareByProperty);
  const occupied = (data.occupied || []).slice().sort(compareByProperty);

  return (
    <col frame="max,topLeading" background={colors.bgTop} padding="8" alignment="leading" spacing="5">
      <Header data={data} />
      <Metrics checkIns={checkIns} checkOuts={checkOuts} occupied={occupied} />
      <ArrivalsSection items={checkIns} />
      <BottomSections occupied={occupied} checkOuts={checkOuts} />
    </col>
  );
};

let data = null;
let loadError = null;

try {
  const result = await loadData();
  if (result && result.status === 'ok') {
    data = result;
  } else {
    loadError = (result && result.error) || 'Сервер вернул ошибку';
  }
} catch (error) {
  loadError = String(error && error.message ? error.message : error);
}

const widget = data ? <MainView data={data} /> : <ErrorView message={loadError} />;

$render(widget);
