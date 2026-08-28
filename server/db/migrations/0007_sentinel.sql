-- Sentinel (Operational Insights / Infrastructure) persistence.
--
-- The Sentinel engine was purely in-memory, so every deploy wiped active
-- alerts, trend sparklines, and the configured polling schedule. These tables
-- make that state survive restarts. The engine hydrates from them at boot and
-- writes through on every poll.
--
-- NOTE: server/sentinel/sentinelRepository.js carries this same DDL as an
-- idempotent lazy ensure (deployed images do not include migrations/ — see
-- railway.toml). Keep the two in sync.

CREATE TABLE IF NOT EXISTS sentinel_alerts (
  id            text PRIMARY KEY,
  severity      text NOT NULL,
  check_name    text NOT NULL,
  message       text NOT NULL,
  target        text,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL,
  last_seen_at  timestamptz NOT NULL,
  resolved_at   timestamptz,
  occurrences   integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_active
  ON sentinel_alerts (check_name)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS sentinel_trends (
  id          bigserial PRIMARY KEY,
  check_name  text NOT NULL,
  ts          timestamptz NOT NULL,
  alert_count integer NOT NULL,
  status      text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sentinel_trends_check_ts
  ON sentinel_trends (check_name, ts DESC);

-- Single-row table holding the configured background polling schedule.
CREATE TABLE IF NOT EXISTS sentinel_config (
  singleton   boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  interval_ms integer,
  site_id     text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
