# Annual statistics and booking movements

The statistics page separates **observation time** (new bookings, cancellations,
calendar removals and restorations) from **stay time** (arrivals, nights and guests).
The default period is January–December in Europe/Rome. April–November is a shortcut.

## Data contract

`GET /api/dashboard?analytics=1&year=2026&period=year&group=month`
accepts `property`, `platform` (`airbnb`, `booking`, `direct`), `period`
(`year`, `season`) and `group` (`month`, `week`, `day`). All results are private,
uncached responses. Invalid filters return 400; the Vercel endpoint rejects
non-GET requests. The existing `stats_only=1` endpoint remains compatible.

The response includes `overview`, `movement`, `movement_monthly`, `comparison`,
`snapshots`, `legacy_snapshots`, `years`, `properties` and `coverage`.
No guest names, phone numbers, calendar URLs or raw external identifiers are
included in the new analytics storage or response. Source identities are hashed.

The first successful observation for each source creates a baseline, not a batch
of new bookings. Only explicit source `STATUS:CANCELLED` confirms a cancellation.
Absence of a future booking after the existing archive grace period is a calendar
removal, not proof of cancellation. When the same UID changes dates, it creates
one date-change event. Without stable identity a disappearance and appearance may
remain separate observations. Completed stays disappearing from feed coverage do
not create removals. Empty or failed feeds do not advance the observation baseline.
Direct bookings are observed from the database after each sync.

`cancellation_confirmed` upgrades an earlier removal without subtracting the
booking twice from net movement. Movement totals count observation events, not
unique people. Arrival-based cancellation totals include recorded events for that
arrival month, with coverage explicitly incomplete. Missing history is null in
the UI, never fabricated zeros. Calendar dates do not prove that a stay occurred.

Availability excludes technical blocks and uses unique property-nights. A real
reservation takes precedence over overlapping channel blocks. Platform filters
restrict reservations but keep the physical property inventory denominator.
Historical inventory is not reconstructed before analytics collection began.

Old daily snapshots remain labelled April–November and separate from new yearly
snapshots. They cannot provide a reliable cancellation ledger. New snapshots
preserve all twelve months with property and platform dimensions. Failed syncs
cannot overwrite a complete daily snapshot. Comparisons require compatible
methods; month comparisons use the same number of complete days and reject gaps.

## Deployment and rollback

1. Run `npm run test:ci`.
2. Create a recoverable snapshot with `npm run backup:data`.
3. Apply only the additive migration:
   `node scripts/migrate-analytics.js --apply --backup-dir <backup-directory>`.
4. Merge the reviewed PR into main after `ci / test`; Vercel deploys it.
5. Verify the protected analytics API and two sequential syncs. The first produces
   zero new events for the baseline; an identical second sync produces no events.

The three tables are `booking_analytics_state`, `booking_analytics_events` and
`booking_analytics_snapshots`. They are included in the normal JSON backup script.
SQLite creates them on initialization. Postgres migration is explicit; API reads
before migration return an empty journal and the ordinary annual overview.
Rollback is a code revert. Keep the additive tables and accumulated history;
never drop them as part of an interface rollback.

## Verification

`test-analytics-ui.js` exercises year/season/property filters, weekly movement,
monthly cancellation grouping, legacy history and both themes at four widths.
The normal UI suite also checks the chart-unavailable tables, auth recovery and
chart disposal. Set `UI_SCREENSHOT_DIR` to save visual verification artifacts.
