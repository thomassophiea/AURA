-- AURA monitoring persistence: 7-day rolling history of monitoring + SLE data.
--
-- Authoritative store for everything that used to live in browser localStorage or
-- Node module-scope arrays. See docs/MONITORING_PERSISTENCE.md.
--
-- All timestamps are TIMESTAMPTZ (UTC). Every statement is idempotent.

-- ---------------------------------------------------------------------------
-- monitored_sources: a controller or gateway that gets polled.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitored_sources (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                text,
  site_group_id         text,
  source_type           text NOT NULL DEFAULT 'controller'
                          CHECK (source_type IN ('controller', 'xiq')),
  -- Stable identity from the source itself (Locking ID for XCC), else the host.
  source_external_id    text,
  display_name          text,
  base_url              text NOT NULL,
  enabled               boolean NOT NULL DEFAULT true,
  -- Probed capabilities, e.g. {"durations": {"3H": true, "24H": false}}.
  capabilities          jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_attempt_at       timestamptz,
  last_success_at       timestamptz,
  last_failure_at       timestamptz,
  consecutive_failures  integer NOT NULL DEFAULT 0,
  last_error_code       text,
  -- Sanitized summary only. Never a raw controller response body.
  last_error_summary    text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitored_sources_base_url_key UNIQUE (base_url)
);

COMMENT ON COLUMN monitored_sources.last_error_summary IS
  'Sanitized error summary. Never store raw controller responses, URLs with query secrets, or credentials.';

-- ---------------------------------------------------------------------------
-- monitored_source_credentials: kept in its own table so no monitoring read
-- path can accidentally join it. Secrets are AES-256-GCM ciphertext.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitored_source_credentials (
  monitored_source_id uuid PRIMARY KEY
                        REFERENCES monitored_sources(id) ON DELETE CASCADE,
  username            text,
  secret_ciphertext   bytea,
  secret_nonce        bytea,
  secret_auth_tag     bytea,
  key_version         integer NOT NULL DEFAULT 1,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- collection_runs: one row per polling attempt per collector.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id     uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  collector_name          text NOT NULL,
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  status                  text NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'succeeded', 'partial', 'failed',
                                              'timed_out', 'skipped_due_to_lock')),
  requested_endpoint      text,
  response_status         integer,
  records_received        integer NOT NULL DEFAULT 0,
  records_inserted        integer NOT NULL DEFAULT 0,
  records_updated         integer NOT NULL DEFAULT 0,
  duration_ms             integer,
  error_class             text,
  sanitized_error_message text
);

