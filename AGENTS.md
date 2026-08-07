# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Atrani Booking Manager — a booking and cleaning calendar management system for vacation rental properties in Atrani, Italy. Syncs iCal feeds from Airbnb and Booking.com, displays bookings on a timeline, auto-generates cleaning tasks, and notifies a family Telegram group.

UI language is Russian.

## Canonical baseline and branch policy

- The current product/UI generation is **Design 2.0 / Orbit**.
- `main` is the only canonical product and production branch. Start every task from an up-to-date `origin/main`; never use a historical branch whose name contains `design2.0` as a base.
- Use a short-lived `codex/<topic>` branch, open a pull request to `main`, require the `ci / test` check, and delete the branch after merge.
- `monitor/nuove-prenotazioni` is the only branch permitted to remain long-lived besides `main`. It is an operational data/GitHub Pages branch, is excluded from Vercel, and must not be merged into or used as a base for product work.
- The immutable code rollback point for the baseline is `rollback/design-2.0-live-2026-08-07` at `25665231b112bf8c280c25f3a9a60f1267a701c3`. A code rollback does not roll back Postgres; review migrations, backups, and reporting encryption-key compatibility separately.
- Design 2.0 is a design-generation name, not the historical package semver `[2.0.0] Docker Edition`.

See `BASELINE.md` for the release boundary and `CONTRIBUTING.md` for the required workflow.

## Commands

```bash
npm run dev          # Start Express server with nodemon on :3001
npm start            # Start Express server (production)
npm run sync         # Run iCal calendar sync (standalone)
```

Docker:
```bash
docker compose up -d         # Start with Docker (includes nginx reverse proxy)
./manage.sh start|stop|logs  # Docker management wrapper
```

Telegram bot (separate process, own package.json):
```bash
cd telegram-bot && npm start
```

## Architecture

### Dual deployment: local Express + Vercel serverless

The app runs two ways:

1. **Local/Docker**: `backend/src/server.js` — single Express server serving both API and static frontend. Uses SQLite (`backend/src/database.js`).
2. **Vercel**: `api/*.js` — each file is a serverless function. Uses Postgres (`backend/src/database-postgres.js`). `vercel.json` rewrites `/` to the static `frontend/public/index.html`.

Both paths share the database layer — `server.js` and each `api/*.js` file check `POSTGRES_URL`/`DATABASE_URL` at runtime to pick Postgres vs SQLite.

### Key directories

- `backend/src/` — Express server, database modules (SQLite + Postgres), iCal sync engine
- `backend/config/calendars.json` — property definitions with iCal URLs (local dev config)
- `backend/database/` — SQL schemas (`schema.sql` for SQLite, `schema-postgres.sql` for Postgres)
- `api/` — Vercel serverless functions. `api/cleaners/[id].js` for CRUD, `api/maid/[slug].js` for maid calendar. `_helpers.js` has shared date formatters.
- `frontend/public/index.html` — Design 2.0 / Orbit dashboard (vanilla JS, Chart.js, Lucide icons, Golos Text/Unbounded/IBM Plex Mono). Routes: Calendar (`/`), Cleaners (`/maid`), Statistics (`/stats`), Tourist tax (`/tax`), Reporting (`/reporting`)
- `frontend/public/maid.html` — mobile-first maid calendar in Italian, served at `/maid/:slug`
- `telegram-bot/` — standalone Telegram bot (separate `package.json`, `node-telegram-bot-api`, communicates with the API over HTTP)
- `scraper/` — one-off import scripts for Booking.com/Airbnb data (not part of the running app)

### Data flow

1. `sync-calendars.js` fetches iCal feeds defined in `calendars.json` (local) or `ICAL_URLS` env var (Vercel)
2. Parses iCal with `ical.js`, extracts guest names/reservation URLs from descriptions
3. Upserts bookings into DB, auto-generates cleaning tasks on checkout dates
4. Frontend fetches `/api/bookings` and renders a Gantt-style timeline
5. Telegram bot queries the same API and formats results in Russian for the family group chat

### Database schema (15 tables)

- Core inventory: `properties`, `bookings`
- Cleaning: `cleaners`, `cleaner_properties`, `cleaning_tasks`
- Operations and analytics: `booking_stats_snapshots`, `sync_runs`
- Guest reporting: `reporting_units`, `guest_import_batches`, `guest_stays`, `guest_records`
- Alloggiati and ISTAT: `alloggiati_submissions`, `alloggiati_receipts`, `istat_baseline_stays`, `istat_month_submissions`

### Properties

11 properties configured: Vingtage Room, Orange Room, Solo Room, Youth Room, Central Room, Awesome Apartments, Carina, Harmony, Royal, Villa Susy, Carmela. First four have both Airbnb + Booking.com feeds, Central Room and Villa Susy are Booking.com-only, and the rest are Airbnb-only.

### Cleaners have a `slug` field

Each cleaner can have a unique `slug` for a public maid calendar at `/maid/:slug`. The slug is editable in the admin UI. The maid page is Italian, the admin is Russian.

### Cron

GitHub Actions runs the production calendar sync every 30 minutes. Vercel runs the protected `GET /api/sync` fallback daily at 06:00 UTC and reporting maintenance at 06:30 UTC. The sync endpoint is secured by `CRON_SECRET` (Bearer token in the Authorization header).

### Frontend routing

`/stats`, `/maid`, `/tax`, and `/reporting` are rewrites to `index.html`. Frontend JS reads `location.pathname` and switches tabs via `switchTab()`. `history.pushState` keeps URL in sync. `/maid/:slug` is the separate public Italian maid page.

## Environment Variables

Key vars (see `.env.example`):
- `POSTGRES_URL` / `DATABASE_URL` — Postgres connection (presence triggers Postgres mode)
- `ICAL_URLS` — JSON array of property calendar URLs (Vercel deployment)
- `CRON_SECRET` — secret for scheduled sync authentication
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — for the Telegram bot
- `PORT` — Express port (default 3001)
