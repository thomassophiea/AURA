-- Enhanced Network Monitoring Database Schema
-- Supports comprehensive historical data tracking for 7+ days (configurable up to 90 days)
-- Run this in your Supabase SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/ufqjnesldbacyltbsvys/sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron"; -- For automated cleanup (may require Supabase Pro)

-- ============================================================================
-- 1. SERVICE METRICS SNAPSHOTS
-- Time-series data for service-level metrics (throughput, latency, clients, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast time-range queries
CREATE INDEX IF NOT EXISTS idx_service_metrics_service_time
  ON service_metrics_snapshots(service_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_service_metrics_timestamp
  ON service_metrics_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_service_metrics_created_at
  ON service_metrics_snapshots(created_at DESC);

-- Index for JSONB queries (if you need to filter by specific metrics)
CREATE INDEX IF NOT EXISTS idx_service_metrics_jsonb
  ON service_metrics_snapshots USING GIN (metrics);

-- Enable Row Level Security
ALTER TABLE service_metrics_snapshots ENABLE ROW LEVEL SECURITY;

-- Policies for public access (adjust for production)
CREATE POLICY "Enable read access for all users" ON service_metrics_snapshots
  FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON service_metrics_snapshots
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete for cleanup" ON service_metrics_snapshots
  FOR DELETE USING (true);


-- ============================================================================
-- 2. NETWORK SNAPSHOTS
-- Network-wide aggregate metrics across all sites
-- ============================================================================

CREATE TABLE IF NOT EXISTS network_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL,
  site_id TEXT,
  site_name TEXT,
  total_services INTEGER NOT NULL DEFAULT 0,
  total_clients INTEGER NOT NULL DEFAULT 0,
  total_throughput NUMERIC(12, 2) DEFAULT 0,
  average_reliability NUMERIC(5, 2) DEFAULT 0,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_network_snapshots_timestamp
  ON network_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_network_snapshots_site
  ON network_snapshots(site_id, timestamp DESC);

ALTER TABLE network_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON network_snapshots
  FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON network_snapshots
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete for cleanup" ON network_snapshots
  FOR DELETE USING (true);


-- ============================================================================
-- 3. ACCESS POINT EVENTS
-- Track AP online/offline status, firmware upgrades, configuration changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS ap_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ap_serial TEXT NOT NULL,
  ap_name TEXT,
  event_type TEXT NOT NULL, -- 'online', 'offline', 'firmware_upgrade', 'config_change', 'reboot'
  timestamp TIMESTAMPTZ NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ap_events_serial_time
  ON ap_events(ap_serial, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ap_events_timestamp
  ON ap_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ap_events_type
  ON ap_events(event_type, timestamp DESC);

ALTER TABLE ap_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON ap_events
  FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON ap_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete for cleanup" ON ap_events
  FOR DELETE USING (true);


-- ============================================================================
-- 4. CLIENT CONNECTION EVENTS
-- Track client connect/disconnect history for troubleshooting
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_mac TEXT NOT NULL,
  client_hostname TEXT,
  event_type TEXT NOT NULL, -- 'connected', 'disconnected', 'roamed', 'auth_failed'
  timestamp TIMESTAMPTZ NOT NULL,
  service_id TEXT,
  service_name TEXT,
  ap_serial TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_events_mac_time
  ON client_events(client_mac, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_client_events_timestamp
  ON client_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_client_events_type
  ON client_events(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_client_events_service
  ON client_events(service_id, timestamp DESC);

ALTER TABLE client_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON client_events
  FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON client_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete for cleanup" ON client_events
  FOR DELETE USING (true);


-- ============================================================================
-- 5. CONFIGURATION CHANGE AUDIT LOG
-- Track all configuration changes for compliance and troubleshooting
-- ============================================================================

CREATE TABLE IF NOT EXISTS config_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL,
  change_type TEXT NOT NULL, -- 'service_created', 'service_modified', 'service_deleted', 'role_changed', etc.
  entity_type TEXT NOT NULL, -- 'service', 'role', 'ap', 'site', 'policy'
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  changed_by TEXT, -- User who made the change
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_changes_timestamp
  ON config_changes(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_config_changes_entity
  ON config_changes(entity_type, entity_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_config_changes_type
  ON config_changes(change_type, timestamp DESC);

ALTER TABLE config_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON config_changes
  FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON config_changes
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete for cleanup" ON config_changes
  FOR DELETE USING (true);


-- ============================================================================
-- 6. DATA RETENTION CONFIGURATION
-- Centralized retention settings (adjustable via SQL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS retention_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT UNIQUE NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 7,
  last_cleanup TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default retention policies
INSERT INTO retention_config (table_name, retention_days) VALUES
  ('service_metrics_snapshots', 7),
  ('network_snapshots', 7),
  ('ap_events', 30),
  ('client_events', 7),
  ('config_changes', 90)
ON CONFLICT (table_name) DO NOTHING;


-- ============================================================================
-- 7. CLEANUP FUNCTIONS
-- Flexible cleanup based on retention_config table
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(table_name TEXT, deleted_count BIGINT, retention_days INTEGER) AS $$
DECLARE
  config_record RECORD;
  deleted BIGINT;
BEGIN
  FOR config_record IN SELECT * FROM retention_config WHERE enabled = true LOOP
    EXECUTE format(
      'WITH deleted AS (DELETE FROM %I WHERE timestamp < NOW() - INTERVAL ''%s days'' RETURNING *) SELECT COUNT(*) FROM deleted',
      config_record.table_name,
      config_record.retention_days
    ) INTO deleted;

    -- Update last cleanup timestamp
    UPDATE retention_config
    SET last_cleanup = NOW(), updated_at = NOW()
    WHERE id = config_record.id;

    table_name := config_record.table_name;
    deleted_count := deleted;
    retention_days := config_record.retention_days;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Manual cleanup function for specific table
CREATE OR REPLACE FUNCTION cleanup_table(target_table TEXT, days INTEGER DEFAULT NULL)
RETURNS BIGINT AS $$
DECLARE
  retention INTEGER;
  deleted BIGINT;
BEGIN
  -- Get retention days from config if not specified
  IF days IS NULL THEN
    SELECT retention_days INTO retention FROM retention_config WHERE table_name = target_table;
  ELSE
    retention := days;
  END IF;

  IF retention IS NULL THEN
    RAISE EXCEPTION 'No retention config found for table: %', target_table;
  END IF;

  EXECUTE format(
    'WITH deleted AS (DELETE FROM %I WHERE timestamp < NOW() - INTERVAL ''%s days'' RETURNING *) SELECT COUNT(*) FROM deleted',
    target_table,
    retention
  ) INTO deleted;

  RETURN deleted;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 8. SCHEDULED CLEANUP (Requires pg_cron extension - Supabase Pro)
-- Automatically runs cleanup daily at 2 AM UTC
-- ============================================================================

-- NOTE: pg_cron is only available on Supabase Pro plan
-- If you're on the free tier, you'll need to run cleanup_old_data() manually or via a cron job

-- Uncomment if you have Supabase Pro:
-- SELECT cron.schedule(
--   'cleanup-old-metrics',
--   '0 2 * * *', -- Daily at 2 AM UTC
--   'SELECT cleanup_old_data()'
-- );


-- ============================================================================
-- 9. USEFUL VIEWS
-- Pre-built queries for common use cases
-- ============================================================================

-- Latest metrics for each service
CREATE OR REPLACE VIEW latest_service_metrics AS
SELECT DISTINCT ON (service_id)
  service_id,
  service_name,
  timestamp,
  metrics,
  created_at
FROM service_metrics_snapshots
ORDER BY service_id, timestamp DESC;

-- Service metrics summary (last 24 hours)
CREATE OR REPLACE VIEW service_metrics_24h AS
SELECT
  service_id,
  service_name,
  COUNT(*) as snapshot_count,
  MIN(timestamp) as earliest_snapshot,
  MAX(timestamp) as latest_snapshot,
  AVG((metrics->>'clientCount')::numeric) as avg_clients,
  AVG((metrics->>'throughput')::numeric) as avg_throughput,
  AVG((metrics->>'reliability')::numeric) as avg_reliability
FROM service_metrics_snapshots
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY service_id, service_name;

-- AP uptime summary
CREATE OR REPLACE VIEW ap_uptime_summary AS
WITH events AS (
  SELECT
    ap_serial,
    ap_name,
    event_type,
    timestamp,
    LAG(timestamp) OVER (PARTITION BY ap_serial ORDER BY timestamp) as prev_timestamp,
    LAG(event_type) OVER (PARTITION BY ap_serial ORDER BY timestamp) as prev_event
  FROM ap_events
  WHERE timestamp > NOW() - INTERVAL '7 days'
  ORDER BY ap_serial, timestamp
)
SELECT
  ap_serial,
  ap_name,
  COUNT(CASE WHEN event_type = 'online' THEN 1 END) as online_count,
  COUNT(CASE WHEN event_type = 'offline' THEN 1 END) as offline_count,
  SUM(CASE
    WHEN event_type = 'offline' AND prev_event = 'online'
    THEN EXTRACT(EPOCH FROM (timestamp - prev_timestamp))
    ELSE 0
  END) / 3600.0 as total_uptime_hours
FROM events
GROUP BY ap_serial, ap_name;

-- Grant view permissions
GRANT SELECT ON latest_service_metrics TO anon, authenticated;
GRANT SELECT ON service_metrics_24h TO anon, authenticated;
GRANT SELECT ON ap_uptime_summary TO anon, authenticated;


-- ============================================================================
-- 10. STORAGE ESTIMATES
-- ============================================================================

-- Service metrics: ~200 bytes per snapshot
--   30-min intervals = 48 snapshots/day
--   10 services × 48 snapshots × 7 days = 3,360 snapshots
--   3,360 × 200 bytes = ~672 KB per week
--
-- Network snapshots: ~150 bytes per snapshot
--   30-min intervals = 48 snapshots/day
--   48 × 7 days = 336 snapshots
--   336 × 150 bytes = ~50 KB per week
--
-- AP events: ~250 bytes per event
--   Assume 10 APs × 2 events/day (online/offline) × 30 days = 600 events
--   600 × 250 bytes = ~150 KB per month
--
-- Client events: ~300 bytes per event
--   Assume 100 clients × 4 events/day (connect/disconnect) × 7 days = 2,800 events
--   2,800 × 300 bytes = ~840 KB per week
--
-- Config changes: ~500 bytes per change
--   Assume 10 changes/day × 90 days = 900 changes
--   900 × 500 bytes = ~450 KB per 90 days
--
-- TOTAL for 7 days: ~2 MB
-- TOTAL for 90 days: ~15 MB
-- Well within Supabase free tier (500 MB database limit)


-- ============================================================================
-- DEPLOYMENT VERIFICATION
-- ============================================================================

-- Run this query to verify all tables and policies are created:
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'service_metrics_snapshots',
    'network_snapshots',
    'ap_events',
    'client_events',
    'config_changes',
    'retention_config'
  )
ORDER BY tablename;

-- Verify indexes
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'service_metrics_snapshots',
    'network_snapshots',
    'ap_events',
    'client_events',
    'config_changes'
  )
ORDER BY tablename, indexname;

-- Check retention config
SELECT * FROM retention_config ORDER BY table_name;
