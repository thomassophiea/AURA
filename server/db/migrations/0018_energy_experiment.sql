-- Energy North-vs-South controlled experiment (Energy POC).
--
-- Telemetry is NOT duplicated here. Per-AP power and radio state land in
-- metric_samples under metric_family = 'energy_ap_state' so they inherit the
-- existing retention, identity index, and aggregation paths. These tables hold
-- only what metric_samples cannot express: the experiment itself, which devices
-- were enrolled on which side, the captured rollback state, and the discrete
-- event timeline.
--
-- Every statement is idempotent. All timestamps are TIMESTAMPTZ (UTC).

-- ---------------------------------------------------------------------------
-- energy_experiment_config: which two sites form the treatment/control pair,
-- and the sensor thresholds. One row per monitored source.
--
-- The pair is CONFIGURATION, never a hardcode: sites get renamed, APs get
-- moved, and a POC that assumes a site id is one re-org away from targeting the
-- wrong hardware.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS energy_experiment_config (
  monitored_source_id          uuid PRIMARY KEY
                                 REFERENCES monitored_sources(id) ON DELETE CASCADE,
  north_site_id                text,
  north_site_name              text,
  south_site_id                text,
  south_site_name              text,

  -- Raw JSA-1141 counts (0-255), not lux: the sensor is uncalibrated, so a lux
  -- claim would be fabricated precision. See docs/ENERGY_NORTH_SOUTH_POC.md.
  darkness_threshold_raw       integer NOT NULL DEFAULT 3
                                 CHECK (darkness_threshold_raw BETWEEN 0 AND 255),
  darkness_persistence_seconds integer NOT NULL DEFAULT 120
                                 CHECK (darkness_persistence_seconds BETWEEN 0 AND 86400),
  recovery_threshold_raw       integer NOT NULL DEFAULT 6
                                 CHECK (recovery_threshold_raw BETWEEN 0 AND 255),
  recovery_persistence_seconds integer NOT NULL DEFAULT 60
                                 CHECK (recovery_persistence_seconds BETWEEN 0 AND 86400),

  -- The energy action applied to North APs, e.g.
  -- {"kind":"disableRadios","radioIndexes":[3],"requireZeroClients":true}
  action                       jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled                      boolean NOT NULL DEFAULT false,
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CHECK (recovery_threshold_raw >= darkness_threshold_raw)
);

-- ---------------------------------------------------------------------------
-- energy_experiments: one row per run. Postgres is the system of record for
-- experiment state — a browser reload, a backend restart, or a three-day gap
-- must all reconstruct from here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS energy_experiments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  name                 text NOT NULL,

  state                text NOT NULL DEFAULT 'ready'
                         CHECK (state IN ('ready', 'collecting_baseline', 'baseline_established',
                                          'darkness_detected', 'optimization_active',
                                          'recovering', 'complete', 'error')),

  north_site_id        text NOT NULL,
  north_site_name      text,
  south_site_id        text NOT NULL,
  south_site_name      text,

  baseline_start       timestamptz,
  baseline_end         timestamptz,
  treatment_start      timestamptz,
  treatment_end        timestamptz,
  recovery_start       timestamptz,
  ended_at             timestamptz,

  -- How the treatment was triggered. 'simulated' means the TRIGGER was
  -- synthetic; the controller write and the telemetry that follows are still
  -- real. A fully synthetic run is trigger_source='simulated' AND
  -- controller_writes_applied=false.
  trigger_source       text NOT NULL DEFAULT 'pending'
                         CHECK (trigger_source IN ('pending', 'live_sensor', 'simulated', 'manual')),
  controller_writes_applied boolean NOT NULL DEFAULT false,

  action               jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline_metrics     jsonb,
  treatment_metrics    jsonb,
  savings              jsonb,
  telemetry_quality    jsonb,
  error_summary        text,

  started_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (north_site_id <> south_site_id)
);

CREATE INDEX IF NOT EXISTS idx_energy_experiments_source_created
  ON energy_experiments (monitored_source_id, created_at DESC);

-- At most one experiment per source may be in flight. A second concurrent run
-- would give two engines the same rollback state and the same APs.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_energy_experiment_active
  ON energy_experiments (monitored_source_id)
  WHERE state IN ('collecting_baseline', 'baseline_established', 'darkness_detected',
                  'optimization_active', 'recovering');

