# Railway Free Tier Deployment Guide

## ⚠️ Important: Free Tier Limitations

Railway's free tier includes:
- **$5 monthly credit** (usage-based pricing)
- **500 execution hours/month** across all services

A 24/7 worker service uses **~720 hours/month**, which **EXCEEDS the free tier**.

## Solutions to Stay Within Free Tier

### Option 1: Use GitHub Actions (Recommended - 100% Free)

Deploy the web app on Railway, but run metrics collection via GitHub Actions cron jobs.

**Advantages:**
- ✅ Completely free (2,000 minutes/month for GitHub Actions)
- ✅ Reliable scheduling
- ✅ No Railway worker needed
- ✅ Web app stays within free tier

**Setup:**

1. **Add GitHub Secrets** (in your repo settings → Secrets and variables → Actions):
   ```
   CAMPUS_CONTROLLER_URL
   CAMPUS_CONTROLLER_USER
   CAMPUS_CONTROLLER_PASSWORD
   SUPABASE_URL
   SUPABASE_ANON_KEY
   ```

2. **GitHub Action is ready** (see `.github/workflows/metrics-collection.yml`)

3. **Runs automatically every 30 minutes**

### Option 2: Railway Worker with Reduced Hours

Run the worker only during business hours to stay under 500 hours/month.

**Configuration:**
- Run 12 hours/day = 360 hours/month ✅ (within limit)
- Collect during: 6 AM - 6 PM (adjust to your timezone)

See `metrics-collector-scheduled.js` for implementation.

### Option 3: Upgrade Railway to Hobby Plan

**Cost:** $5/month (gets 500 more hours)
- Worker: 720 hours
- Web: 280 hours remaining
- **Total: 1000 hours** (fits!)

**To upgrade:**
1. Go to Railway dashboard
2. Project Settings → Plans
3. Upgrade to Hobby

---

## Recommended Setup: GitHub Actions + Railway Web

This is the **best free solution**:

### Architecture:
```
┌─────────────────────────────────────────────┐
│           GitHub Actions (Free)             │
│  Runs every 30 minutes via cron schedule   │
│  - Collects metrics from Campus Controller  │
│  - Stores in Supabase                       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │    Supabase DB   │
         │  (Free Tier)     │
         └─────────┬────────┘
                   ▲
                   │
         ┌─────────┴────────┐
         │  Railway Web     │
         │  (Free Tier)     │
         │  - AURA UI       │
         │  - Network Rewind│
         └──────────────────┘
```

### Cost Breakdown:
- **GitHub Actions:** Free (2,000 min/month limit, we use ~60 min/month)
- **Railway Web:** Free ($5 credit covers it with low traffic)
- **Supabase:** Free (500 MB database, auto-cleanup after 90 days)
- **Total: $0/month** ✅

---

## Step-by-Step Deployment

### Part 1: Deploy Web App to Railway

1. **Push your code to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Add Network Rewind feature with GitHub Actions metrics collection"
   git push origin main
   ```

2. **Connect to Railway:**
   - Go to [Railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects and builds

3. **Add Environment Variables** (Railway dashboard → Variables):
   ```
   VITE_SUPABASE_URL=https://sdcanlpqxfjcmjpeaesj.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

4. **Verify deployment:**
   - Wait for build to complete
   - Click the generated URL
   - Navigate to Service Levels page
   - You should see Network Rewind component

### Part 2: Setup GitHub Actions for Metrics Collection

1. **Enable GitHub Actions** (if not already enabled):
   - Go to your GitHub repo
   - Click "Actions" tab
   - Enable workflows if prompted

2. **Add Secrets** (Settings → Secrets and variables → Actions → New repository secret):

   Click "New repository secret" for each:

   | Name | Value |
   |------|-------|
   | `CAMPUS_CONTROLLER_URL` | `https://tsophiea.ddns.net:443/management` |
   | `CAMPUS_CONTROLLER_USER` | Your Campus Controller username |
   | `CAMPUS_CONTROLLER_PASSWORD` | Your Campus Controller password |
   | `SUPABASE_URL` | `https://sdcanlpqxfjcmjpeaesj.supabase.co` |
   | `SUPABASE_ANON_KEY` | Your Supabase anon key |

