-- Generalize the energy experiment from "North vs South" to "any site vs any site".
--
-- The first cut named the two sides after the lab's tower sites. That was wrong:
-- the pair is configuration, and a customer comparing a warehouse against an
-- office should not be reading columns called `north_site_id`. The sides are
-- what they actually are — the TREATMENT site (the one the energy action is
-- applied to) and the CONTROL site (the one deliberately left alone).
--
-- EAL-PT-N / EAL-PT-S remains a perfectly good pair to configure; it is just no
-- longer baked into the schema.
--
-- Idempotent: every rename is guarded on the column still having its old name,
-- so re-running this migration after a partial apply is safe.

DO $$
BEGIN
  -- energy_experiment_config
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'energy_experiment_config' AND column_name = 'north_site_id') THEN
    ALTER TABLE energy_experiment_config RENAME COLUMN north_site_id   TO treatment_site_id;
    ALTER TABLE energy_experiment_config RENAME COLUMN north_site_name TO treatment_site_name;
    ALTER TABLE energy_experiment_config RENAME COLUMN south_site_id   TO control_site_id;
    ALTER TABLE energy_experiment_config RENAME COLUMN south_site_name TO control_site_name;
  END IF;

  -- energy_experiments
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'energy_experiments' AND column_name = 'north_site_id') THEN
    ALTER TABLE energy_experiments RENAME COLUMN north_site_id   TO treatment_site_id;
    ALTER TABLE energy_experiments RENAME COLUMN north_site_name TO treatment_site_name;
    ALTER TABLE energy_experiments RENAME COLUMN south_site_id   TO control_site_id;
    ALTER TABLE energy_experiments RENAME COLUMN south_site_name TO control_site_name;
  END IF;
END $$;

-- The CHECK that the two sites differ was created unnamed against the old
-- columns; renaming columns keeps it valid, so nothing to do there.

-- ---------------------------------------------------------------------------
-- side: 'north'/'south' -> 'treatment'/'control'.
--
-- Existing rows are translated rather than dropped: past experiments stay
-- readable, and their timelines keep meaning the same thing.
-- ---------------------------------------------------------------------------
ALTER TABLE energy_experiment_devices DROP CONSTRAINT IF EXISTS energy_experiment_devices_side_check;
ALTER TABLE energy_experiment_events  DROP CONSTRAINT IF EXISTS energy_experiment_events_side_check;

UPDATE energy_experiment_devices SET side = 'treatment' WHERE side = 'north';
UPDATE energy_experiment_devices SET side = 'control'   WHERE side = 'south';
UPDATE energy_experiment_events  SET side = 'treatment' WHERE side = 'north';
UPDATE energy_experiment_events  SET side = 'control'   WHERE side = 'south';

ALTER TABLE energy_experiment_devices
  ADD CONSTRAINT energy_experiment_devices_side_check
  CHECK (side IN ('treatment', 'control'));

ALTER TABLE energy_experiment_events
  ADD CONSTRAINT energy_experiment_events_side_check
  CHECK (side IS NULL OR side IN ('treatment', 'control'));