-- ---------------------------------------------------------------------------
-- energy_experiment_devices: the allowlist, snapshotted at enrollment.
--
-- This is the safety boundary's memory. Membership is re-verified against the
-- live controller before every write, but the snapshot is what says which APs
-- this experiment was ever entitled to touch.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS energy_experiment_devices (
  experiment_id  uuid NOT NULL REFERENCES energy_experiments(id) ON DELETE CASCADE,
  side           text NOT NULL CHECK (side IN ('north', 'south')),
  ap_serial      text NOT NULL,
  ap_name        text,
  model          text,
  site_id        text NOT NULL,
  site_name      text,
  status_at_enrollment text,
  enrolled_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, ap_serial)
);

CREATE INDEX IF NOT EXISTS idx_energy_experiment_devices_side
  ON energy_experiment_devices (experiment_id, side);

-- ---------------------------------------------------------------------------
-- energy_experiment_rollback: captured pre-change configuration per AP.
--
-- Written BEFORE the controller write, never after, so a crash between capture
-- and write leaves a restorable record rather than an unknown AP.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS energy_experiment_rollback (
  experiment_id        uuid NOT NULL REFERENCES energy_experiments(id) ON DELETE CASCADE,
  ap_serial            text NOT NULL,
  captured_at          timestamptz NOT NULL DEFAULT now(),
  original             jsonb NOT NULL,
  intended             jsonb,
  applied_at           timestamptz,
  apply_verified       boolean NOT NULL DEFAULT false,
  apply_error          text,
  restore_attempted_at timestamptz,
  restore_verified     boolean NOT NULL DEFAULT false,
  restore_error        text,
  PRIMARY KEY (experiment_id, ap_serial)
);

-- Anything unrestored is an operational liability; make it one index lookup.
CREATE INDEX IF NOT EXISTS idx_energy_rollback_outstanding
  ON energy_experiment_rollback (experiment_id)
  WHERE applied_at IS NOT NULL AND restore_verified = false;

-- ---------------------------------------------------------------------------
-- energy_experiment_events: the human-readable timeline.
--
-- Deliberately separate from metric_samples: these are discrete, low-volume,
-- and must outlive high-frequency telemetry.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS energy_experiment_events (
  id                  bigserial PRIMARY KEY,
  experiment_id       uuid REFERENCES energy_experiments(id) ON DELETE CASCADE,
  monitored_source_id uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  kind                text NOT NULL,
  severity            text NOT NULL DEFAULT 'info'
                        CHECK (severity IN ('info', 'warning', 'critical')),
  side                text CHECK (side IS NULL OR side IN ('north', 'south')),
  ap_serial           text,
  message             text NOT NULL,
  detail              jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'live' = derived from real telemetry; 'simulated' = synthetic trigger;
  -- 'calculated' = derived from a model rather than observed directly.
  provenance          text NOT NULL DEFAULT 'live'
                        CHECK (provenance IN ('live', 'simulated', 'calculated'))
);

CREATE INDEX IF NOT EXISTS idx_energy_experiment_events_timeline
  ON energy_experiment_events (experiment_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_energy_experiment_events_source_time
  ON energy_experiment_events (monitored_source_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- The experiment reads several days of per-AP power out of metric_samples,
-- filtered by site and metric name. The existing indexes lead on
-- monitored_source_id or site_id alone, which on a 900k-row table still scans
-- every family. This one matches the exact shape the baseline engine queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_metric_samples_energy_ap_state
  ON metric_samples (site_id, metric_name, observed_at DESC)
  WHERE metric_family = 'energy_ap_state';

-- ---------------------------------------------------------------------------
-- Provenance on the existing light feed.
--
-- The demo fallback injects a SIMULATED sensor reading through the same ingest
-- path, the same policy engine, and the same controller write as a real one.
-- That is only acceptable if a simulated sample can never later be mistaken for
-- a measured one, so every row now says which it is. Existing rows predate the
-- fallback and are therefore live.
-- ---------------------------------------------------------------------------
ALTER TABLE light_sensor_samples
  ADD COLUMN IF NOT EXISTS sample_source text NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'light_sensor_samples_sample_source_check'
  ) THEN
    ALTER TABLE light_sensor_samples
      ADD CONSTRAINT light_sensor_samples_sample_source_check
      CHECK (sample_source IN ('live', 'simulated'));
  END IF;
END $$;

-- Retention: light samples have no expires_at and are not swept by the
-- monitoring cleanup, which only prunes metric_samples. They are low volume
-- (one row per AP per report). Left deliberately unpruned so the sensor
-- evidence for a past experiment outlives the telemetry window.
