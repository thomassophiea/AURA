# 🚀 Quick Deployment Checklist (100% Free)

Follow this checklist to deploy AURA with Network Rewind feature completely free using Railway + GitHub Actions.

## ✅ Pre-Deployment

- [ ] You have a GitHub account
- [ ] You have a Railway account ([sign up free](https://railway.app))
- [ ] You have a Supabase account ([sign up free](https://supabase.com))
- [ ] You have Campus Controller credentials (username + password)
- [ ] Your code is pushed to a GitHub repository

## 📦 Part 1: Supabase Setup (5 minutes)

- [ ] **Create Supabase project** (if not already)
  - Go to [Supabase Dashboard](https://supabase.com/dashboard)
  - Click "New Project"
  - Choose organization and enter project details

- [ ] **Run database schema**
  1. Go to your project → SQL Editor
  2. Click "New Query"
  3. Copy entire contents of `supabase-schema.sql`
  4. Paste and click "Run"
  5. Verify success: `SELECT COUNT(*) FROM service_metrics;`

- [ ] **Get your Supabase credentials**
  - Go to Settings → API
  - Copy `Project URL`: `https://[your-project].supabase.co`
  - Copy `anon public` key (NOT service_role)
  - Save these for later

## 🌐 Part 2: Railway Web App (10 minutes)

- [ ] **Connect GitHub repo to Railway**
  1. Go to [Railway Dashboard](https://railway.app/dashboard)
  2. Click "New Project"
  3. Select "Deploy from GitHub repo"
  4. Authorize Railway to access your GitHub
  5. Select your repository
  6. Railway will start building automatically

- [ ] **Add environment variables**
  1. Click on your service in Railway
  2. Go to "Variables" tab
  3. Click "New Variable" and add:
     ```
     VITE_SUPABASE_URL=https://[your-project].supabase.co
     VITE_SUPABASE_ANON_KEY=[your-anon-key]
     ```
  4. Service will redeploy automatically

- [ ] **Verify web deployment**
  - Wait for deployment to complete (green checkmark)
  - Click "View Logs" to check for errors
  - Click the generated URL to open your app
  - Navigate to "Service Levels" page
  - Verify Network Rewind component appears (will show "No Data" initially)

## ⚙️ Part 3: GitHub Actions Setup (5 minutes)

- [ ] **Enable GitHub Actions**
  1. Go to your GitHub repository
  2. Click "Actions" tab
  3. Enable workflows if prompted
  4. You should see "Network Metrics Collection" workflow

- [ ] **Add GitHub Secrets**
  1. Go to repository Settings
  2. Click "Secrets and variables" → "Actions"
  3. Click "New repository secret" for each:

     | Name | Value | Where to get it |
     |------|-------|-----------------|
     | `CAMPUS_CONTROLLER_URL` | `https://tsophiea.ddns.net:443/management` | Your Campus Controller URL |
     | `CAMPUS_CONTROLLER_USER` | `admin` | Your username |
     | `CAMPUS_CONTROLLER_PASSWORD` | `your_password` | Your password |
     | `SUPABASE_URL` | `https://[project].supabase.co` | From Supabase Settings → API |
     | `SUPABASE_ANON_KEY` | `eyJ...` | From Supabase Settings → API (anon key) |

- [ ] **Test GitHub Action manually**
  1. Go to Actions tab
  2. Click "Network Metrics Collection"
  3. Click "Run workflow" → "Run workflow"
  4. Wait for it to complete (~2 minutes)
  5. Click on the run to view logs
  6. Verify you see "✅ All metrics collected successfully"

## ✅ Part 4: Verification (30-60 minutes)

- [ ] **Wait for automatic collection**
  - GitHub Actions runs every 30 minutes
  - Wait for 2-3 collections (~60 minutes)

- [ ] **Verify data in Supabase**
  1. Go to Supabase → SQL Editor
  2. Run:
     ```sql
     SELECT
       service_name,
       timestamp,
       (metrics->>'clientCount')::int as clients
     FROM service_metrics
     ORDER BY timestamp DESC
     LIMIT 20;
     ```
  3. You should see multiple rows with recent timestamps

- [ ] **Test Network Rewind in UI**
  1. Open your Railway deployment URL
  2. Go to Service Levels page
  3. Select a service
  4. Network Rewind component should show:
     - Time slider (not grayed out)
     - Date range at bottom
     - "LIVE" badge in green
  5. Try dragging the slider left to view historical data
  6. Verify metrics update when you change time

## 🎉 Deployment Complete!

If all checkboxes are checked, your deployment is successful!

---

## 📊 Monitoring Your Free Tier Usage

### GitHub Actions
- **Limit:** 2,000 minutes/month
- **Usage:** ~60 minutes/month (30 min intervals)
- **Check:** Repository → Settings → Billing

### Railway
- **Limit:** $5 credit/month
- **Usage:** Variable (based on traffic)
- **Check:** Railway Dashboard → Project → Usage

### Supabase
- **Limit:** 500 MB database
- **Usage:** ~50 MB for 90 days of data
- **Check:** Supabase Dashboard → Settings → Usage

---

## ❌ Troubleshooting

### GitHub Action fails with "Authentication failed"
**Fix:**
- Verify `CAMPUS_CONTROLLER_USER` and `CAMPUS_CONTROLLER_PASSWORD` secrets
- Try logging into Campus Controller manually with same credentials
- Check for typos in secrets

### GitHub Action fails with "Supabase connection failed"
**Fix:**
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` secrets
- Make sure database schema was run successfully
- Check Supabase project is active (not paused)

### Network Rewind shows "No Data"
**Fix:**
- Wait 30-60 minutes for data collection
- Check GitHub Actions logs for errors
- Verify Supabase has data: `SELECT COUNT(*) FROM service_metrics;`
- Check browser console for errors

### Railway deployment fails
**Fix:**
- Check build logs in Railway dashboard
- Verify `package.json` is correct
- Make sure all dependencies are listed
- Try redeploying: Deployments → Redeploy

### UI doesn't show Network Rewind component
**Fix:**
- Make sure you're on the Service Levels page
- Select a service from the dropdown
- Check browser console for React errors
- Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in Railway

---

## 🆘 Need Help?

1. **Check the logs:**
   - GitHub Actions: Actions tab → Latest run → View logs
   - Railway: Service → Deployments → View Logs
   - Supabase: Dashboard → Logs
   - Browser: F12 → Console tab

2. **Review documentation:**
   - [RAILWAY_FREE_TIER_DEPLOYMENT.md](./RAILWAY_FREE_TIER_DEPLOYMENT.md) - Detailed guide
   - [NETWORK_REWIND_README.md](./NETWORK_REWIND_README.md) - Feature overview
   - [supabase-schema.sql](./supabase-schema.sql) - Database schema

3. **Common issues:**
   - Secrets not set correctly → Double-check spelling and values
   - Database schema not run → Run `supabase-schema.sql` again
   - GitHub Actions disabled → Enable in repository settings
   - Railway out of credit → Check usage dashboard

---

## 🎯 What's Next?

Once everything is working:

- ✅ Data collects every 30 minutes automatically
- ✅ 90 days of historical data available
- ✅ Network Rewind slider lets you view past metrics
- ✅ Everything runs free in the cloud
- ✅ No local infrastructure needed

**Total cost: $0/month** 🎉

Enjoy your Network Rewind feature!
