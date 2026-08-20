-- Environmental Reporting snapshots and optional customer-supplied emissions
-- factors. Snapshots are immutable evidence records: current preferences or
-- model changes never rewrite historical report values.

ALTER TABLE energy_rate_preferences
  ADD COLUMN IF NOT EXISTS emissions_factor_kg_per_kwh double precision
    CHECK (emissions_factor_kg_per_kwh IS NULL OR emissions_factor_kg_per_kwh > 0),
  ADD COLUMN IF NOT EXISTS emissions_factor_source text,
  ADD COLUMN IF NOT EXISTS emissions_factor_region text,
  ADD COLUMN IF NOT EXISTS emissions_factor_year integer
    CHECK (emissions_factor_year IS NULL OR emissions_factor_year BETWEEN 1900 AND 2200);

CREATE TABLE IF NOT EXISTS energy_environmental_reports (
  id                   uuid PRIMARY KEY,
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  site_id              text,
  window_start         timestamptz NOT NULL,
  window_end           timestamptz NOT NULL,
  generated_at         timestamptz NOT NULL,
  generated_by         text NOT NULL,
  evidence_status      text NOT NULL
                         CHECK (evidence_status IN ('measured', 'modeled', 'partially-measured', 'verified')),
  snapshot             jsonb NOT NULL,
  artifact_reference   text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (window_start < window_end)
);

CREATE INDEX IF NOT EXISTS idx_energy_environmental_reports_latest
  ON energy_environmental_reports (monitored_source_id, site_id, generated_at DESC);