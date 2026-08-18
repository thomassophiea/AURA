-- server/db/migrations/0004_energy.sql
-- Energy Optimization (Green AP Phase 3). Power readings are NOT duplicated —
-- they stay in metric_samples. These tables hold only rate preferences,
-- what-if scenario documents, and cached scenario results.
-- Every statement is idempotent. All timestamps are TIMESTAMPTZ (UTC).

CREATE TABLE IF NOT EXISTS energy_rate_preferences (
  monitored_source_id  uuid PRIMARY KEY
                         REFERENCES monitored_sources(id) ON DELETE CASCADE,
  currency_code        text NOT NULL DEFAULT 'USD'
                         CHECK (currency_code IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD')),
  currency_symbol      text NOT NULL DEFAULT '$',
  rate_per_kwh         double precision NOT NULL DEFAULT 0.14
                         CHECK (rate_per_kwh > 0),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS energy_scenarios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  policy               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS energy_scenario_results (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id          uuid NOT NULL REFERENCES energy_scenarios(id) ON DELETE CASCADE,
  site_id              text,
  window_start         timestamptz NOT NULL,
  window_end           timestamptz NOT NULL,
  baseline_kwh         double precision NOT NULL,
  simulated_kwh        double precision NOT NULL,
  savings_kwh          double precision NOT NULL,
  savings_percent      double precision NOT NULL,
  ap_count             integer NOT NULL,
  ap_with_data_count   integer NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_energy_scenario_results_scenario
  ON energy_scenario_results (scenario_id, computed_at DESC);
