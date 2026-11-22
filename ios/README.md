# Atrani for iPhone

Native SwiftUI app and WidgetKit large Home Screen widget, using the existing
Booking Manager database and calendar normalization. iOS 17 or later.

The app includes a chronological arrival list with a full-width violet header, a glass logo and guest cards and a horizontally
scrolling occupancy calendar for all apartments. Property icons stay fixed while names smoothly hide on forward swipes and return
on backward swipes. Prepared day columns scroll through the next year; the month menu and Today button jump to a date.
Property icons match the web calendar and platform badges identify Airbnb and
Booking.com. Tap a booking for guest details. Individual property schedules and
native cleaner management remain available. The existing web workspace opens
for cleaning completion, statistics, tax reports and guest-reporting operations.
The Cleanings tab creates cleaners, assigns rooms, edits names/link addresses, and copies
their public calendar link. It uses the same records and assignments as the website.
New cleaners receive a generated link immediately; editing name, slug and rooms is atomic.
Arrival cards show the shared city-tax mark and an estimate of €2.50 per guest per night.
Tap the tax control to confirm payment or clear the mark; only a successful server response changes it.
Unknown guest counts do not produce a made-up total. A short top-edge pull opens
the seven most recent previous arrivals (including stays still in progress); a deeper pull refreshes.
Both actions also have visible buttons. Haptics and a system click acknowledge switching;
Reduce Motion disables the moving glint.
Demo mode is visibly labelled and never writes sample records to the server or
the real widget's cache. See `docs/iphone-calendar.md` for the approved design.

The large widget switches Today/Tomorrow in place and shows every arrival on the
selected day. Empty days fall back to the nearest future arrival day. One arrival
uses a detailed feature card, 2–3 use spacious rows, 4–6 use compact rows with
checkout dates, and 7–12 use two columns; unusually busy days use explicit
pages. Today/Tomorrow share one segmented control. Property icons and their
colors use the same Lucide assets as the web calendar and native app, bundled
in both app and extension from `Shared/PropertyAssets.xcassets`. Each widget can select all properties or
one property. Booking links open the native detail screen. Dates and midnight
timeline changes use Europe/Rome. Refresh requests are made about every 30
minutes; iOS controls actual delivery. Saved data remains available offline with
a visible warning, and is deleted on disconnect.

## Build

Install a full Xcode compatible with your phone's iOS version, and XcodeGen:

```sh
brew install xcodegen
cd ios
xcodegen generate
open Atrani.xcodeproj
```

In Xcode Settings → Apple Accounts, sign in to the enrolled Apple Developer
account. Set the same team for both targets in Signing & Capabilities. Both
targets must have App Groups enabled for `group.it.cinereo.atrani`.

Alternatively create ignored `Config/Signing.local.xcconfig` containing:

```xcconfig
ATRANI_DEVELOPMENT_TEAM = YOUR_TEAM_ID
```

Bundle identifiers are `it.cinereo.atrani` and `it.cinereo.atrani.widget`; register
both with your team. If identifiers change, update the project specification and
the App Group in both entitlements and `Shared/SharedStore.swift` together.

The Xcode project is generated from `project.yml` and is not committed.

## Connect to real data

Deploy the accompanying backend change through the normal PR/CI workflow before
connecting. The read-only endpoint is `GET /api/bookings?widget=upcoming`.
It accepts the existing `WIDGET_TOKEN` only in the `x-widget-token` header.
The handler authenticates before initializing the database; non-GET requests
are rejected. `PATCH /api/bookings?widget=tax` uses the same header token and accepts
`booking_id`, boolean `tax_paid`, and boolean `expected_paid`. The token therefore
also authorizes this narrowly scoped payment-status action and native cleaner management. It rejects inactive,
hidden and technical calendar records and returns 409 for conflicting edits.
It updates the existing `tax_paid` / `tax_paid_at` fields used by the website.
`GET/POST/PUT /api/bookings?widget=cleaners` respectively lists, creates and updates
cleaners with the same header authentication. POST accepts `name`; PUT requires
`id`, `name`, `slug` and `property_ids`. Responses expose only names, slugs and
minimal property fields. Copied links use the canonical public `https://b.amalfi.day`
origin, without mobile keys or Vercel bypass credentials. Demo edits stay in memory
and copy `example.com` links. No deletion route is exposed by the mobile API.
Responses use `private, no-store`. No database migration is needed.

