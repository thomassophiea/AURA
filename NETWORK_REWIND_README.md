# Network Rewind Feature

A time-series data storage and replay feature for viewing historical network metrics up to 90 days in the past.

## What's Been Built

### Core Files Created:
1. **src/services/supabaseClient.ts** - Supabase client configuration
2. **supabase-schema.sql** - Database schema (needs to be run in Supabase)
3. **.env.example** - Environment variable template

### Additional Files (see INTEGRATION_GUIDE.md for code):
- **src/services/metricsStorage.ts** - Time-series data storage service
- **src/hooks/useMetricsCollection.ts** - React hook for periodic collection  
- **src/components/NetworkRewind.tsx** - UI slider component

## Quick Start

### 1. Set Up Supabase Database (5 minutes)

```bash
# 1. Go to Supabase SQL Editor
https://supabase.com/dashboard/project/sdcanlpqxfjcmjpeaesj/sql

# 2. Copy and run the contents of supabase-schema.sql
# This creates the necessary tables and indexes
```

### 2. Configure Environment (2 minutes)

```bash
# 1. Get your anon key from:
https://supabase.com/dashboard/project/sdcanlpqxfjcmjpeaesj/settings/api

# 2. Create .env.local file:
cp .env.example .env.local

# 3. Add your actual anon key to .env.local
VITE_SUPABASE_ANON_KEY=your_actual_key_here
```

### 3. Deploy Metrics Collector (IMPORTANT!)

The Network Rewind component has been integrated into the UI, but metrics will only be collected when:
- **Option A (Recommended):** Deploy the worker service to Railway for 24/7 collection
- **Option B:** Keep the Service Levels page open in your browser

**For Railway deployment (24/7 collection in the cloud):**
See **RAILWAY_DEPLOYMENT.md** for complete setup instructions.

Quick summary:
1. Add a worker service in Railway dashboard
2. Set start command: `node metrics-collector.js`
3. Add environment variables (Campus Controller credentials + Supabase config)
4. Worker runs continuously in the cloud, no local setup needed!

## How It Works

### Data Collection
- Automatically collects service metrics every 15 minutes
- Stores in Supabase PostgreSQL database
- Retains data for 90 days (auto-cleanup)
- Graceful fallback if Supabase not configured

### User Experience
1. **Live Mode** (default):
   - Shows real-time data
   - Green "LIVE" badge
   - Data auto-refreshes

2. **Historical Mode**:
   - Move slider to view past data
   - Shows metrics from selected timestamp
   - "Return to Live" button to exit

3. **Time Range Compatibility**:
   - Works with existing 1h/24h/7d tabs
   - Tabs control aggregation window
   - Slider controls point in time

## Features

✅ Up to 90 days of historical data  
✅ 15-minute collection interval  
✅ Time slider with date/time display  
✅ Live/Historical mode toggle  
✅ Automatic data cleanup  
✅ Indexed queries for fast retrieval  
✅ Graceful degradation without Supabase  
✅ Works with existing time range filters  
✅ Row-level security enabled  

## Storage Requirements

- ~96 data points per day per service
- ~4.3 MB per service for 90 days
- For 10 services: ~43 MB total
- Supabase free tier: 500 MB ✓

## Next Steps

1. ✅ Database schema created (supabase-schema.sql)
2. ✅ Supabase client configured
3. ✅ Core services and hooks documented
4. ⏳ Run SQL schema in Supabase dashboard
5. ⏳ Add anon key to .env.local
6. ⏳ Integrate code into ServiceLevelsEnhanced (see INTEGRATION_GUIDE.md)
7. ⏳ Test and verify data collection

## Documentation

- **NETWORK_REWIND_SETUP.md** - Complete setup guide with troubleshooting
- **INTEGRATION_GUIDE.md** - Step-by-step code integration
- **supabase-schema.sql** - Database schema to run in Supabase

## Testing

After integration:
1. Open browser console
2. Look for `[MetricsCollection] Starting periodic collection...`
3. Wait 15-30 minutes for first data point
4. Network Rewind component will show time slider
5. Move slider to view historical data

## Support

Check browser console for:
- `[MetricsStorage]` - Storage operations
- `[MetricsCollection]` - Collection status
- Errors will indicate what needs configuration

## Future Enhancements

- Data export to CSV
- Time period comparison view
- Anomaly detection
- Scheduled reports
- Custom collection intervals via UI