3. **Verify GitHub Action:**
   - Go to Actions tab in your repo
   - You should see "Network Metrics Collection"
   - Click on it to see scheduled runs
   - Wait 30 minutes or click "Run workflow" to test immediately

4. **Check logs:**
   - Click on a workflow run
   - Click "collect-metrics" job
   - Verify successful collection

### Part 3: Setup Supabase Database

1. **Run the schema:**
   - Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/sdcanlpqxfjcmjpeaesj/sql)
   - Copy contents of `supabase-schema.sql`
   - Click "Run"

2. **Verify table creation:**
   ```sql
   SELECT * FROM service_metrics LIMIT 10;
   ```

3. **Configure RLS (Row Level Security):**
   The schema includes proper RLS policies for security.

### Part 4: Verify End-to-End

1. **Wait 30-60 minutes** for data collection

2. **Check Supabase data:**
   ```sql
   SELECT
     service_name,
     timestamp,
     (metrics->>'clientCount')::int as clients
   FROM service_metrics
   ORDER BY timestamp DESC
   LIMIT 20;
   ```

3. **Test the UI:**
   - Open your Railway deployment URL
   - Go to Service Levels
   - Select a service
   - Network Rewind should show the time slider
   - Drag slider to view historical data

---

## Monitoring

### GitHub Actions:
- Go to repo → Actions tab
- Check recent workflow runs
- Green checkmark = successful
- Red X = failed (click to see logs)

### Railway:
- Dashboard shows resource usage
- Monitor your $5 credit consumption
- Web app should use minimal resources

### Supabase:
- Dashboard → Database → Logs
- Monitor storage usage (should stay under 100 MB)
- Check API usage

---

## Troubleshooting

### GitHub Action Fails

**Error: "Authentication failed"**
- Verify GitHub secrets are set correctly
- Check Campus Controller credentials in browser
- Ensure no special characters need escaping

**Error: "Supabase connection failed"**
- Verify SUPABASE_URL and SUPABASE_ANON_KEY secrets
- Check database schema is installed
- Verify RLS policies allow inserts

### No Data Appearing

**Check GitHub Actions logs:**
1. Go to Actions tab
2. Click latest run
3. Check for errors in logs

**Check Supabase:**
```sql
-- Should see data
SELECT COUNT(*) FROM service_metrics;

-- If zero, check RLS policies
SELECT * FROM service_metrics; -- Run as authenticated user
```

### Railway Runs Out of Credit

**Monitor usage:**
- Dashboard → Project → Usage
- If approaching $5 limit, consider:
  - Reducing traffic
  - Optimizing build
  - Upgrading to Hobby plan ($5/month)

---

## Cost Optimization

### Staying Free Forever:

1. **GitHub Actions** (metrics collection):
   - ✅ 2,000 minutes/month free
   - Current usage: ~60 minutes/month
   - Plenty of headroom

2. **Railway Web** (AURA app):
   - Keep traffic moderate
   - Use efficient build (Vite is already optimized)
   - Monitor monthly usage

3. **Supabase** (database):
   - Auto-cleanup after 90 days keeps storage low
   - Free tier: 500 MB database
   - Current usage: ~50 MB for 90 days

### If You Need More:

**GitHub Actions:**
- Increase to 3,000 minutes for $4/month
- But you won't need this for metrics collection

**Railway:**
- Hobby plan: $5/month (500 more hours)
- Pro plan: $20/month (unlimited)

**Supabase:**
- Pro plan: $25/month (8 GB database + better performance)
- But free tier is sufficient for this use case

---

## Alternative: Render.com (Also Free)

If you prefer an all-in-one solution, Render offers:
- Free web service
- Free background workers (with limitations)
- 750 hours/month free

See `RENDER_DEPLOYMENT.md` for setup instructions.

---

## Summary

✅ **Recommended FREE Setup:**
- Railway: Web app (free tier)
- GitHub Actions: Metrics collection (free, 2,000 min/month)
- Supabase: Database (free tier, 500 MB)

✅ **Total Cost: $0/month**

✅ **Stays within all free tier limits**

✅ **Reliable and automatic**

Ready to deploy? Follow the step-by-step instructions above!
