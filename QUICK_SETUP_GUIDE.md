# Quick Setup Guide - 7-Day Historical Database

Complete this in 10 minutes to have 24/7 background metrics collection.

## Step 1: Deploy Database Schema (2 minutes)

### Option A: Supabase SQL Editor (Recommended)

1. **Open SQL Editor:**
   ```
   https://supabase.com/dashboard/project/ufqjnesldbacyltbsvys/sql
   ```

2. **Run this command in your terminal to copy the schema:**
   ```bash
   cat supabase-schema-enhanced.sql | pbcopy  # macOS
   # OR
   cat supabase-schema-enhanced.sql  # Then manually copy
   ```

3. **Paste into SQL Editor and click "Run"**

4. **Verify:** Run this query:
   ```sql
   SELECT * FROM retention_config ORDER BY table_name;
   ```
   You should see 5 rows.

### Option B: Use Service Role Key

```bash
# Save your key to .env
echo "SUPABASE_SERVICE_KEY=sbp_056d64f58fee47ffaf1e61b59d910371cfa6d936" >> .env

# Run manual SQL commands via psql or continue with Option A
```

---

## Step 2: Fix GitHub Actions (5 minutes)

### 2.1: Add GitHub Secrets

Go to your repository settings:
```
https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions
```

Click "New repository secret" for each:

| Secret Name | Value | Where to Find |
|-------------|-------|---------------|
| `CAMPUS_CONTROLLER_URL` | `https://tsophiea.ddns.net:443/management` | Fixed value |
| `CAMPUS_CONTROLLER_USER` | Your username | Your Campus Controller login |
| `CAMPUS_CONTROLLER_PASSWORD` | Your password | Your Campus Controller password |
| `SUPABASE_URL` | `https://ufqjnesldbacyltbsvys.supabase.co` | Fixed value (or check .env) |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | Your Supabase anon key (from .env or Supabase dashboard) |

**To find your Supabase Anon Key:**
- Go to: https://supabase.com/dashboard/project/ufqjnesldbacyltbsvys/settings/api
- Copy the "anon" / "public" key (NOT the service_role key)

### 2.2: Enable GitHub Actions

1. Go to your repo → **Actions** tab
2. If you see "Workflows aren't being run on this repository":
   - Click "I understand my workflows, go ahead and enable them"
3. Find "Network Metrics Collection" in the workflow list
4. If it says "disabled":
   - Click on it
   - Click "Enable workflow"

### 2.3: Test the Workflow

1. On the "Network Metrics Collection" workflow page:
   - Click "Run workflow" dropdown
   - Click "Run workflow" button
2. Wait ~2 minutes
3. Click on the running workflow to see logs
4. Check for ✅ success or ❌ errors

### 2.4: Common GitHub Actions Issues

**Issue: "CAMPUS_CONTROLLER_USER is required"**
- Fix: You forgot to add one of the secrets in Step 2.1

**Issue: "Authentication failed (401)"**
- Fix: Wrong username or password in secrets

**Issue: "Table does not exist"**
- Fix: Run Step 1 to deploy the database schema

**Issue: "Permission denied" or workflow doesn't run**
- Fix: Check repo Settings → Actions → General
- Make sure "Allow all actions and reusable workflows" is selected

---

## Step 3: Verify Everything Works (3 minutes)

### 3.1: Check GitHub Actions Logs

After the workflow runs successfully, check the logs:

```
Actions tab → Network Metrics Collection → Latest run → View logs
```

Look for:
```
✅ Authentication successful
✅ Supabase connection successful
✅ Collection complete: X success, 0 failed
```

### 3.2: Check Supabase Data

Run this in Supabase SQL Editor:

```sql
-- Check data was collected
SELECT
  COUNT(*) as total_snapshots,
  MIN(timestamp) as oldest_data,
  MAX(timestamp) as newest_data,
  MAX(timestamp) AT TIME ZONE 'UTC' as newest_utc
FROM service_metrics_snapshots;
```

Expected:
- `total_snapshots` > 0
- `newest_data` is recent (within last 30 minutes)

### 3.3: View the Data

```sql
-- See latest metrics for each service
SELECT
  service_name,
  timestamp,
  metrics->>'clientCount' as clients,
  metrics->>'throughput' as throughput,
  metrics->>'reliability' as reliability
FROM service_metrics_snapshots
ORDER BY timestamp DESC
LIMIT 10;
```