CREATE INDEX IF NOT EXISTS idx_collection_runs_source_started
  ON collection_runs (monitored_source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_runs_started
  ON collection_runs (started_at DESC);

-- ---------------------------------------------------------------------------
-- metric_samples: timestamped SLE and monitoring measurements.
--
-- dimensions_hash exists because a jsonb column cannot participate in a UNIQUE
-- constraint. It is generated, so it can never drift from `dimensions`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metric_samples (
  id                  bigserial PRIMARY KEY,
  monitored_source_id uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  collection_run_id   uuid REFERENCES collection_runs(id) ON DELETE SET NULL,

  org_id              text,
  site_group_id       text,
  site_id             text,
  device_external_id  text,
  radio_external_id   text,
  wlan_external_id    text,
  -- NULL unless MONITORING_PERSIST_CLIENT_IDENTIFIERS is enabled, and then an
  -- HMAC pseudonym rather than a raw MAC.
  client_external_id  text,

  metric_family       text NOT NULL,
  metric_name         text NOT NULL,

  observed_at         timestamptz NOT NULL,
  bucket_start        timestamptz,
  bucket_end          timestamptz,

  numeric_value       double precision,
  numerator           double precision,
  denominator         double precision,
  sample_count        integer,
  unit                text,
  metric_kind         text NOT NULL DEFAULT 'gauge'
                        CHECK (metric_kind IN ('gauge', 'counter', 'counter_delta',
                                               'percentage', 'ratio', 'event_count')),

  dimensions          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- jsonb cannot participate in a UNIQUE constraint; jsonb::text is canonical
  -- (sorted keys, normalized whitespace) so this hash is stable. Generated, so
  -- it can never drift from `dimensions`.
  dimensions_hash     text GENERATED ALWAYS AS (md5(dimensions::text)) STORED,

  -- Generated NOT NULL mirrors of the nullable entity columns. The uniqueness
  -- key is built from these rather than from COALESCE() expressions so that
  -- ON CONFLICT can name plain columns — expression-index inference is exact
  -- and brittle, and a silent mismatch would turn every upsert into a duplicate.
  site_key            text GENERATED ALWAYS AS (COALESCE(site_id, '')) STORED,
  device_key          text GENERATED ALWAYS AS (COALESCE(device_external_id, '')) STORED,
  radio_key           text GENERATED ALWAYS AS (COALESCE(radio_external_id, '')) STORED,
  wlan_key            text GENERATED ALWAYS AS (COALESCE(wlan_external_id, '')) STORED,
  client_key          text GENERATED ALWAYS AS (COALESCE(client_external_id, '')) STORED,

  quality_state       text NOT NULL DEFAULT 'observed'
                        CHECK (quality_state IN ('observed', 'collection_timestamped',
                                                 'counter_reset', 'partial', 'estimated')),

  collected_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  source_payload_hash text,
  schema_version      integer NOT NULL DEFAULT 1
);

COMMENT ON COLUMN metric_samples.quality_state IS
  'observed = source supplied the timestamp; collection_timestamped = it did not and collect time was used; counter_reset = delta suppressed because the counter went backwards.';

-- Deterministic identity. This is what makes retries, duplicate workers, and
-- overlapping backfill windows idempotent. A random UUID would not.
CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_samples_identity
  ON metric_samples (
    monitored_source_id, site_key, device_key, radio_key, wlan_key, client_key,
    metric_family, metric_name, observed_at, dimensions_hash
  );

CREATE INDEX IF NOT EXISTS idx_metric_samples_source_observed
  ON metric_samples (monitored_source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_metric_samples_site_observed
  ON metric_samples (site_id, observed_at DESC) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_metric_samples_device_observed
  ON metric_samples (device_external_id, observed_at DESC) WHERE device_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_metric_samples_metric_observed
  ON metric_samples (metric_family, metric_name, observed_at DESC);
-- Retention sweep.
CREATE INDEX IF NOT EXISTS idx_metric_samples_expires
  ON metric_samples (expires_at);

-- ---------------------------------------------------------------------------
-- current_metric_state: latest known value per series.
--
-- Never deleted because a source went offline. Staleness is derived from
-- observed_at, so the UI can distinguish "offline" from "never collected".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS current_metric_state (
  monitored_source_id uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  site_key            text NOT NULL DEFAULT '',
  device_key          text NOT NULL DEFAULT '',
  radio_key           text NOT NULL DEFAULT '',
  wlan_key            text NOT NULL DEFAULT '',
  client_key          text NOT NULL DEFAULT '',
  metric_family       text NOT NULL,
  metric_name         text NOT NULL,
  dimensions_hash     text NOT NULL,

  org_id              text,
  site_group_id       text,
  site_id             text,
  device_external_id  text,
  radio_external_id   text,
  wlan_external_id    text,
  client_external_id  text,
  dimensions          jsonb NOT NULL DEFAULT '{}'::jsonb,

  numeric_value       double precision,
  numerator           double precision,
  denominator         double precision,
  unit                text,
  metric_kind         text NOT NULL DEFAULT 'gauge',
  quality_state       text NOT NULL DEFAULT 'observed',
  observed_at         timestamptz NOT NULL,
  collected_at        timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (monitored_source_id, site_key, device_key, radio_key, wlan_key,
               client_key, metric_family, metric_name, dimensions_hash)
);

CREATE INDEX IF NOT EXISTS idx_current_metric_state_site
  ON current_metric_state (site_id, metric_family, metric_name);
CREATE INDEX IF NOT EXISTS idx_current_metric_state_observed
  ON current_metric_state (observed_at DESC);

-- ---------------------------------------------------------------------------
-- collection_cursors: durable per-source, per-family high-water mark, so
-- backfill requests only the window it actually missed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_cursors (
  monitored_source_id uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  metric_family       text NOT NULL,
  -- Entity the cursor tracks: site id, AP serial, or '' for source-wide.
  scope_key           text NOT NULL DEFAULT '',
  last_observed_at    timestamptz,
  last_success_at     timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (monitored_source_id, metric_family, scope_key)
);

-- ---------------------------------------------------------------------------
-- collector_leases: observability for the advisory locks. The locks themselves
-- are the real mutual exclusion; this table is so operators can see who holds
-- what without querying pg_locks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collector_leases (
  lease_key   text PRIMARY KEY,
  holder      text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
