# Railway Deployment Guide - Network Metrics Collection

This guide shows you how to deploy the AURA application with continuous network metrics collection on Railway.

## Overview

Your Railway deployment will include:
- **Web Service**: The main AURA web application
- **Worker Service**: Background metrics collector (runs 24/7 in the cloud)

Both services share the same environment variables and database, with zero local setup required.

## Prerequisites

1. Railway account (free tier works great)
2. GitHub repository connected to Railway
3. Supabase project with schema installed (see NETWORK_REWIND_README.md)
4. Campus Controller credentials

## Deployment Steps

### 1. Initial Deployment (Web Only)

If you haven't deployed yet:

1. Go to [Railway](https://railway.app/)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will automatically detect and build your app

### 2. Configure Environment Variables

In your Railway project dashboard, add these variables:

#### Required for Web App:
```
NODE_ENV=production
```

#### Required for Metrics Collector:
```
CAMPUS_CONTROLLER_URL=https://tsophiea.ddns.net:443/management
CAMPUS_CONTROLLER_USER=your_username
CAMPUS_CONTROLLER_PASSWORD=your_password
VITE_SUPABASE_URL=https://sdcanlpqxfjcmjpeaesj.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
COLLECTION_INTERVAL_MINUTES=15
```

**How to add variables:**
1. Click on your service
2. Go to "Variables" tab
3. Click "New Variable"
4. Add each variable above

### 3. Add Worker Service

Railway needs a second service to run the metrics collector:

#### Option A: Using Railway Dashboard (Recommended)

1. In your Railway project, click "+ New"
2. Select "Empty Service"
3. Name it "metrics-worker" or similar
4. In the new service settings:
   - Go to "Settings" → "Source"
   - Link it to the same GitHub repository
   - Set "Root Directory" to `.` (same as web)
5. Go to "Settings" → "Deploy"
   - Set "Custom Start Command" to: `node metrics-collector.js`
6. Go to "Variables" tab
   - Add the same environment variables as above
   - OR use "Reference Variables" to share from the web service

#### Option B: Using Procfile (Alternative)

The `Procfile` is already created with:
```
web: npx serve build -s -l $PORT
worker: node metrics-collector.js
```

To use it with Railway v2:
1. In project settings, enable "Multi-Process Support"
2. Railway will automatically detect and run both processes

**Note:** Some Railway plans may require manual service creation (Option A).

### 4. Verify Deployment

#### Check Web Service:
1. Go to your web service in Railway
2. Click on the deployment URL
3. Open the application
4. Navigate to "Service Levels" page
5. Select a service
6. You should see the Network Rewind component

#### Check Worker Service:
1. Go to your worker service in Railway
2. Click "Deployments" → Select latest deployment
3. Click "View Logs"
4. You should see:
```
╔════════════════════════════════════════════════════════════╗
║        Network Metrics Background Collector               ║
╚════════════════════════════════════════════════════════════╝

⚙️  Configuration:
   Campus Controller: https://tsophiea.ddns.net:443/management
   User: admin
   Supabase: https://sdcanlpqxfjcmjpeaesj.supabase.co
   Collection Interval: 15 minutes

🔐 Authenticating with Campus Controller...
✅ Authentication successful

📊 Starting metrics collection...
   Found 5 services
   ✅ Guest-WiFi: 12 clients
   ✅ Corporate-WiFi: 45 clients
   ...

✨ Collection complete: 5 success, 0 failed

⏰ Scheduled to run every 15 minutes
```

### 5. Verify Data Collection

Wait 15-30 minutes, then check Supabase:

```sql
SELECT
  service_name,
  timestamp,
  (metrics->>'clientCount')::int as clients
FROM service_metrics
ORDER BY timestamp DESC
LIMIT 20;
```

You should see metrics being collected every 15 minutes.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CAMPUS_CONTROLLER_URL` | No | `https://tsophiea.ddns.net:443/management` | Campus Controller API URL |
| `CAMPUS_CONTROLLER_USER` | **Yes** | - | Username for Campus Controller |
| `CAMPUS_CONTROLLER_PASSWORD` | **Yes** | - | Password (use Railway's secret variables) |
| `VITE_SUPABASE_URL` | **Yes** | - | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | - | Supabase anon key |
| `COLLECTION_INTERVAL_MINUTES` | No | `15` | Collection frequency (minutes) |
| `NODE_ENV` | No | `production` | Node environment |

### Railway Resource Usage

**Free Tier:**
- ✅ 500 hours/month (enough for 1 web + 1 worker service)
- ✅ $5 worth of usage included
- ✅ Shared CPU and memory

**Pro Tier:** ($20/month)
- ✅ Unlimited hours
- ✅ Priority support
- ✅ Better performance

The metrics collector is very lightweight (<10 MB RAM, minimal CPU).

## Monitoring

### View Worker Logs

**Railway Dashboard:**
1. Click on your worker service
2. Go to "Deployments"
3. Select the active deployment
4. Click "View Logs"
5. Filter by log level if needed

### Check Health

**Verify Collection:**
```sql
-- Check recent data points
SELECT COUNT(*), MAX(timestamp) as last_collection
FROM service_metrics
WHERE timestamp > NOW() - INTERVAL '1 hour';

-- Should see 4 collections per hour (every 15 min)
```

**Check Service Status:**
- Railway dashboard shows service status (green = running)
- Worker should have "Active" deployment status
- Check CPU and memory usage in "Metrics" tab

### Troubleshooting

#### Worker Not Starting

**Symptoms:** Service shows "Crashed" or "Failed"

**Solutions:**
1. Check logs for error messages
2. Verify all environment variables are set
3. Test Supabase connection:
   ```sql
   SELECT 1 FROM service_metrics LIMIT 1;
   ```
4. Verify Campus Controller credentials in a browser first

#### No Data Being Collected

**Symptoms:** No metrics in Supabase after 30+ minutes

**Solutions:**
1. Check worker logs for authentication errors
2. Verify Supabase anon key has write permissions
3. Check database schema is installed correctly:
   ```sql
   \d service_metrics
   ```
4. Verify Network Rewind component shows "No Data" (not "Loading")

#### Authentication Failures

**Symptoms:** Logs show "Authentication failed (401)"

**Solutions:**
1. Verify credentials are correct
2. Check Campus Controller is accessible from Railway's IP range
3. Try logging in manually through web UI with same credentials
4. Check for special characters in password (may need escaping)

#### High Memory Usage

**Symptoms:** Worker uses >100 MB RAM

**Solutions:**
1. Reduce `COLLECTION_INTERVAL_MINUTES` (collect less frequently)
2. Limit number of stations stored per service (already capped at 100)
3. Check for memory leaks in logs
4. Restart the service

## Cost Optimization

### Free Tier Strategy:
- Use 15-minute collection interval (default)
- Monitor your hour usage in Railway dashboard
- Worker uses ~360 hours/month (24/7)
- Web uses hours only when accessed
- Stay under 500 total hours/month

### If Approaching Limits:
1. **Increase interval:** Set `COLLECTION_INTERVAL_MINUTES=30` (halves usage)
2. **Pause when not needed:** Manually stop worker service
3. **Upgrade to Pro:** $20/month for unlimited hours

## Updating the Deployment

### Update Code:
1. Push changes to GitHub
2. Railway auto-deploys both services
3. Check logs to verify successful deployment

### Update Environment Variables:
1. Go to service "Variables" tab
2. Edit existing variable or add new one
3. Railway automatically restarts services

### Restart Services:
**Manual Restart:**
1. Go to service in Railway dashboard
2. Click three dots (⋮)
3. Select "Restart"

**Force Redeploy:**
1. Go to "Deployments" tab
2. Click "Deploy" → "Redeploy"

## Security Best Practices

1. **Use Railway's Secret Variables**
   - Mark sensitive vars as "secret" (hidden in logs)
   - Especially: `CAMPUS_CONTROLLER_PASSWORD`, `VITE_SUPABASE_ANON_KEY`

2. **Limit Supabase Permissions**
   - Use anon key (not service_role)
   - Enable Row Level Security (RLS) on tables
   - Grant only INSERT permission to `service_metrics`

3. **Rotate Credentials**
   - Change Campus Controller password periodically
   - Update Railway variables after rotation

4. **Monitor Access**
   - Review Railway audit logs
   - Check Supabase API logs
   - Set up alerts for authentication failures

## Network Rewind Integration

Once both services are deployed:

1. **Web UI** displays the Network Rewind component
2. **Worker** collects data 24/7 in the background
3. **Supabase** stores up to 90 days of history
4. **Users** can drag the time slider to view historical metrics

The system is fully cloud-based:
- ✅ No local infrastructure needed
- ✅ Automatic failover and restarts
- ✅ Scales with your usage
- ✅ Zero maintenance required

## Railway CLI (Optional)

For advanced users, install Railway CLI:

```bash
# Install
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# View logs
railway logs --service metrics-worker

# Run commands
railway run node metrics-collector.js

# Deploy
railway up
```

## Support

### Railway Issues:
- [Railway Documentation](https://docs.railway.app/)
- [Railway Discord](https://discord.gg/railway)
- Railway dashboard support chat

### Metrics Collector Issues:
- Check logs in Railway dashboard
- Verify environment variables
- Test Campus Controller API manually
- Review Supabase logs

### Network Rewind UI Issues:
- See NETWORK_REWIND_README.md
- Check browser console for errors
- Verify Supabase connection from browser

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Railway Platform                     │
│                                                         │
│  ┌─────────────────┐      ┌──────────────────────┐    │
│  │   Web Service   │      │   Worker Service     │    │
│  │                 │      │                      │    │
│  │  - Vite Build   │      │  - metrics-collector │    │
│  │  - Serve Static │      │  - Runs 24/7         │    │
│  │  - Port $PORT   │      │  - Every 15 min      │    │
│  └────────┬────────┘      └──────────┬───────────┘    │
│           │                          │                 │
└───────────┼──────────────────────────┼─────────────────┘
            │                          │
            │    ┌─────────────────────┘
            │    │
            │    │
     ┌──────▼────▼──────┐          ┌────────────────────┐
     │                  │          │                    │
     │   Supabase DB    │◄─────────┤  Campus Controller │
     │                  │          │  API               │
     │  - service_      │          │                    │
     │    metrics       │          │  - /v1/services    │
     │  - 90 day        │          │  - /v1/stations    │
     │    retention     │          │  - OAuth2          │
     │                  │          │                    │
     └──────────────────┘          └────────────────────┘
            ▲
            │
    ┌───────┴────────┐
    │   End Users    │
    │   (Browser)    │
    └────────────────┘
```

## Next Steps

1. ✅ Deploy web service to Railway
2. ✅ Add environment variables
3. ✅ Deploy worker service
4. ✅ Verify logs show successful collection
5. ✅ Wait 15-30 minutes for data
6. ✅ Open web UI and test Network Rewind slider
7. ✅ Monitor Railway resource usage

## See Also

- [NETWORK_REWIND_README.md](./NETWORK_REWIND_README.md) - Feature overview
- [supabase-schema.sql](./supabase-schema.sql) - Database schema
- [metrics-collector.js](./metrics-collector.js) - Worker source code
- [Procfile](./Procfile) - Process definitions
