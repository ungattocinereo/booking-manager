const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STATE_VERSION = 1;
const RETENTION_DAYS = 90;

function emptyState() {
  return {
    version: STATE_VERSION,
    lastRunIso: null,
    lastSentIso: null,
    lastDigestHash: null,
    lastSubject: null,
    lastMessageId: null,
    sentEvents: []
  };
}

function loadState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      ...emptyState(),
      ...parsed,
      sentEvents: Array.isArray(parsed.sentEvents) ? parsed.sentEvents : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw new Error(`Cannot read email state at ${statePath}: ${error.message}`);
  }
}

function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, statePath);
}

function eventId(type, booking) {
  const occurredAt = type === 'cancelled' ? booking.cancelledAt : booking.firstSeenAt;
  return `${type}:${booking.bookingKey}:${occurredAt}`;
}

function digestEventIds(ids) {
  return crypto.createHash('sha256').update([...ids].sort().join('\n')).digest('hex');
}

function sentEventIdSet(state) {
  return new Set((state.sentEvents || []).map(event => event.id).filter(Boolean));
}

function recordRun(state, { now, events = [], subject = null, messageId = null, sent = false }) {
  const nowIso = new Date(now).toISOString();
  const cutoff = new Date(new Date(now).getTime() - RETENTION_DAYS * 86400000);
  const retained = (state.sentEvents || []).filter(event => {
    const sentAt = new Date(event.sentAt);
    return !Number.isNaN(sentAt.getTime()) && sentAt >= cutoff;
  });
  const known = new Set(retained.map(event => event.id));

  if (sent) {
    for (const event of events) {
      if (known.has(event.id)) continue;
      retained.push({
        id: event.id,
        type: event.type,
        bookingKey: event.booking.bookingKey,
        occurredAt: event.occurredAt,
        sentAt: nowIso
      });
      known.add(event.id);
    }
  }

  return {
    ...state,
    version: STATE_VERSION,
    lastRunIso: nowIso,
    lastSentIso: sent ? nowIso : state.lastSentIso,
    lastDigestHash: sent ? digestEventIds(events.map(event => event.id)) : state.lastDigestHash,
    lastSubject: sent ? subject : state.lastSubject,
    lastMessageId: sent ? messageId : state.lastMessageId,
    sentEvents: retained
  };
}

module.exports = {
  RETENTION_DAYS,
  digestEventIds,
  emptyState,
  eventId,
  loadState,
  recordRun,
  saveState,
  sentEventIdSet
};
