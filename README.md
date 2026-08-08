# Atrani Booking Manager

Booking and cleaning calendar for vacation rental properties in Atrani, Italy. Syncs iCal feeds from Airbnb and Booking.com, displays bookings on a Gantt timeline, auto-generates cleaning tasks, and notifies a family Telegram group.

**Live:** [b.amalfi.day](https://b.amalfi.day)

**Current baseline:** **Design 2.0 / Orbit** on `main`. This is the only starting point for new product work; see [BASELINE.md](BASELINE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Features

- **Calendar sync** — iCal sync from Airbnb + Booking.com every 30 minutes via GitHub Actions, with a daily Vercel fallback (15 feeds, 11 properties)
- **Gantt timeline** — visual booking calendar with color-coded platforms, guest names, country flags
- **Adaptive appearance** — Design 2.0 supports system, day, and night modes across every workspace and the public maid calendar
- **Cleaning management** — auto-generated cleaning tasks on checkout dates, cleaner assignment
- **Maid calendar** — mobile-first Italian-language page for each cleaner at `/maid/:slug`
- **Statistics** — season analytics (Apr-Nov) with Chart.js: monthly bookings, occupancy, countries, check-in patterns, stay duration, guest counts
- **Telegram bot** — family group chat with booking queries and cleaning schedules
- **Guest reporting** — protected Comune TXT review, Alloggiati Web submission workflow, receipts, and monthly ISTAT preview at `/reporting`
- **Dual deployment** — runs locally with SQLite or on Vercel with Postgres

## Properties

| Property | Platforms | Group |
|----------|-----------|-------|
| Vingtage Room | Airbnb + Booking.com | Dragone |
| Orange Room | Airbnb + Booking.com | Dragone |
| Solo Room | Airbnb + Booking.com | Dragone |
| Youth Room | Airbnb + Booking.com | Dragone |
| Central Room | Booking.com | Dragone |
| Awesome Apartments | Airbnb | Dragone |
| Carina | Airbnb | Dipino |
| Harmony | Airbnb | Dipino |
| Royal | Airbnb | Dipino |
| Villa Susy | Booking.com | Susy |
| Carmela | Airbnb | Oliva |

## Architecture

```
                        +-----------------+
                        |   Airbnb iCal   |
                        |  Booking.com    |
                        +--------+--------+
                                 |
                    sync (30 min; daily fallback)
                                 |
                    +------------v------------+
                    |      Sync Engine        |
                    |   sync-calendars.js     |
                    +------------+------------+
                                 |
              +------------------+------------------+
              |                                     |
     +--------v--------+               +-----------v-----------+
     |  SQLite (local)  |               |  Postgres (Vercel)    |
     +---------+--------+               +-----------+-----------+
              |                                     |
     +--------v--------+               +-----------v-----------+
     |  Express :3001   |               |  Serverless Functions  |
     +---------+--------+               +-----------+-----------+
              |                                     |
              +------------------+------------------+
                                 |
              +------------------+------------------+
              |                  |                  |
     +--------v------+  +-------v-------+  +-------v--------+
     |   Dashboard   |  | Maid Calendar |  | Telegram Bot   |
     |  index.html   |  |  maid.html    |  |    bot.js      |
     +---------------+  +---------------+  +----------------+
```

## Pages

| Route | Description | Language |
|-------|-------------|----------|
| `/` | Dashboard — Gantt calendar, stats bar, booking timeline | Russian |
| `/stats` | Statistics — season charts and analytics | Russian |
| `/maid` | Cleaning management — cleaner assignments, slug links | Russian |
| `/maid/:slug` | Maid calendar — check-ins/check-outs for specific cleaner | Italian |
| `/tax` | Tourist-tax workspace | Russian |
| `/reporting` | Guest registration and Alloggiati/ISTAT reporting | Russian |

## Canonical baseline and development

The current product generation is **Design 2.0 / Orbit**. `main` is the canonical and production branch. Do not develop from historical `design2.0` branches: they predate the version currently running in production.

Every change starts from an up-to-date `main`, uses a short-lived topic branch, and returns through a pull request whose CI checks pass. The only branch permitted to remain long-lived besides `main` is `monitor/nuove-prenotazioni`, an operational data/GitHub Pages branch that is not a product-development base and is excluded from Vercel deployments.

The immutable rollback point for the exact application version promoted as this baseline is `rollback/design-2.0-live-2026-08-07` (`25665231b112bf8c280c25f3a9a60f1267a701c3`). It restores code only; database backups and migrations are handled separately. Full release and rollback rules are in [BASELINE.md](BASELINE.md).

## Access Control

`b.amalfi.day` admin routes are intended to sit behind Cloudflare Access. The public maid routes remain unauthenticated:

- Public: `/maid/:slug`, `/api/maid/:slug`, icon/manifest assets
- Protected: `/`, `/stats`, exact `/maid`, `/tax`, admin `/api/*`
- Machine clients that call protected admin APIs can use a Cloudflare Access service token via `BOOKING_MANAGER_CF_ACCESS_CLIENT_ID` and `BOOKING_MANAGER_CF_ACCESS_CLIENT_SECRET`

The root `middleware.ts` blocks direct `*.vercel.app` access to admin pages and APIs while preserving public maid links, cron with `CRON_SECRET`, and Telegram webhook calls with `TELEGRAM_WEBHOOK_SECRET`.
Set `REQUIRE_CF_ACCESS_IDENTITY=true` after confirming the Cloudflare Access JWT header reaches Vercel to enforce the same boundary inside the application.

## Quick Start

### Vercel (production)

Deploys automatically from `main`. Required environment variables:

| Variable | Description |
|----------|-------------|
| `POSTGRES_URL` | Neon/Postgres connection string |
| `ICAL_URLS` | JSON array of `{property, platform, url}` objects |
| `CRON_SECRET` | Secret for the protected scheduled sync trigger |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Family group chat ID |
| `FAMILY_CHAT_ID` | Family group chat ID used by the Telegram webhook/bot |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token for Telegram webhook requests |
| `BOOKING_MANAGER_CF_ACCESS_CLIENT_ID` | Optional Cloudflare Access service token ID for machine clients |
| `BOOKING_MANAGER_CF_ACCESS_CLIENT_SECRET` | Optional Cloudflare Access service token secret for machine clients |
| `ICAL_FETCH_TIMEOUT_MS` | Per-attempt iCal timeout, default `12000` |
| `ICAL_FETCH_RETRIES` | Transient iCal retry count, default `2` |
| `BOOKING_STALE_GRACE_HOURS` | Quarantine before a missing booking is hidden, default `6` |
| `HEALTH_SYNC_STALE_MINUTES` | Maximum healthy sync age, default `1560` (26 hours) |
| `REPORTING_PII_ENCRYPTION_KEY` | 32-byte base64/hex key used to encrypt fixed-width guest records |
| `REPORTING_EXTERNAL_SEND_ENABLED` | Safety flag; keep `false` until external test/shadow checks pass |
| `ALLOGGIATI_<UNIT>_*` | Per-unit Alloggiati user, password, and WSKEY |
| `ISTAT_<UNIT>_*` | Per-unit CUSR and Sinfonia API key |

Run `npm run migrate:postgres` after schema changes. Runtime requests only connect to Postgres; they do not execute DDL unless `POSTGRES_AUTO_MIGRATE=true` is explicitly set for a fresh environment.

The `ci` GitHub Actions workflow runs syntax checks, unit/lifecycle tests, the Playwright UI performance suite, and a production dependency audit for pull requests and pushes to `main`. Configure the `ci / test` check as required in GitHub branch protection before allowing merges to production.

The scheduled `monitor-sync` workflow also runs the production calendar sync every 30 minutes. The admin UI additionally starts a sync when opened and every five minutes while visible, so last-minute iCal changes do not wait for a delayed GitHub schedule.

`backend/config/calendar-inventory.json` is the non-secret contract for required properties and platforms. Production `ICAL_URLS` and the GitHub `BOOKING_MANAGER_ICAL_URLS` secret must cover that inventory; sync exits with an explicit error instead of silently skipping a room when configuration drifts.

### Local development

```bash
npm install
npm run dev            # Express server on :3001
```

### Docker

```bash
docker compose up -d   # Express + Nginx + sync cron + Telegram bot
./manage.sh status     # Check services
./manage.sh logs       # View logs
./manage.sh sync       # Manual sync
./manage.sh backup     # Backup database
```

### Telegram bot

```bash
cd telegram-bot
npm install
node bot.js
```

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/bookings` | Upcoming bookings (30 days) |
| `/bookings orange` | Bookings for specific property |
| `/week` | This week's bookings |
| `/today` | Today's check-ins |
| `/today-details` / `/today_details` | Today's check-ins, check-outs, and ongoing stays |
| `/tomorrow` | Tomorrow's check-ins |
| `/cleaning` | Today's cleaning tasks |
| `/cleaning tomorrow` | Tomorrow's cleaning tasks |
| `/help` | List all commands |

## API Endpoints

### Bookings
- `GET /api/bookings` — List bookings (`?property_id=`, `?from_date=`)
- `GET /api/bookings/summary` — Bookings grouped by property

### Statistics
- `GET /api/dashboard?stats_only=1` — Daily statistics history (`&season_year=`, `&limit=`)

### Properties
- `GET /api/properties` — All properties

### Cleaners
- `GET /api/cleaners` — All cleaners with assigned properties
- `POST /api/cleaners` — Create cleaner (`{ name }`)
- `PUT /api/cleaners/:id` — Update name, slug, or property assignments
- `DELETE /api/cleaners/:id` — Delete cleaner (cascades)

### Maid Calendar
- `GET /api/maid/:slug` — Bookings for a cleaner's assigned properties

### Cleaning Tasks
- `GET /api/cleaning-tasks` — List tasks (`?cleaner_id=`, `?from_date=`)
- `POST /api/cleaning-tasks` — Create manual task
- `POST /api/cleaning-tasks/:id/complete` — Mark completed
- `POST /api/cleaning-tasks/:id/assign` — Assign cleaner

### Guest Reporting
- `GET /api/reporting` — Reporting units and integration readiness
- `GET|POST|PATCH /api/reporting/imports` — List, import, and review Comune TXT batches
- `GET|POST /api/reporting/alloggiati` — Download receipts or run Alloggiati `Test`/`Send`
- `GET|POST /api/reporting/istat` — ISTAT codes, monthly preview, and confirmed submission
- `GET /api/reporting/maintenance` — Protected daily receipt/purge cron

### System
- `GET /api/sync` — Sync calendars (cron, requires `CRON_SECRET`)
- `POST /api/sync` — Sync calendars (manual, from dashboard)
- `GET /api/dashboard` — Aggregated dashboard data
- `GET /health` or `GET /api/health` — Database and calendar freshness health check (`503` when unavailable or stale)

## Project Structure

```
booking-manager/
├── api/                          # Vercel serverless functions
│   ├── bookings.js
│   ├── cleaners.js
│   ├── cleaners/[id].js
│   ├── dashboard.js
│   ├── maid/[slug].js
│   ├── properties.js
│   ├── sync.js                   # Protected scheduled sync target
│   └── _helpers.js
├── backend/
│   ├── config/calendars.json     # Property + iCal URL config
│   ├── database/
│   │   ├── schema.sql            # SQLite schema
│   │   └── schema-postgres.sql   # Postgres schema
│   └── src/
│       ├── server.js             # Express server
│       ├── database.js           # SQLite module
│       ├── database-postgres.js  # Postgres module
│       ├── sync-calendars.js     # iCal sync engine
│       └── enrich-from-exports.js
├── frontend/public/
│   ├── index.html                # Dashboard (single-file vanilla JS)
│   ├── maid.html                 # Maid calendar (mobile-first)
│   └── manifest.json             # PWA manifest
├── telegram-bot/
│   ├── bot.js                    # Telegram bot (separate process)
│   └── package.json
├── vercel.json                   # Cron + rewrites config
├── docker-compose.yml
├── Dockerfile
└── manage.sh                     # Docker management utility
```

## Database

15 tables cover properties, bookings, cleaning, statistics/sync history, guest reporting, Alloggiati receipts, and ISTAT submissions. SQLite and Postgres schemas are kept in `backend/database/schema.sql` and `backend/database/schema-postgres.sql`.

Auto-detects database engine at runtime: Postgres if `POSTGRES_URL`/`DATABASE_URL` is set, SQLite otherwise.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js, Node.js |
| Frontend | Vanilla JS, Chart.js, Lucide icons, Golos Text, Unbounded, IBM Plex Mono |
| Database | SQLite (local) / PostgreSQL (Vercel) |
| Deployment | Vercel (serverless, cron, rewrites) |
| Bot | node-telegram-bot-api, axios |
| Sync | ical.js |
| Container | Docker, Nginx |