---

## Step 4: Schedule Cleanup (2 minutes)

### Option A: GitHub Actions (Recommended - Free)

The cleanup is already scheduled! GitHub Actions will run:
- Metrics collection: Every 30 minutes
- No cleanup needed initially (you have 7-90 days of retention)

To manually run cleanup later:

```bash
node cleanup-old-data.js
```

### Option B: Add Cleanup to GitHub Actions

Create `.github/workflows/cleanup.yml`:

```yaml
name: Database Cleanup

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci --production
      - name: Run cleanup
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: node cleanup-old-data.js
```

Commit and push this file.

---

## Troubleshooting

### GitHub Actions keeps failing

1. **Check secrets are set:**
   - Go to repo Settings → Secrets and variables → Actions
   - Verify all 5 secrets exist

2. **Check workflow is enabled:**
   - Go to Actions tab
   - Click on "Network Metrics Collection"
   - Should NOT say "This workflow is disabled"

3. **Check logs:**
   - Click on the failed run
   - Click on "collect-metrics" job
   - Read the error message
   - Most common: Missing secrets or wrong credentials

### No data in Supabase

1. **Check if workflow ran:**
   ```
   Actions tab → Should see green checkmarks
   ```

2. **Check if table exists:**
   ```sql
   SELECT tablename FROM pg_tables
   WHERE tablename = 'service_metrics_snapshots';
   ```
   If empty, re-run Step 1.

3. **Check for errors in workflow logs**

### "relation does not exist" error

This means the database schema wasn't deployed. Re-run Step 1.

---

## What Happens Next

### Automatic Collection

GitHub Actions will now:
- ✅ Run every 30 minutes (48 times per day)
- ✅ Collect metrics from all services
- ✅ Save to Supabase
- ✅ Work 24/7 without your computer on
- ✅ No Railway hours used (completely free)

### View Historical Data in UI

1. Open your AURA app
2. Go to Service Levels page
3. Select a service
4. After 30-60 minutes of collection:
   - The Network Rewind slider will appear
   - You can view historical data
   - Compare performance over time

### Storage Usage

With default settings (30-min interval, 7-day retention):
- ~2 MB for 7 days
- ~15 MB for 90 days
- Well within Supabase free tier (500 MB)

---

## Next Steps

### Immediate

- ✅ Deploy database schema (Step 1)
- ✅ Configure GitHub Actions (Step 2)
- ✅ Verify it works (Step 3)
- ⏳ Wait 30 minutes for first collection

### After First Collection

- View data in Supabase SQL editor
- Check GitHub Actions runs every 30 minutes
- Verify Network Rewind appears in UI

### Optional Enhancements

- Add AP event tracking
- Add client connection events
- Reduce interval to 15 minutes
- Extend retention to 30 or 90 days

---

## Security Reminder

After setup is complete:

1. ✅ GitHub secrets are encrypted (safe)
2. ⚠️ Rotate the service role key you shared earlier:
   - Go to: https://supabase.com/dashboard/project/ufqjnesldbacyltbsvys/settings/api
   - Under "Service role", click "Reset"
3. ✅ Never commit .env file to git
4. ✅ Use anon key in application code (not service key)

---

## Summary Checklist

- [ ] Step 1: Database schema deployed to Supabase
- [ ] Step 2.1: All 5 GitHub secrets added
- [ ] Step 2.2: GitHub Actions enabled
- [ ] Step 2.3: Test workflow ran successfully (green checkmark)
- [ ] Step 3.1: Workflow logs show ✅ success
- [ ] Step 3.2: Supabase has data (total_snapshots > 0)
- [ ] Step 3.3: Can view metrics in SQL editor
- [ ] Step 4: Cleanup scheduled (optional, can do later)

**When all checkboxes are complete: You're done!** 🎉

Your historical database is now collecting 24/7 in the background.

---

## Support

If you get stuck:

1. Check the troubleshooting section above
2. Review GitHub Actions logs for errors
3. Check Supabase logs
4. Re-read the step where you got stuck

Most issues are:
- Missing GitHub secrets (Step 2.1)
- Wrong credentials in secrets
- Schema not deployed (Step 1)
- Workflow not enabled (Step 2.2)
