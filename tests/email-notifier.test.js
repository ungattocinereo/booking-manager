const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { formatCancelledAt } = require('../monitor-app/email-notifier/i18n');
const { emptyState, eventId } = require('../monitor-app/email-notifier/dedupe');
const {
  bookingLink,
  buildSubject,
  renderMessage
} = require('../monitor-app/email-notifier/template');
const {
  run,
  selectNotificationEvents,
  sendViaMailgun
} = require('../monitor-app/email-notifier/send');

const NOW = new Date('2026-09-01T07:17:00.000Z');

function booking(overrides = {}) {
  return {
    bookingKey: 'harmony|airbnb|2026-09-20|2026-09-24',
    propertyId: 'harmony',
    platform: 'airbnb',
    startDate: '2026-09-20',
    endDate: '2026-09-24',
    guestName: 'Mario Rossi',
    confirmationCode: 'HM123ABC',
    firstSeenAt: '2026-08-20T08:00:00.000Z',
    status: 'cancelled',
    cancelledAt: '2026-08-31T06:00:00.000Z',
    link: 'https://www.airbnb.com/hosting/reservations/details/HM123ABC',
    ...overrides
  };
}

function monitor(...events) {
  return {
    properties: [
      { id: 'harmony', events: events.filter(event => event.propertyId === 'harmony') },
      { id: 'royal', events: events.filter(event => event.propertyId === 'royal') },
      { id: 'carina', events: events.filter(event => event.propertyId === 'carina') }
    ]
  };
}

test('a recent cancellation is selected even when there are no new bookings', () => {
  const cancelled = booking();
  const selected = selectNotificationEvents(monitor(cancelled), { now: NOW });
  assert.equal(selected.created.length, 0);
  assert.equal(selected.cancelled.length, 1);
  assert.equal(selected.cancelled[0].id, eventId('cancelled', cancelled));
});

test('notification selection excludes old, unrelated, and already sent events', () => {
  const sentCancellation = booking();
  const recentBooking = booking({
    bookingKey: 'royal|airbnb|2026-10-01|2026-10-03',
    propertyId: 'royal',
    status: 'active',
    firstSeenAt: '2026-09-01T05:00:00.000Z',
    cancelledAt: null
  });
  const oldCancellation = booking({
    bookingKey: 'carina|airbnb|2026-09-10|2026-09-12',
    propertyId: 'carina',
    cancelledAt: '2026-08-29T05:00:00.000Z'
  });
  const selected = selectNotificationEvents(monitor(sentCancellation, recentBooking, oldCancellation), {
    now: NOW,
    sentIds: new Set([eventId('cancelled', sentCancellation)])
  });
  assert.deepEqual(selected.created.map(event => event.booking.bookingKey), [recentBooking.bookingKey]);
  assert.equal(selected.cancelled.length, 0);
});

test('cancellation-only message has the correct subject, timezone, and safe HTML', () => {
  const cancelled = booking({
    guestName: '<Mario & Figli>',
    confirmationCode: null,
    link: 'javascript:alert(1)',
    cancelledAt: '2026-08-31T23:15:00.000Z'
  });
  const event = {
    id: eventId('cancelled', cancelled),
    type: 'cancelled',
    occurredAt: cancelled.cancelledAt,
    booking: cancelled
  };
  const message = renderMessage({ created: [], cancelled: [event], now: NOW });
  assert.equal(buildSubject({ created: [], cancelled: [event], now: NOW }), 'Prenotazione annullata — Harmony');
  assert.match(message.text, /Annullata il martedì 1 settembre alle 01:15/);
  assert.match(message.html, /&lt;Mario &amp; Figli&gt;/);
  assert.doesNotMatch(message.html, /javascript:/);
  assert.match(bookingLink(cancelled), /hosting\/listings\/37988248\/calendar\?date=2026-09-20/);
});

test('missing guest name does not render a placeholder', () => {
  const cancelled = booking({ guestName: null });
  const event = { id: eventId('cancelled', cancelled), type: 'cancelled', occurredAt: cancelled.cancelledAt, booking: cancelled };
  const message = renderMessage({ created: [], cancelled: [event], now: NOW });
  assert.doesNotMatch(message.html, /senza nome|ospite sconosciuto/i);
  assert.doesNotMatch(message.text, /senza nome|ospite sconosciuto/i);
});

test('Italian timestamps use Europe/Rome daylight-saving time', () => {
  assert.equal(
    formatCancelledAt('2026-08-31T23:15:00.000Z'),
    'Annullata il martedì 1 settembre alle 01:15'
  );
});

test('Mailgun retries a transient failure and sends multipart HTML and text', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return new Response('temporary', { status: 500 });
    return new Response(JSON.stringify({ id: '<message@example>', message: 'Queued. Thank you.' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  const result = await sendViaMailgun({ subject: 'Test', html: '<p>Test</p>', text: 'Test' }, {
    apiKey: 'test-key',
    to: ['recipient@example.com'],
    fetchImpl,
    sleep: async () => {}
  });
  assert.equal(result.id, '<message@example>');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.eu.mailgun.net/v3/amalfi.day/messages');
  assert.equal(calls[1].options.body.get('subject'), 'Test');
  assert.equal(calls[1].options.body.get('html'), '<p>Test</p>');
  assert.equal(calls[1].options.body.get('text'), 'Test');
});

test('a sent cancellation is persisted and not sent twice', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atrani-email-'));
  const statePath = path.join(directory, 'email-sent.json');
  const cancelled = booking();
  let sendCount = 0;
  const send = async () => {
    sendCount += 1;
    return { id: '<mailgun-message>' };
  };
  try {
    const first = await run({ monitor: monitor(cancelled), now: NOW, statePath, send, env: {} });
    const second = await run({ monitor: monitor(cancelled), now: NOW, statePath, send, env: {} });
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(first.sent, true);
    assert.equal(second.sent, false);
    assert.equal(second.reason, 'no-events');
    assert.equal(sendCount, 1);
    assert.equal(state.sentEvents.length, 1);
    assert.equal(state.lastMessageId, '<mailgun-message>');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('empty state has no remembered event ids', () => {
  assert.deepEqual(emptyState().sentEvents, []);
});
