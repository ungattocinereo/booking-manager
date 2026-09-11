#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const {
  eventId,
  loadState,
  recordRun,
  saveState,
  sentEventIdSet
} = require('./dedupe');
const { PROPERTY_ORDER, renderMessage } = require('./template');

const DEFAULT_MONITOR_URL = 'https://ungattocinereo.github.io/booking-manager/data/monitor.json';
const DEFAULT_STATE_PATH = path.join(__dirname, '..', 'data', 'email-sent.json');
const DEFAULT_RECIPIENTS = ['dipinorosario@gmail.com', 'greg@cinereo.it'];
const DEFAULT_WINDOW_HOURS = 48;
const MAX_SEND_ATTEMPTS = 4;

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function parseRecipients(value) {
  const recipients = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return recipients.length ? recipients : DEFAULT_RECIPIENTS;
}

function flattenBookings(monitor) {
  if (!monitor || !Array.isArray(monitor.properties)) {
    throw new Error('Monitor JSON does not contain a properties array');
  }
  return monitor.properties.flatMap(property => Array.isArray(property.events) ? property.events : []);
}

function occurredWithin(value, cutoff, now) {
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime()) && timestamp >= cutoff && timestamp <= now;
}

function selectNotificationEvents(monitor, {
  now = new Date(),
  windowHours = DEFAULT_WINDOW_HOURS,
  sentIds = new Set()
} = {}) {
  const currentTime = new Date(now);
  if (Number.isNaN(currentTime.getTime())) throw new Error(`Invalid current time: ${now}`);
  const cutoff = new Date(currentTime.getTime() - Number(windowHours) * 3600000);
  const allowedProperties = new Set(PROPERTY_ORDER);
  const unique = new Map();

  for (const booking of flattenBookings(monitor)) {
    if (!allowedProperties.has(booking.propertyId) || !booking.bookingKey) continue;
    let type = null;
    let occurredAt = null;
    if (booking.status === 'cancelled' && occurredWithin(booking.cancelledAt, cutoff, currentTime)) {
      type = 'cancelled';
      occurredAt = booking.cancelledAt;
    } else if (booking.status === 'active' && occurredWithin(booking.firstSeenAt, cutoff, currentTime)) {
      type = 'created';
      occurredAt = booking.firstSeenAt;
    }
    if (!type) continue;
    const id = eventId(type, booking);
    if (!sentIds.has(id)) unique.set(id, { id, type, occurredAt, booking });
  }

  const events = [...unique.values()];
  const order = new Map(PROPERTY_ORDER.map((propertyId, index) => [propertyId, index]));
  events.sort((left, right) => {
    const timeDifference = new Date(right.occurredAt) - new Date(left.occurredAt);
    return timeDifference || order.get(left.booking.propertyId) - order.get(right.booking.propertyId);
  });
  return {
    created: events.filter(event => event.type === 'created'),
    cancelled: events.filter(event => event.type === 'cancelled'),
    events,
    cutoff
  };
}

