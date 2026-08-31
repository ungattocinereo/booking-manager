const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const ROOT = path.resolve(__dirname, '..');

class MockNode {
  constructor(root = null) {
    this.root = root || this;
    this.children = [];
    if (!root) this.texts = [];
  }

  addStack() {
    const child = new MockNode(this.root);
    this.children.push(child);
    return child;
  }

  addText(value) {
    const text = {
      value: String(value),
      centerAlignText() {},
      rightAlignText() {},
      leftAlignText() {},
    };
    this.root.texts.push(text.value);
    this.children.push(text);
    return text;
  }

  addImage() {
    const image = {};
    this.children.push(image);
    return image;
  }

  addSpacer(value) {
    this.children.push({ spacer: true, value });
  }

  layoutHorizontally() {}
  layoutVertically() {}
  centerAlignContent() {}
  topAlignContent() {}
  setPadding() {}
}

class MockListWidget extends MockNode {
  async presentLarge() {}
}

class MockColor {
  constructor(value) {
    this.value = value;
  }

  static dynamic(light, dark) {
    return { light, dark };
  }
}

class MockRequest {
  constructor() {}
  async loadJSON() {
    return MockRequest.payload;
  }
}

async function renderWidget(filename, payload) {
  const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  const captured = {};
  MockRequest.payload = payload;

  const run = new AsyncFunction(
    'Request',
    'ListWidget',
    'LinearGradient',
    'Color',
    'Font',
    'Size',
    'SFSymbol',
    'config',
    'Script',
    source
  );

  await run(
    MockRequest,
    MockListWidget,
    class LinearGradient {},
    MockColor,
    {
      boldSystemFont: size => ({ size, weight: 'bold' }),
      semiboldSystemFont: size => ({ size, weight: 'semibold' }),
      mediumSystemFont: size => ({ size, weight: 'medium' }),
      systemFont: size => ({ size, weight: 'regular' }),
    },
    class Size {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }
    },
    { named: name => ({ image: name }) },
    { runsInWidget: true },
    {
      setWidget(widget) {
        captured.widget = widget;
      },
      complete() {},
    }
  );

  return captured.widget;
}

function booking(propertyId, guest, nights, platform = 'Booking.com') {
  return {
    property_id: propertyId,
    guest,
    nights,
    platform,
    start: '2026-08-31',
    end: '2026-09-02',
  };
}

test('tracked Scriptable widgets keep secrets as placeholders', () => {
  const files = [
    'scriptable-widgets/iphone-bookings-widget-today.js',
    'scriptable-widgets/iphone-bookings-widget-tomorrow.js',
    'scriptable-tomorrow-widget-large-font.js',
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(source, /token=YOUR_WIDGET_TOKEN/);
    assert.match(source, /YOUR_VERCEL_PROTECTION_BYPASS_TOKEN/);
  }
});

test('arrival-first widget keeps five detailed arrivals and pins compact check-outs last', async () => {
  const widget = await renderWidget('scriptable-widgets/iphone-bookings-widget-today.js', {
    status: 'ok',
    date: '2026-08-31',
    updated_at: '2026-08-31T10:15:00.000Z',
    check_ins: [
      booking('carmela', 'Guest 6', 6, 'direct'),
      booking('awesome', 'Guest 1', 1, 'Airbnb'),
      booking('central', 'Guest 2', 2),
      booking('orange', 'Guest 3', 5),
      booking('vingtage', 'Guest 4', 11),
      booking('youth', 'Guest 5', 21),
    ],
    check_outs: [
      booking('awesome', 'Leaving 1', 1),
      booking('central', 'Leaving 2', 1),
      booking('orange', 'Leaving 3', 1),
      booking('vingtage', 'Leaving 4', 1),
      booking('youth', 'Leaving 5', 1),
    ],
    occupied: [booking('solo', 'Occupied guest', 7)],
  });

  assert.ok(widget);
  assert.ok(widget.texts.includes('5/6'));
  assert.ok(widget.texts.includes('Guest 1'));
  assert.ok(widget.texts.includes('Guest 5'));
  assert.ok(!widget.texts.includes('Guest 6'));
  assert.ok(!widget.texts.includes('Occupied guest'));
  assert.ok(widget.texts.includes('1 ночь'));
  assert.ok(widget.texts.includes('2 ночи'));
  assert.ok(widget.texts.includes('5 ночей'));
  assert.ok(widget.texts.includes('Awesome · Central · Orange · Vingtage · +1'));

  const lastChild = widget.children.at(-1);
  assert.equal(lastChild.size.height, 54);
  assert.deepEqual(widget.children.at(-2), { spacer: true, value: undefined });
});

test('tomorrow widget renders the arrival-first copy', async () => {
  const widget = await renderWidget('scriptable-widgets/iphone-bookings-widget-tomorrow.js', {
    status: 'ok',
    date: '2026-09-01',
    updated_at: '2026-08-31T10:15:00.000Z',
    check_ins: [booking('awesome', 'Tomorrow guest', 3, 'Airbnb')],
    check_outs: [],
    occupied: [],
  });

  assert.ok(widget.texts.includes('Что завтра'));
  assert.ok(widget.texts.includes('Tomorrow guest'));
  assert.ok(widget.texts.includes('Awesome · Airbnb'));
  assert.ok(widget.texts.includes('3 ночи'));
  assert.ok(widget.texts.includes('Выездов нет'));
});
