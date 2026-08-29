-- Configuration snapshots and compliance score history.
--
-- Snapshots capture the controller's key configuration surfaces as JSON with
-- per-section hashes, so any two points in time can be diffed and drift is
-- provable. Compliance history records the Best Practices evaluation score
-- over time so posture becomes a trend, not a moment.
--
-- NOTE: server/config/configSnapshotService.js lazy-ensures the same DDL.

CREATE TABLE IF NOT EXISTS config_snapshots (
  id             bigserial PRIMARY KEY,
  source_base_url text NOT NULL,
  taken_at       timestamptz NOT NULL DEFAULT now(),
  kind           text NOT NULL DEFAULT 'scheduled',
  taken_by       text,
  sections       jsonb NOT NULL,
  section_hashes jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_config_snapshots_source_time
  ON config_snapshots (source_base_url, taken_at DESC);

CREATE TABLE IF NOT EXISTS compliance_history (
  id             bigserial PRIMARY KEY,
  source_base_url text NOT NULL,
  at             timestamptz NOT NULL DEFAULT now(),
  good           integer NOT NULL,
  warning        integer NOT NULL,
  error          integer NOT NULL,
  score          numeric NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_history_source_time
  ON compliance_history (source_base_url, at DESC);
