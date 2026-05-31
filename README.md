# Atrani Booking Manager

Booking and cleaning calendar for vacation rental properties in Atrani, Italy. Syncs iCal feeds from Airbnb and Booking.com, displays bookings on a Gantt timeline, auto-generates cleaning tasks, and notifies a family Telegram group.

**Live:** [b.amalfi.day](https://b.amalfi.day)

---

## Features

- **Calendar sync** — hourly iCal sync from Airbnb + Booking.com (14 feeds, 10 properties)
- **Gantt timeline** — visual booking calendar with color-coded platforms, guest names, country flags
- **Cleaning management** — auto-generated cleaning tasks on checkout dates, cleaner assignment
- **Maid calendar** — mobile-first Italian-language page for each cleaner at `/maid/:slug`
- **Statistics** — season analytics (Apr-Nov) with Chart.js: monthly bookings, occupancy, countries, check-in patterns, stay duration, guest counts
- **Telegram bot** — family group chat with booking queries and cleaning schedules
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
| Carina | Airbnb | Salvatore / Margarita |
| Harmony | Airbnb | Salvatore / Margarita |
| Royal | Airbnb | Salvatore / Margarita |
| Villa Susy | Booking.com | Susy |

## Architecture

```
                        +-----------------+
                        |   Airbnb iCal   |
                        |  Booking.com    |
                        +--------+--------+
                                 |
                          sync (hourly)
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

## Access Control

`b.amalfi.day` admin routes are intended to sit behind Cloudflare Access. The public maid routes remain unauthenticated:

- Public: `/maid/:slug`, `/api/maid/:slug`, icon/manifest assets
- Protected: `/`, `/stats`, exact `/maid`, `/tax`, admin `/api/*`
- Machine clients that call protected admin APIs can use a Cloudflare Access service token via `BOOKING_MANAGER_CF_ACCESS_CLIENT_ID` and `BOOKING_MANAGER_CF_ACCESS_CLIENT_SECRET`

The root `middleware.ts` blocks direct `*.vercel.app` access to admin pages and APIs while preserving public maid links, cron with `CRON_SECRET`, and Telegram webhook calls with `TELEGRAM_WEBHOOK_SECRET`.

## Quick Start

### Vercel (production)

Deploys automatically from `main`. Required environment variables:

| Variable | Description |
|----------|-------------|
| `POSTGRES_URL` | Neon/Postgres connection string |
| `ICAL_URLS` | JSON array of `{property, platform, url}` objects |
| `CRON_SECRET` | Secret for hourly sync cron authentication |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Family group chat ID |
| `FAMILY_CHAT_ID` | Family group chat ID used by the Telegram webhook/bot |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token for Telegram webhook requests |
| `BOOKING_MANAGER_CF_ACCESS_CLIENT_ID` | Optional Cloudflare Access service token ID for machine clients |
| `BOOKING_MANAGER_CF_ACCESS_CLIENT_SECRET` | Optional Cloudflare Access service token secret for machine clients |

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
| `/tomorrow` | Tomorrow's check-ins |
| `/cleaning` | Today's cleaning tasks |
| `/cleaning tomorrow` | Tomorrow's cleaning tasks |
| `/help` | List all commands |

## API Endpoints

### Bookings
- `GET /api/bookings` — List bookings (`?property_id=`, `?from_date=`)
- `GET /api/bookings/summary` — Bookings grouped by property

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

### System
- `GET /api/sync` — Sync calendars (cron, requires `CRON_SECRET`)
- `POST /api/sync` — Sync calendars (manual, from dashboard)
- `GET /api/dashboard` — Aggregated dashboard data
- `GET /health` — Health check

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
│   ├── sync.js                   # Cron target (hourly)
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

5 tables: `properties`, `bookings`, `cleaners`, `cleaner_properties`, `cleaning_tasks`.

Auto-detects database engine at runtime: Postgres if `POSTGRES_URL`/`DATABASE_URL` is set, SQLite otherwise.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js, Node.js |
| Frontend | Vanilla JS, Chart.js, Lucide icons, Inter font |
| Database | SQLite (local) / PostgreSQL (Vercel) |
| Deployment | Vercel (serverless, cron, rewrites) |
| Bot | node-telegram-bot-api, axios |
| Sync | ical.js |
| Container | Docker, Nginx |
