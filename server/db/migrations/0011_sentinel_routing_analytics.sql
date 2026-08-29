-- Webhook severity routing. Alert analytics (MTTA/MTTR) need no new schema —
-- they read sentinel_alerts, whose resolved rows are now retained 90 days by
-- the repository's prune instead of 30 minutes.
--
-- NOTE: server/sentinel/sentinelRepository.js lazy-ensures the same DDL.

ALTER TABLE sentinel_config
  ADD COLUMN IF NOT EXISTS webhook_min_severity text NOT NULL DEFAULT 'warning';
