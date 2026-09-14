-- Energy demo-simulation episodes — the audit trail of the demonstration
-- fail-safe.
--
-- WHY A SEPARATE TABLE
-- --------------------
-- The fallback exists so that a dead ambient-light sensor, an AP that refuses a
-- radio write, a controller that stops answering or a collector gap cannot take
-- a live customer demonstration down with it. It projects what the optimized
-- site WOULD be drawing, from that site's own real telemetry.
--
-- That projection must never become indistinguishable from measurement. So:
--
--   * No projected value is ever written to metric_samples. Not one. The
--     measured energy feed stays exactly as measured, gaps included.
--   * No projected value is ever written into energy_experiments' frozen
--     result metrics, so a stored experiment outcome cannot be a simulation.
--   * What IS persisted is this: that a simulation was switched on, by whom,
--     over which site, for how long, and what it was showing. An audit record
--     of the demonstration, in its own table, marked in its own column.
--
-- The live override itself stays in process memory (demoOverrideRegistry.js) and
-- dies with the service on purpose — a forgotten override is the one way this
-- feature could quietly poison real history. This table is its history, not its
-- state: replaying these rows never re-arms a simulation.
--
-- The environmental / ISO 14001 report never reads this table. It cites only
-- experiments whose controller writes landed and whose measured window supports
-- a claim, which no simulated episode can satisfy.
--
-- Every statement is idempotent. All timestamps are TIMESTAMPTZ (UTC).

CREATE TABLE IF NOT EXISTS energy_demo_simulation_episodes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,

  -- Nullable on purpose. The fail-safe has to work when there is no experiment
  -- at all — if the API call that starts one is what failed, the operator still
  -- needs the story on screen.
  experiment_id       uuid REFERENCES energy_experiments(id) ON DELETE SET NULL,

  -- The optimized site the projection was applied to. The control site is never
  -- projected, so it is recorded only for context.
  site_id             text,
  site_name           text,
  control_site_id     text,
  control_site_name   text,

  mode                text NOT NULL CHECK (mode IN ('lights_off', 'lights_on', 'sensor_failure')),

  -- The one column that makes this data self-describing wherever it is read,
  -- including by a human running an ad-hoc query months later. Constrained to a
  -- single value so no future code path can file a real measurement here.
  value_source        text NOT NULL DEFAULT 'DEMO_SIMULATED'
                        CHECK (value_source = 'DEMO_SIMULATED'),

  started_at          timestamptz NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  started_by          text,
  ended_reason        text,

  -- What the projection was built FROM (measured watts per AP at the optimized
  -- site, AP count, the reduction share applied) and what it was showing when
  -- it ended. Kept as jsonb because it is evidence about a demonstration, not a
  -- metric anyone should aggregate.
  baseline_watts_per_ap numeric(10, 3),
  ap_count              integer,
  reduction_share       numeric(6, 4) CHECK (reduction_share IS NULL
                                             OR reduction_share BETWEEN 0 AND 0.25),
  projection            jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- The only two access patterns: "what has been simulated on this controller"
-- and "was anything simulated during this experiment".
CREATE INDEX IF NOT EXISTS idx_energy_demo_episodes_source
  ON energy_demo_simulation_episodes (monitored_source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_energy_demo_episodes_experiment
  ON energy_demo_simulation_episodes (experiment_id, started_at DESC)
  WHERE experiment_id IS NOT NULL;

-- At most one open episode per controller. Two open episodes would mean two
-- projections claiming the same site, and no way to tell which one the screen
-- was showing.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_energy_demo_episode_open
  ON energy_demo_simulation_episodes (monitored_source_id)
  WHERE ended_at IS NULL;

COMMENT ON TABLE energy_demo_simulation_episodes IS
  'Audit trail of Energy demo-simulation fail-safe activations. Every row is DEMO_SIMULATED by constraint. Never read by the environmental report; never a source of telemetry.';
