# Arrival board and iPhone 1.1

Atrani is a family operations calendar. The immediate question is who arrives next,
in which apartment, and when. The design keeps the Orbit violet identity with calm
neutral surfaces; the arrival list carries the visual emphasis. Door/key, person,
moon and calendar symbols describe actual booking information.

The review applied [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop)
(CC BY 4.0) and [Apple Design](https://github.com/dickwu/apple-design-skill).
The main findings were an oversized web headline, competing colored labels,
missing guest names in the web summary, a three-booking native-widget limit, a
five-booking Scriptable limit, and calendar dates that hid empty apartments.

Apple references read: widgets (Best practices, Rendering modes), accessibility,
layout, typography, color, designing for iOS, dark mode, SF Symbols and tab bars.
Widget density is a deliberate tradeoff: one arrival gets a large title; 2–6
arrivals use rows; 7–12 use two columns. More than 12 use explicit numbered pages,
with no silent omission. Compact labels have an 11pt floor. Full guest details
remain reachable by tapping each reservation. System Dynamic Type is retained in
the app. The website retains keyboard focus, reduced-motion support and RU/IT.

## Data and identity

All 11 canonical apartments come from the Booking Manager property inventory,
including those without a Hostex account or future reservations. San Sebastiano
(Hostex 12843803) is **Awesome Apartments (`awesome`)**, not a twelfth property.

Hostex is read through the existing protected OpenClaw Gateway. Its access token
stays in the protected store. `scripts/import-hostex-reservations.mjs` is a
reviewable copy of the existing import, with explicit identity mapping and
Hostex-authoritative nonempty guest names and positive guest counts. It never
sends changes to Hostex. Missing names do not erase existing evidence, and pending
requests do not become confirmed stays. Existing iCal data remains authoritative
for properties outside Hostex. No database schema migration is needed.

The importer defaults to dry run. On the Gateway set `BOOKING_MANAGER_DIR` to the
live app checkout (for its DB connection), and optionally `HOSTEX_HELPER` to the
existing protected helper. `--apply --quiet` is the existing scheduled operation.
Do not move the protected token to Vercel, a connection file or an iPhone archive.

## Interaction and freshness

The WidgetKit Today/Tomorrow buttons run an AppIntent without opening the app.
Selection is shared by widgets with the same apartment filter. Cached data gives
immediate day switching; normal network refresh remains requested every 30 minutes
and delivery is controlled by iOS. Rome midnight entries keep day labels current.
Booking links open details; the widget background opens the selected calendar day.

The native app calendar shows every apartment on the chosen day, with arrival,
departure and staying labels, and a next-arrival hint for empty apartments.
Scriptable is retained as a legacy option; in-place Today/Tomorrow interaction is
provided by the native WidgetKit widget. Scriptable users must replace their saved
script to receive layout changes.

## Verification

- JavaScript tests: Hostex alias, authoritative corrections, pending reservations,
  all-apartment mobile inventory and Scriptable busy days.
- Swift tests: Rome dates/DST, current/next day grouping, filtering and overflow pages.
- Browser: 320/390/1440 widths, every arrival visible, day switching, booking details,
  imported-name escaping, plus the complete existing cross-route RU/IT/theme suite.
- Xcode: iPhone app and extension simulator builds. Debug-only widget harness uses
  invented data and never writes the real widget cache.

A simulator build is not evidence of physical-device installation or TestFlight
availability; release status must be checked separately.
