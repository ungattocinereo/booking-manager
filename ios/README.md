# Atrani for iPhone

Native SwiftUI app and WidgetKit large Home Screen widget, using the existing
Booking Manager database and calendar normalization. iOS 17 or later.

The app includes today's arrivals/departures, upcoming bookings and guest details,
a monthly calendar with property filtering, individual property schedules, and a
read-only cleaning schedule. The existing web workspace opens for cleaner
assignment/completion, statistics, tax and guest-reporting operations. These
operations are not yet native screens. Demo mode is visibly labelled and never
writes sample records to the server or the real widget's cache.

The large widget shows the next arrival even when today and tomorrow have no
arrivals, followed by two more bookings. Each widget can select all properties or
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
are rejected. Responses use `private, no-store`. No database migration is needed.

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
