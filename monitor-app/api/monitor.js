const { withClient } = require('../lib/db');
const { PROPERTIES, PROPERTY_IDS } = require('../lib/properties');

const DEFAULT_SINCE = '2026-04-17';

function toIsoDate(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function parseAsOf(param) {
  if (!param) return null;
  const d = new Date(param);
  if (isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(param)) {
    return new Date(`${param}T23:59:59.999Z`);
  }
  return d;
}

function reservationUrl(ev, listingId) {
  if (ev.reservation_url) return ev.reservation_url;
  if (ev.platform === 'airbnb' && listingId) {
    const date = ev.start_date ? `?date=${toIsoDate(ev.start_date)}` : '';
    return `https://www.airbnb.com/hosting/listings/${listingId}/calendar${date}`;
  }
  return null;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const asOfParam = url.searchParams.get('as_of');
  const sinceParam = url.searchParams.get('since') || DEFAULT_SINCE;

  const asOf = parseAsOf(asOfParam) || new Date();
  const since = sinceParam;

  try {
    const payload = await withClient(async (client) => {
      const { rows } = await client.query(`
        SELECT id, property_id, platform, event_type, booking_key,
               start_date, end_date, guest_name, reservation_url,
               confirmation_code, source, source_ref, detected_at,
               booking_created_at
        FROM monitor_booking_events
        WHERE detected_at <= $1
          AND property_id = ANY($2::text[])
        ORDER BY booking_key, id ASC
      `, [asOf.toISOString(), PROPERTY_IDS]);

      const byKey = new Map();
      for (const r of rows) {
        if (!byKey.has(r.booking_key)) {
          byKey.set(r.booking_key, {
            bookingKey: r.booking_key,
            propertyId: r.property_id,
            platform: r.platform,
            startDate: toIsoDate(r.start_date),
            endDate: toIsoDate(r.end_date),
            guestName: r.guest_name,
            reservationUrl: r.reservation_url,
            confirmationCode: r.confirmation_code,
            bookingCreatedAt: r.booking_created_at,
            firstSeenAt: r.detected_at,
            lastEvent: r.event_type,
            cancelledAt: null,
            sources: new Set([r.source])
          });
        } else {
          const agg = byKey.get(r.booking_key);
          agg.lastEvent = r.event_type;
          if (r.event_type === 'cancelled') agg.cancelledAt = r.detected_at;
          if (r.event_type !== 'cancelled' && r.guest_name) agg.guestName = r.guest_name;
          if (r.reservation_url) agg.reservationUrl = r.reservation_url;
          if (r.confirmation_code) agg.confirmationCode = r.confirmation_code;
          if (r.booking_created_at) agg.bookingCreatedAt = r.booking_created_at;
          agg.sources.add(r.source);
        }
      }

      const sinceDate = new Date(`${since}T00:00:00.000Z`);
      const eligible = [];
      for (const agg of byKey.values()) {
        const firstSeen = agg.bookingCreatedAt || agg.firstSeenAt;
        const firstSeenIso = firstSeen ? new Date(firstSeen).toISOString() : null;
        if (!firstSeenIso) continue;
        if (new Date(firstSeenIso) < sinceDate) {
          if (agg.lastEvent === 'cancelled' && agg.cancelledAt && new Date(agg.cancelledAt) >= sinceDate) {
          } else {
            continue;
          }
        }
        const listingId = PROPERTIES.find(p => p.id === agg.propertyId)?.listingId;
        eligible.push({
          bookingKey: agg.bookingKey,
          propertyId: agg.propertyId,
          platform: agg.platform,
          startDate: agg.startDate,
          endDate: agg.endDate,
          guestName: agg.guestName,
          confirmationCode: agg.confirmationCode,
          firstSeenAt: firstSeen,
          status: agg.lastEvent === 'cancelled' ? 'cancelled' : 'active',
          cancelledAt: agg.cancelledAt,
          link: reservationUrl({
            reservation_url: agg.reservationUrl,
            platform: agg.platform,
            start_date: agg.startDate
          }, listingId),
          sources: Array.from(agg.sources)
        });
      }

      eligible.sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt));

      const grouped = PROPERTIES.map(p => ({
        id: p.id,
        name: p.name,
        accent: p.accent,
        icon: p.icon,
        events: eligible.filter(e => e.propertyId === p.id)
      }));

      const { rows: dateRows } = await client.query(`
        SELECT DISTINCT DATE(detected_at)::text AS d
        FROM monitor_booking_events
        WHERE property_id = ANY($1::text[])
        ORDER BY d DESC
        LIMIT 90
      `, [PROPERTY_IDS]);
      const availableDates = dateRows.map(r => r.d);

      const { rows: logs } = await client.query(`
        SELECT filename, source, imported_at, records_total,
               events_created, events_cancelled, events_updated
        FROM monitor_exports_log
        ORDER BY imported_at DESC
        LIMIT 10
      `);

      return {
        range: { since, as_of: asOf.toISOString() },
        available_dates: availableDates,
        updated_at: new Date().toISOString(),
        properties: grouped,
        exports_log: logs.map(l => ({
          filename: l.filename,
          source: l.source,
          imported_at: l.imported_at,
          records: l.records_total,
          created: l.events_created,
          cancelled: l.events_cancelled,
          updated: l.events_updated
        }))
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(payload);
  } catch (err) {
    console.error('monitor error:', err);
    res.status(500).json({ error: err.message });
  }
};
