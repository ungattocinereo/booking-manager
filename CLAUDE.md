# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Atrani Booking Manager — a booking and cleaning calendar management system for vacation rental properties in Atrani, Italy. Syncs iCal feeds from Airbnb and Booking.com, displays bookings on a timeline, auto-generates cleaning tasks, and notifies a family Telegram group.

UI language is Russian.

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
- `api/` — Vercel serverless functions that wrap the same `backend/src/database-postgres.js` module. `_helpers.js` has shared date formatters.
- `frontend/public/index.html` — entire frontend is a single HTML file (vanilla JS, no build step, Lucide icons, Inter font)
- `telegram-bot/` — standalone Telegram bot (separate `package.json`, `node-telegram-bot-api`, communicates with the API over HTTP)
- `scraper/` — one-off import scripts for Booking.com/Airbnb data (not part of the running app)

### Data flow

1. `sync-calendars.js` fetches iCal feeds defined in `calendars.json` (local) or `ICAL_URLS` env var (Vercel)
2. Parses iCal with `ical.js`, extracts guest names/reservation URLs from descriptions
3. Upserts bookings into DB, auto-generates cleaning tasks on checkout dates
4. Frontend fetches `/api/bookings` and renders a Gantt-style timeline
5. Telegram bot queries the same API and formats results in Russian for the family group chat

### Database schema (5 tables)

- `properties` — rental units (id like "orange", "solo", "vingtage")
- `bookings` — synced from iCal, keyed by (property_id, platform, start_date, end_date)
- `cleaners` — cleaning staff
- `cleaner_properties` — many-to-many assignments
- `cleaning_tasks` — auto-generated from checkout dates, with status tracking

### Properties

8 properties configured: Vingtage Room, Orange Room, Solo Room, Youth Room, Awesome Apartments, Carina, Harmony, Royal. First four have both Airbnb + Booking.com feeds; the rest are Airbnb-only.

## Environment Variables

Key vars (see `.env.example`):
- `POSTGRES_URL` / `DATABASE_URL` — Postgres connection (presence triggers Postgres mode)
- `ICAL_URLS` — JSON array of property calendar URLs (Vercel deployment)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — for the Telegram bot
- `PORT` — Express port (default 3001)
