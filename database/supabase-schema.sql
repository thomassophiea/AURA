-- Network Rewind Feature - Supabase Schema
-- Run this in your Supabase SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/ufqjnesldbacyltbsvys/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Service metrics snapshots table
CREATE TABLE IF NOT EXISTS service_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_service_metrics_service_time
  ON service_metrics_snapshots(service_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_service_metrics_timestamp
  ON service_metrics_snapshots(timestamp DESC);

-- Enable Row Level Security
ALTER TABLE service_metrics_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow public read and insert (adjust for production)
CREATE POLICY "Enable read access for all users" ON service_metrics_snapshots
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON service_metrics_snapshots
  FOR INSERT WITH CHECK (true);

-- Function to clean up data older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM service_metrics_snapshots
  WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- View for latest metrics
CREATE OR REPLACE VIEW latest_service_metrics AS
SELECT DISTINCT ON (service_id)
  service_id,
  service_name,
  timestamp,
  metrics,
  created_at
FROM service_metrics_snapshots
ORDER BY service_id, timestamp DESC;

-- Grant permissions
GRANT SELECT ON latest_service_metrics TO anon, authenticated;
