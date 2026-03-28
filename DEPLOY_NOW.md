# 🚀 Deploy to Vercel — Quick Steps

## ✅ Done (by Clawd)

- [x] GitHub repo created and pushed: `ungattocinereo/booking-manager`
- [x] Vercel configuration added (`vercel.json`)
- [x] Postgres support added (auto-detects Vercel vs local)
- [x] Full documentation (`VERCEL_DEPLOY.md`)

---

## 🎯 Your Turn (5 minutes)

### 1. Import to Vercel

1. Go to https://vercel.com/new
2. Import from GitHub: `ungattocinereo/booking-manager`
3. Framework: **Other**
4. Click **Deploy** (it will deploy, but won't work yet — need database)

### 2. Create Postgres Database

1. In your Vercel project → **Storage** tab
2. Click **Create Database** → **Postgres**
3. Wait ~30 seconds for provisioning
4. Vercel auto-adds these env vars:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - etc.

### 3. Initialize Database Schema

Option A (easiest): Via Vercel UI
1. Storage → Postgres → **Query** tab
2. Copy-paste contents of `backend/database/schema-postgres.sql`
3. Click **Run**

Option B: Via CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Link project
cd ~/.openclaw/workspace/booking-manager
vercel link

# Pull env vars
vercel env pull .env.local

# Run schema
psql $(grep POSTGRES_URL .env.local | cut -d '=' -f2-) < backend/database/schema-postgres.sql
```

### 4. Add iCal URLs

1. Vercel project → **Settings** → **Environment Variables**
2. Add variable:
   - Name: `ICAL_URLS`
   - Value: (JSON array, see format below)
   - Apply to: **Production**, **Preview**, **Development**

**Format:**
```json
[
  {
    "id": "orange",
    "name": "Orange Room",
    "booking_url": "https://admin.booking.com/hotel/hoteladmin/ical.html?...",
    "airbnb_url": "https://www.airbnb.com/calendar/ical/..."
  },
  {
    "id": "vintage",
    "name": "Vintage Room",
    "booking_url": "...",
    "airbnb_url": "..."
  }
]
```

3. Click **Save**

### 5. Redeploy

```bash
# Trigger redeploy (env vars changed)
cd ~/.openclaw/workspace/booking-manager
git commit --allow-empty -m "Trigger redeploy"
git push
```

Or: Vercel Dashboard → **Deployments** → **Redeploy**

### 6. Test

1. Open your deployment URL (e.g., `https://booking-manager-xxx.vercel.app`)
2. Test health: `https://booking-manager-xxx.vercel.app/health`
3. Sync calendars: `curl -X POST https://booking-manager-xxx.vercel.app/api/sync`
4. View dashboard: `https://booking-manager-xxx.vercel.app/`

---

## 🔄 Setup Auto-Sync (Optional)

### Option 1: Vercel Cron (Recommended)

Add to `vercel.json`:
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

Then commit + push.

### Option 2: External Cron (via OpenClaw)

```bash
openclaw cron create \
  --schedule "0 */6 * * *" \
  --task "curl -X POST https://booking-manager-xxx.vercel.app/api/sync" \
  --name "Booking Calendar Sync"
```

---

## 📱 Access URLs

After deployment:

- **Dashboard:** https://booking-manager-xxx.vercel.app/
- **API Docs:** See `README.md`
- **Health Check:** https://booking-manager-xxx.vercel.app/health
- **Vercel Dashboard:** https://vercel.com/ungattocinereo/booking-manager

---

## 🛠️ Get iCal URLs

### Airbnb:
1. Host dashboard → Listing → Availability → Sync calendar
2. Copy "Export calendar" URL

### Booking.com:
1. Extranet → Property → Calendar → Sync calendars
2. Copy "Export calendar" URL

---

## ❓ Questions?

Read `VERCEL_DEPLOY.md` for detailed troubleshooting and advanced setup.

---

🦞 **Ready to go!**