Use the existing production Vercel origin and, when Vercel Deployment Protection
is enabled, its existing automation bypass token. No Cloudflare policy change is
required. Never bundle tokens, service credentials or guest data with the app.

Enter settings in the app or import a local JSON file with these keys:

```json
{
  "server": "https://YOUR-PROJECT.vercel.app",
  "accessKey": "YOUR_WIDGET_TOKEN",
  "protectionKey": "YOUR_EXISTING_VERCEL_AUTOMATION_BYPASS_TOKEN"
}
```

Connection files contain credentials: keep them local, transfer privately, and
delete after import. Files named `*.connection.json` in this folder are ignored.
Keys are stored in the shared App Group keychain with device-only protection.
The shared dashboard cache uses file protection. Redirects are refused to avoid
forwarding credentials to a login or third-party host.

## Install over Wi-Fi

On iOS 27 or newer, use Xcode → Open Developer Tool → Device Hub → + → Pair Nearby
Device, follow the pairing prompts, and enable Developer Mode on the phone.
Select the phone as the run destination and run Atrani. On older iOS versions,
pair with this specific Mac using a cable first.

## TestFlight

1. Register the app in App Store Connect using the app bundle identifier.
2. Select Any iOS Device in Xcode and choose Product → Archive.
3. In Organizer, select Distribute App → TestFlight & App Store and automatic signing.
4. Complete export-compliance information and enable the processed build for the
   intended testers. External testers require Apple's beta-review process.
5. Install through TestFlight on iPhone, open Atrani, connect the server, then add
   the Atrani large widget to the Home Screen.

Each beta build expires after 90 days. Upload a new build before expiration.
Signing in, accepting new Apple agreements and enabling Developer Mode require
the account/device owner. No signing certificate or App Store Connect API key
is committed to this public repository.

## Checks

```sh
cd ios
swift test
xcodegen generate
xcodebuild -project Atrani.xcodeproj -scheme Atrani -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

GitHub Actions builds both app and widget without production credentials. The
simulator artifact is for Simulator only; it cannot be installed on a real iPhone.

For local UI smoke checks only, Debug Simulator builds accept `--demo` or
`--connection-file /absolute/path/to/Atrani.connection.json` as launch arguments.
This file is read locally and credentials remain in headers/keychain. These
arguments are excluded from device and Release builds.
Add `--calendar-stress` to `--demo` to open the calendar with 1,001 synthetic
bookings across all 11 apartments. Verify horizontal swipes in both directions,
vertical scrolling, month jumps, Today, and booking details. Data refreshes on
launch/return from background or pull-to-refresh, never while scrolling.

For widget layout checks, launch a Debug Simulator build with `--widget-preview
--widget-count 5` (also check 0, 1, 2, 3, 6, 12 and 13). The preview renders the
same view at 338 × 354 points with invented guests and real property identifiers.
`--widget-offset 1` selects tomorrow; `--widget-arrival-offset 3` exercises the
future-day fallback; `--widget-page 1` checks the last page of a busy day. These
fixtures never write the real widget cache. Check both light and dark appearance.

Run the native interaction check on a booted iPhone Simulator:

```sh
xcodebuild -project Atrani.xcodeproj -scheme Atrani -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_ID' CODE_SIGNING_ALLOWED=NO test
```

It exercises short/deep pulls, the explicit history button, and both tax marks in
isolated demo mode. The backend test verifies actual SQLite persistence separately.
The dashboard keeps its calendar window plus seven earlier arrivals when needed.

`App/Assets.xcassets/ArrivalGlassMark.imageset/mark.png` is a generated transparent
asset based on the existing AppIcon's calligraphic A. Generation brief: preserve
the logo silhouette, render it as polished pearly lavender glass with luminous
edges and a restrained specular highlight, isolated without a background or tile.
The enlarged mark extends toward the bottom-right corner over a moving saturated violet glow, a light ring and small particles. The history button sits below it; dates and properties appear only in the list. Reduce Motion freezes the effects, which also pause offscreen and in other tabs. All effects are rendered in SwiftUI, not baked into repeated images.

City tax uses an icon and a large amount with a small `City tax` caption. Unknown amounts use only the icon, retaining a descriptive VoiceOver label. Paid amounts remain visible beside a checkmark.
