# Network Metrics Background Collector

A standalone Node.js service that continuously collects network service metrics from Campus Controller and stores them in Supabase for historical analysis.

## Overview

Unlike the browser-based collection (which only works when the Service Levels page is open), this background collector runs 24/7 independently, ensuring continuous data collection for the Network Rewind feature.

## Features

- ✅ **24/7 Data Collection** - Runs continuously in the background
- ✅ **Automatic Authentication** - Handles Campus Controller login and token refresh
- ✅ **Multi-Service Support** - Collects metrics for all configured services
- ✅ **Error Resilience** - Automatically retries on failures
- ✅ **Configurable Interval** - Defaults to 15 minutes, fully customizable
- ✅ **Graceful Shutdown** - Handles SIGINT/SIGTERM signals properly
- ✅ **Self-Signed Certificate Support** - Works with lab environments

## Prerequisites

1. **Node.js 18+** installed
2. **Supabase database** configured (see NETWORK_REWIND_README.md)
3. **Campus Controller** credentials
4. **Environment variables** configured

## Setup

### 1. Configure Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Campus Controller Configuration
CAMPUS_CONTROLLER_URL=https://tsophiea.ddns.net:443/management
CAMPUS_CONTROLLER_USER=your_username
CAMPUS_CONTROLLER_PASSWORD=your_password

# Supabase Configuration (from .env.local)
VITE_SUPABASE_URL=https://sdcanlpqxfjcmjpeaesj.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# Collection Settings (optional)
COLLECTION_INTERVAL_MINUTES=15
```

### 2. Verify Supabase Setup

Make sure you've already:
- Created the Supabase tables (run `supabase-schema.sql`)
- Obtained your anon key from Supabase dashboard

### 3. Test the Collector

Run the collector once to verify everything works:

```bash
npm run collect-metrics
```

You should see output like:

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

🔍 Testing Supabase connection...
✅ Supabase connection successful

📊 Starting metrics collection...
   Time: 2024-12-04T15:30:00.000Z
   Found 5 services
   ✅ Guest-WiFi: 12 clients
   ✅ Corporate-WiFi: 45 clients
   ✅ IoT-Network: 8 clients
   ✅ Employee-WiFi: 23 clients
   ✅ Lab-Network: 5 clients

✨ Collection complete: 5 success, 0 failed

⏰ Scheduled to run every 15 minutes
   Press Ctrl+C to stop
```

## Running the Collector

### Option 1: Foreground (Development/Testing)

Run in your terminal (stops when terminal closes):

```bash
npm run collect-metrics
```

Press `Ctrl+C` to stop.

### Option 2: Background Daemon (Production)

Run as a background process that persists after terminal closes:

```bash
npm run collect-metrics:daemon
```

This will:
- Run the collector in the background
- Create `metrics-collector.log` for output
- Continue running even after you close the terminal

**To stop the background daemon:**

```bash
# Find the process ID
ps aux | grep metrics-collector

# Kill the process
kill <PID>
```

### Option 3: Systemd Service (Linux - Recommended for Production)

Create a systemd service for automatic startup:

**Create service file:** `/etc/systemd/system/metrics-collector.service`

```ini
[Unit]
Description=Network Metrics Background Collector
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/edge-services-site-main
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /path/to/edge-services-site-main/metrics-collector.js
Restart=always
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=metrics-collector

[Install]
WantedBy=multi-user.target
```

**Enable and start the service:**

```bash
sudo systemctl enable metrics-collector
sudo systemctl start metrics-collector
```

**Manage the service:**

```bash
# Check status
sudo systemctl status metrics-collector

# View logs
sudo journalctl -u metrics-collector -f

# Restart
sudo systemctl restart metrics-collector

# Stop
sudo systemctl stop metrics-collector
```

### Option 4: Docker Container

**Create Dockerfile:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["node", "metrics-collector.js"]
```

**Build and run:**

```bash
docker build -t metrics-collector .

docker run -d \
  --name metrics-collector \
  --restart unless-stopped \
  -e CAMPUS_CONTROLLER_URL="https://tsophiea.ddns.net:443/management" \
  -e CAMPUS_CONTROLLER_USER="admin" \
  -e CAMPUS_CONTROLLER_PASSWORD="your_password" \
  -e VITE_SUPABASE_URL="https://sdcanlpqxfjcmjpeaesj.supabase.co" \
  -e VITE_SUPABASE_ANON_KEY="your_anon_key" \
  -e COLLECTION_INTERVAL_MINUTES="15" \
  metrics-collector
