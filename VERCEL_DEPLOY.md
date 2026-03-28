# 🚀 Vercel Deployment Guide

## Prerequisites

1. ✅ GitHub repo: `ungattocinereo/booking-manager`
2. ✅ Vercel account connected to GitHub
3. ⏳ Vercel Postgres database (create during setup)

---

## Step 1: Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New Project"**
3. Import `ungattocinereo/booking-manager`
4. Framework Preset: **Other** (it's a custom Node.js app)

---

## Step 2: Configure Environment Variables

In Vercel dashboard → **Settings** → **Environment Variables**, add:

### Required Variables

```bash
# iCal URLs (JSON array)
ICAL_URLS='[{"id":"orange","name":"Orange Room","booking_url":"https://...","airbnb_url":"https://..."}]'

# Node environment
NODE_ENV=production
```

### Optional (for Telegram notifications)

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

---

## Step 3: Create Vercel Postgres Database

1. In your Vercel project → **Storage** tab
2. Click **"Create Database"**
3. Select **Postgres**
4. Click **"Create"**
5. Vercel will automatically add these env vars:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - etc.

---

## Step 4: Initialize Database Schema

After first deploy, run this command locally (one time):

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link your project
cd ~/.openclaw/workspace/booking-manager
vercel link

# Run SQL schema
vercel env pull .env.local
psql $POSTGRES_URL_NON_POOLING < backend/database/schema.sql
```

Or use Vercel Postgres dashboard → **Data** → **Query** → paste `backend/database/schema.sql`

---

## Step 5: Deploy

```bash
git push origin main
```

Vercel auto-deploys on every push to `main`.

---

## Step 6: Test

1. Open your Vercel deployment URL (e.g., `https://booking-manager-xxx.vercel.app`)
2. Check dashboard: `https://booking-manager-xxx.vercel.app/`
3. Test API health: `https://booking-manager-xxx.vercel.app/health`
4. First sync: `https://booking-manager-xxx.vercel.app/api/sync` (POST request)

---

## Sync iCal Calendars

### Option 1: Manual Trigger
```bash
curl -X POST https://booking-manager-xxx.vercel.app/api/sync
```

### Option 2: Cron Job (Vercel Cron)
Add `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/sync",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

### Option 3: External Cron (e.g., via OpenClaw)
```bash
openclaw cron create \
  --schedule "0 */6 * * *" \
  --task "curl -X POST https://booking-manager-xxx.vercel.app/api/sync" \
  --name "Booking Calendar Sync"
```

---

## Local Development

```bash
# Install dependencies
npm install

# Copy .env.example
cp .env.example .env

# Add your local iCal URLs to .env

# Start backend
npm start

# Frontend (separate terminal)
cd frontend/public
python3 -m http.server 8080
```

Open: http://localhost:8080

---

## Troubleshooting

**Q: "Cannot connect to database"**
- Check that Postgres env vars are set in Vercel
- Make sure schema is initialized (Step 4)

**Q: "No bookings showing up"**
- Run `/api/sync` manually first
- Check that `ICAL_URLS` env var is valid JSON

**Q: "Dashboard not loading"**
- Check Vercel deployment logs
- Make sure `vercel.json` routes are correct

---

## Updating the Code

```bash
cd ~/.openclaw/workspace/booking-manager
git add .
git commit -m "Update feature X"
git push origin main
```

Vercel auto-deploys in ~30 seconds.

---

## URLs

- **Production:** https://booking-manager-xxx.vercel.app
- **GitHub:** https://github.com/ungattocinereo/booking-manager
- **Vercel Dashboard:** https://vercel.com/ungattocinereo/booking-manager

---

🦞 **Ready to deploy!**
