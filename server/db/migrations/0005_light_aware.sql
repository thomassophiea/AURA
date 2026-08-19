CREATE TABLE IF NOT EXISTS light_sensor_samples (
  id                   bigserial PRIMARY KEY,
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  ap_serial            text NOT NULL,
  lux                  double precision,
  reported_state       text,
  normalized_state     text NOT NULL
                         CHECK (normalized_state IN ('bright','dim','dark','unknown')),
  observed_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_light_samples_ap_time
  ON light_sensor_samples (monitored_source_id, ap_serial, observed_at DESC);

CREATE TABLE IF NOT EXISTS light_state_transitions (
  id                   bigserial PRIMARY KEY,
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  ap_serial            text NOT NULL,
  from_state           text,
  to_state             text NOT NULL
                         CHECK (to_state IN ('bright','dim','dark','unknown')),
  entered_at           timestamptz NOT NULL,
  dwell_seconds        integer
);
CREATE INDEX IF NOT EXISTS idx_light_transitions_ap_time
  ON light_state_transitions (monitored_source_id, ap_serial, entered_at DESC);

CREATE TABLE IF NOT EXISTS light_aware_policies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  site_group_id        text,
  site_id              text,
  ap_serial            text,
  enabled              boolean NOT NULL DEFAULT false,
  policy               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_light_policy_scope
  ON light_aware_policies (monitored_source_id, COALESCE(site_id,''), COALESCE(ap_serial,''));