async function fetchMonitor({ monitorPath, monitorUrl = DEFAULT_MONITOR_URL, fetchImpl = fetch }) {
  if (monitorPath) {
    return JSON.parse(fs.readFileSync(monitorPath, 'utf8'));
  }
  const separator = monitorUrl.includes('?') ? '&' : '?';
  const response = await fetchImpl(`${monitorUrl}${separator}t=${Date.now()}`, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Monitor fetch failed with HTTP ${response.status}`);
  return response.json();
}

function mailgunRequestBody({ from, to, replyTo, subject, html, text }) {
  const body = new FormData();
  body.append('from', from);
  for (const recipient of to) body.append('to', recipient);
  body.append('subject', subject);
  body.append('html', html);
  body.append('text', text);
  body.append('h:Reply-To', replyTo);
  body.append('o:tag', 'monitor-atrani');
  return body;
}

async function sendViaMailgun(message, {
  apiKey,
  domain = 'amalfi.day',
  apiBase = 'https://api.eu.mailgun.net',
  from = 'Monitor Atrani <monitor@amalfi.day>',
  to = DEFAULT_RECIPIENTS,
  replyTo = 'greg@cinereo.it',
  fetchImpl = fetch,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  maxAttempts = MAX_SEND_ATTEMPTS
} = {}) {
  if (!apiKey) throw new Error('MAILGUN_API_KEY is required');
  if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('MAILGUN_DOMAIN is invalid');
  const endpoint = `${apiBase.replace(/\/$/, '')}/v3/${domain}/messages`;
  const authorization = `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { authorization },
        body: mailgunRequestBody({ from, to, replyTo, ...message })
      });
    } catch (error) {
      if (attempt === maxAttempts) throw new Error(`Mailgun request failed after ${attempt} attempts: ${error.message}`);
      await sleep(500 * (2 ** (attempt - 1)));
      continue;
    }

    if (response.ok) {
      const result = await response.json();
      if (!result.id) throw new Error('Mailgun accepted the request without returning a message id');
      return result;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      const errorBody = (await response.text()).slice(0, 300).replace(/\s+/g, ' ');
      throw new Error(`Mailgun returned HTTP ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
    }
    await sleep(500 * (2 ** (attempt - 1)));
  }
  throw new Error('Mailgun send exhausted all attempts');
}

async function run(options = {}) {
  const env = options.env || process.env;
  const now = options.now || new Date();
  const dryRun = options.dryRun ?? parseBoolean(env.DRY_RUN);
  const statePath = options.statePath || env.EMAIL_STATE_PATH || DEFAULT_STATE_PATH;
  const monitor = options.monitor || await fetchMonitor({
    monitorPath: env.MONITOR_JSON_PATH,
    monitorUrl: env.MONITOR_URL || DEFAULT_MONITOR_URL,
    fetchImpl: options.fetchImpl || fetch
  });
  const state = loadState(statePath);
  const selected = selectNotificationEvents(monitor, {
    now,
    windowHours: Number(env.EMAIL_WINDOW_HOURS || DEFAULT_WINDOW_HOURS),
    sentIds: sentEventIdSet(state)
  });

  if (!selected.events.length) {
    if (!dryRun) saveState(statePath, recordRun(state, { now }));
    console.log('No unsent booking or cancellation events in the notification window.');
    return { sent: false, reason: 'no-events', ...selected };
  }

  const message = renderMessage({ ...selected, now });
  if (dryRun) {
    console.log(`[dry-run] ${message.subject}`);
    console.log(`[dry-run] ${selected.created.length} new, ${selected.cancelled.length} cancelled`);
    return { sent: false, reason: 'dry-run', message, ...selected };
  }

  const send = options.send || (email => sendViaMailgun(email, {
    apiKey: env.MAILGUN_API_KEY,
    domain: env.MAILGUN_DOMAIN || 'amalfi.day',
    apiBase: env.MAILGUN_API_BASE || 'https://api.eu.mailgun.net',
    from: env.EMAIL_FROM || 'Monitor Atrani <monitor@amalfi.day>',
    to: parseRecipients(env.EMAIL_TO),
    replyTo: env.EMAIL_REPLY_TO || 'greg@cinereo.it',
    fetchImpl: options.fetchImpl || fetch,
    sleep: options.sleep
  }));
  const result = await send(message);
  const nextState = recordRun(state, {
    now,
    events: selected.events,
    subject: message.subject,
    messageId: result.id,
    sent: true
  });
  saveState(statePath, nextState);
  console.log(`Email queued by Mailgun (${selected.created.length} new, ${selected.cancelled.length} cancelled).`);
  return { sent: true, messageId: result.id, message, ...selected };
}

if (require.main === module) {
  run().catch(error => {
    console.error(`Email notifier failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_MONITOR_URL,
  DEFAULT_RECIPIENTS,
  DEFAULT_STATE_PATH,
  DEFAULT_WINDOW_HOURS,
  fetchMonitor,
  flattenBookings,
  mailgunRequestBody,
  parseBoolean,
  parseRecipients,
  run,
  selectNotificationEvents,
  sendViaMailgun
};
