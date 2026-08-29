-- Alert routing policy: quiet hours and escalation, stored on the singleton
-- sentinel_config row as JSON.
--
-- NOTE: server/sentinel/sentinelRepository.js lazy-ensures the same DDL.

ALTER TABLE sentinel_config ADD COLUMN IF NOT EXISTS webhook_quiet_hours jsonb;
ALTER TABLE sentinel_config ADD COLUMN IF NOT EXISTS webhook_escalation jsonb;
