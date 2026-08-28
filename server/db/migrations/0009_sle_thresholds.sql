-- Per-site SLE thresholds, shared across every browser and user.
--
-- NOTE: server/sle/thresholdsRouter.js lazy-ensures this same idempotent DDL
-- (deployed images do not include migrations/). Keep the two in sync.

CREATE TABLE IF NOT EXISTS sle_thresholds (
  site_key   text PRIMARY KEY,
  thresholds jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