```

**Manage the container:**

```bash
# View logs
docker logs -f metrics-collector

# Stop
docker stop metrics-collector

# Start
docker start metrics-collector

# Remove
docker rm -f metrics-collector
```

## Configuration Options

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CAMPUS_CONTROLLER_URL` | No | `https://tsophiea.ddns.net:443/management` | Campus Controller API base URL |
| `CAMPUS_CONTROLLER_USER` | **Yes** | - | Username for Campus Controller |
| `CAMPUS_CONTROLLER_PASSWORD` | **Yes** | - | Password for Campus Controller |
| `VITE_SUPABASE_URL` | **Yes** | - | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | - | Supabase anonymous/public key |
| `COLLECTION_INTERVAL_MINUTES` | No | `15` | How often to collect metrics (in minutes) |

## Monitoring

### Check if Collector is Running

```bash
# Using ps
ps aux | grep metrics-collector

# Using systemd
sudo systemctl status metrics-collector

# Using Docker
docker ps | grep metrics-collector
```

### View Logs

**Foreground/Daemon mode:**
```bash
tail -f metrics-collector.log
```

**Systemd:**
```bash
sudo journalctl -u metrics-collector -f
```

**Docker:**
```bash
docker logs -f metrics-collector
```

### Verify Data Collection

Check Supabase to ensure data is being stored:

```sql
-- Check recent metrics
SELECT
  service_name,
  timestamp,
  (metrics->>'clientCount')::int as clients
FROM service_metrics
ORDER BY timestamp DESC
LIMIT 20;

-- Check metrics per service
SELECT
  service_name,
  COUNT(*) as data_points,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest
FROM service_metrics
GROUP BY service_name;
```

## Troubleshooting

### "Configuration errors: CAMPUS_CONTROLLER_USER is required"

**Solution:** Create a `.env` file with the required variables (see Setup section).

### "Authentication failed (401)"

**Possible causes:**
- Incorrect username or password
- Account locked or disabled
- Campus Controller unreachable

**Solution:** Verify credentials and test login manually through the web UI.

### "Supabase connection failed"

**Possible causes:**
- Database schema not created
- Incorrect Supabase URL or anon key
- Network connectivity issues

**Solution:**
1. Run `supabase-schema.sql` in Supabase SQL Editor
2. Verify URL and key in `.env` file
3. Check network connectivity to Supabase

### "Request timeout"

**Possible causes:**
- Network connectivity issues
- Campus Controller under heavy load
- Firewall blocking requests

**Solution:**
- Check network connectivity
- Increase timeout values in the script if needed
- Verify firewall rules

### Collector Stops After Some Time

**Possible causes:**
- Token expiration (should auto-refresh)
- Memory leak
- System resource constraints

**Solution:**
- Use systemd with `Restart=always` for automatic restart
- Monitor system resources
- Check logs for errors

## Best Practices

1. **Use Systemd/Docker for Production** - Ensures automatic restart and proper logging
2. **Monitor Disk Space** - Metrics data grows over time (Supabase handles cleanup after 90 days)
3. **Secure Credentials** - Use environment variables or secrets management, never commit passwords
4. **Regular Health Checks** - Set up monitoring to alert if collector stops
5. **Log Rotation** - Configure log rotation for daemon mode to prevent disk fill

## Data Storage

The collector stores metrics in the `service_metrics` table in Supabase:

- **Retention Period:** 90 days (automatic cleanup)
- **Collection Frequency:** Every 15 minutes (configurable)
- **Storage Size:** ~4.3 MB per service for 90 days
- **Supabase Free Tier:** 500 MB (sufficient for ~100 services)

## Integration with Network Rewind

Once the background collector is running:

1. Open the Service Levels page in the web UI
2. Select a service
3. The Network Rewind component will show historical data
4. Drag the time slider to view past metrics

The UI and background collector work together:
- **Background Collector:** Ensures 24/7 data collection
- **UI Hook:** Provides real-time updates when page is open

## Support

For issues or questions:
1. Check logs for error messages
2. Verify configuration in `.env` file
3. Test Supabase connection manually
4. Review NETWORK_REWIND_README.md for setup instructions

## See Also

- [NETWORK_REWIND_README.md](./NETWORK_REWIND_README.md) - Overview and setup guide
- [supabase-schema.sql](./supabase-schema.sql) - Database schema
- [.env.example](./.env.example) - Environment variable template
