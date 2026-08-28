-- Per-alert acknowledgement and webhook alert routing for Sentinel.
--
-- NOTE: server/sentinel/sentinelRepository.js lazy-ensures the same idempotent
-- DDL (deployed images do not include migrations/). Keep the two in sync.

ALTER TABLE sentinel_alerts ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE sentinel_alerts ADD COLUMN IF NOT EXISTS acknowledged_by text;
ALTER TABLE sentinel_config ADD COLUMN IF NOT EXISTS webhook_url text;
