const {
  formatBookedAt,
  formatCancelledAt,
  formatStay,
  formatSubjectDate,
  formatToday,
  nights,
  nightsLabel
} = require('./i18n');

const MONITOR_URL = 'https://ungattocinereo.github.io/booking-manager/';
const PROPERTY_ORDER = ['harmony', 'royal', 'carina'];
const PROPERTIES = {
  harmony: { name: 'Harmony', accent: '#c9512e', listingId: '37988248' },
  royal: { name: 'Royal', accent: '#1f3d8a', listingId: '973032288955949308' },
  carina: { name: 'Carina', accent: '#0b7a7a', listingId: '20551225' }
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function trustedAirbnbUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !['airbnb.com', 'www.airbnb.com', 'airbnb.it', 'www.airbnb.it'].includes(host)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function bookingLink(booking) {
  const direct = trustedAirbnbUrl(booking.link);
  if (direct) return direct;
  if (booking.confirmationCode && /^[A-Z0-9]+$/i.test(booking.confirmationCode)) {
    return `https://www.airbnb.com/hosting/reservations/details/${encodeURIComponent(booking.confirmationCode)}`;
  }
  const property = PROPERTIES[booking.propertyId];
  if (!property) return MONITOR_URL;
  return `https://www.airbnb.com/hosting/listings/${property.listingId}/calendar?date=${encodeURIComponent(booking.startDate)}`;
}

function groupByProperty(events) {
  return PROPERTY_ORDER.map(propertyId => ({
    propertyId,
    property: PROPERTIES[propertyId],
    events: events.filter(event => event.booking.propertyId === propertyId)
  })).filter(group => group.events.length > 0);
}

function countPill(count, cancelled = false) {
  if (cancelled) return `${count} ${count === 1 ? 'annullata' : 'annullate'}`;
  return `${count} ${count === 1 ? 'nuova' : 'nuove'}`;
}

function buildSubject({ created, cancelled, now }) {
  const date = formatSubjectDate(now);
  if (created.length === 0 && cancelled.length === 1) {
    return `Prenotazione annullata — ${PROPERTIES[cancelled[0].booking.propertyId].name}`;
  }
  if (created.length === 0) {
    return `Prenotazioni annullate · ${cancelled.length} — ${date}`;
  }
  if (created.length === 1) {
    const booking = created[0].booking;
    const cancellationSuffix = cancelled.length ? ` · ${cancelled.length} ${cancelled.length === 1 ? 'annullata' : 'annullate'}` : '';
    return `Nuova prenotazione — ${PROPERTIES[booking.propertyId].name} (${nightsLabel(nights(booking.startDate, booking.endDate))}) · ${date}${cancellationSuffix}`;
  }
  const counts = groupByProperty(created)
    .map(group => `${group.events.length} in ${group.property.name}`)
    .join(', ');
  const cancellationSuffix = cancelled.length ? ` · ${cancelled.length} ${cancelled.length === 1 ? 'annullata' : 'annullate'}` : '';
  return `Nuove prenotazioni · ${counts} — ${date}${cancellationSuffix}`;
}

function renderMeta(booking, type) {
  const timestamp = type === 'cancelled'
    ? formatCancelledAt(booking.cancelledAt)
    : formatBookedAt(booking.firstSeenAt);
  const code = booking.confirmationCode
    ? ` <span style="font-family:Menlo,Consolas,monospace;font-size:11px;font-style:normal;letter-spacing:0.04em;border:1px solid #d9cfb8;border-radius:3px;padding:2px 5px;white-space:nowrap;">${escapeHtml(booking.confirmationCode)}</span>`
    : '';
  return `${escapeHtml(timestamp)}${code}`;
}

function renderCard(event, { cancelled = false, showProperty = false } = {}) {
  const booking = event.booking;
  const property = PROPERTIES[booking.propertyId];
  const strike = cancelled ? 'text-decoration:line-through;' : '';
  const guest = booking.guestName
    ? `<div style="font-size:18px;line-height:1.35;margin-top:7px;${strike}">${escapeHtml(booking.guestName)}</div>`
    : '';
  const propertyLabel = showProperty
    ? `<div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${property.accent};margin-bottom:7px;">${escapeHtml(property.name)}</div>`
    : '';
  const cancellationBadge = cancelled
    ? `<span style="display:inline-block;margin-top:10px;border-radius:999px;background:#f8ded8;color:#9a2417;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.08em;padding:5px 8px;">ANNULLATA</span>`
    : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 12px;border:1px solid #d9cfb8;border-left:4px solid ${property.accent};background:#fffdf7;">
      <tr>
        <td style="padding:0;">
          <a href="${escapeHtml(bookingLink(booking))}" target="_blank" rel="noopener" style="display:block;color:#1d1509;text-decoration:none;padding:18px 20px;">
            ${propertyLabel}
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.2;${strike}">${escapeHtml(formatStay(booking.startDate, booking.endDate))}</div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#6e6454;margin-top:4px;${strike}">${escapeHtml(nightsLabel(nights(booking.startDate, booking.endDate)))}</div>
            ${guest}
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;line-height:1.5;color:${cancelled ? '#9a2417' : '#6e6454'};margin-top:10px;">${renderMeta(booking, event.type)}</div>
            ${cancellationBadge}
          </a>
        </td>
      </tr>
    </table>`;
}

function renderCreatedSections(created) {
  return groupByProperty(created).map(group => `
    <tr>
      <td style="padding:25px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:#1d1509;">${escapeHtml(group.property.name)}</td>
            <td align="right" style="text-align:right;"><span style="display:inline-block;border-radius:999px;background:${group.property.accent};color:#fff;font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:6px 10px;">${escapeHtml(countPill(group.events.length))}</span></td>
          </tr>
        </table>
        <div style="height:14px;line-height:14px;">&nbsp;</div>
        ${group.events.map(event => renderCard(event)).join('')}
      </td>
    </tr>`).join('');
}

function renderCancelledSection(cancelled) {
  if (!cancelled.length) return '';
  return `
    <tr>
      <td style="padding:28px 28px 4px;">
        <div style="border-top:1px solid #d9cfb8;padding-top:24px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.25;color:#9a2417;">Prenotazioni annullate</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#7a6f5d;margin:5px 0 14px;">Cancellazioni rilevate nelle ultime 48 ore</div>
          ${cancelled.map(event => renderCard(event, { cancelled: true, showProperty: true })).join('')}
        </div>
      </td>
    </tr>`;
}

function renderHtml({ created, cancelled, now }) {
  const onlyCancellations = created.length === 0;
  const title = onlyCancellations ? 'Prenotazioni annullate' : 'Nuove Prenotazioni';
  const subtitle = onlyCancellations
    ? `Cancellazioni rilevate nelle ultime 48 ore — ${formatToday(now)}`
    : `Riepilogo delle ultime 48 ore — ${formatToday(now)}`;

  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#faf5e7;color:#1d1509;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#faf5e7;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;background:#fffdf7;border:1px solid #d9cfb8;">
            <tr>
              <td style="padding:34px 28px 28px;border-bottom:1px solid #d9cfb8;">
                <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.18em;color:#8a4a31;">ATRANI · COSTIERA AMALFITANA</div>
                <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:38px;font-weight:400;line-height:1.08;margin:10px 0 8px;color:#1d1509;">${escapeHtml(title)}</h1>
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;font-style:italic;line-height:1.45;color:#6e6454;">${escapeHtml(subtitle)}</div>
              </td>
            </tr>
            ${renderCreatedSections(created)}
            ${renderCancelledSection(cancelled)}
            <tr>
              <td style="padding:24px 28px 30px;">
                <div style="border-top:1px solid #d9cfb8;padding-top:18px;font-family:Arial,sans-serif;font-size:11px;line-height:1.55;color:#7a6f5d;">
                  Generato da Monitor Atrani · vedi tutto in tempo reale su
                  <a href="${MONITOR_URL}" target="_blank" rel="noopener" style="color:#8a4a31;">Monitor Atrani</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderTextEvent(event, type) {
  const booking = event.booking;
  const guest = booking.guestName ? ` — ${booking.guestName}` : '';
  const code = booking.confirmationCode ? ` · ${booking.confirmationCode}` : '';
  const meta = type === 'cancelled' ? formatCancelledAt(booking.cancelledAt) : formatBookedAt(booking.firstSeenAt);
  return `• ${formatStay(booking.startDate, booking.endDate)} (${nightsLabel(nights(booking.startDate, booking.endDate))})${guest}\n  ${meta}${code}\n  ${bookingLink(booking)}`;
}

function renderText({ created, cancelled, now }) {
  const lines = [];
  if (created.length) {
    lines.push(`NUOVE PRENOTAZIONI — riepilogo ultime 48 ore (${formatToday(now)})`);
    for (const group of groupByProperty(created)) {
      lines.push('', group.property.name.toUpperCase(), ...group.events.map(event => renderTextEvent(event, 'created')));
    }
  }
  if (cancelled.length) {
    if (!lines.length) lines.push(`PRENOTAZIONI ANNULLATE — ultime 48 ore (${formatToday(now)})`);
    lines.push('', 'PRENOTAZIONI ANNULLATE');
    for (const event of cancelled) {
      lines.push(`${PROPERTIES[event.booking.propertyId].name.toUpperCase()}\n${renderTextEvent(event, 'cancelled')}`);
    }
  }
  lines.push('', '— Monitor Atrani', `  ${MONITOR_URL}`);
  return lines.join('\n');
}

function renderMessage({ created, cancelled, now }) {
  if (!created.length && !cancelled.length) throw new Error('Cannot render an empty email');
  return {
    subject: buildSubject({ created, cancelled, now }),
    html: renderHtml({ created, cancelled, now }),
    text: renderText({ created, cancelled, now })
  };
}

module.exports = {
  MONITOR_URL,
  PROPERTIES,
  PROPERTY_ORDER,
  bookingLink,
  buildSubject,
  escapeHtml,
  groupByProperty,
  renderHtml,
  renderMessage,
  renderText,
  trustedAirbnbUrl
};
