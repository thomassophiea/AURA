-- Finish the north/south -> treatment/control rename INSIDE the frozen jsonb.
--
-- 0019 renamed the columns and the `side` values, but `baseline_metrics`,
-- `treatment_metrics`, `savings` and `telemetry_quality` are frozen snapshots
-- whose object keys were still `north` / `south` / `withinNorth`. The UI reads
-- those blobs directly, so a completed experiment from before the rename
-- rendered `baseline.treatment` as undefined and took the Energy page down with
-- an error boundary.
--
-- These are historical evidence records, so the VALUES are untouched — only the
-- key names move, and only where the old name is actually present.

UPDATE energy_experiments
SET baseline_metrics = baseline_metrics
      - 'north' - 'south'
      || jsonb_build_object('treatment', baseline_metrics -> 'north')
      || jsonb_build_object('control', baseline_metrics -> 'south')
WHERE baseline_metrics ? 'north';

UPDATE energy_experiments
SET treatment_metrics = treatment_metrics
      - 'north' - 'south'
      || jsonb_build_object('treatment', treatment_metrics -> 'north')
      || jsonb_build_object('control', treatment_metrics -> 'south')
WHERE treatment_metrics ? 'north';

UPDATE energy_experiments
SET telemetry_quality = telemetry_quality
      - 'north' - 'south'
      || jsonb_build_object('treatment', telemetry_quality -> 'north')
      || jsonb_build_object('control', telemetry_quality -> 'south')
WHERE telemetry_quality ? 'north';

-- savings carries the renamed comparison key as well as the two side keys.
UPDATE energy_experiments
SET savings = savings
      - 'withinNorth'
      || jsonb_build_object('withinTreatment', savings -> 'withinNorth')
WHERE savings ? 'withinNorth';

-- Event payloads: `detail` may hold north/south device lists from enrollment.
UPDATE energy_experiment_events
SET detail = detail
      - 'north' - 'south'
      || jsonb_build_object('treatment', detail -> 'north')
      || jsonb_build_object('control', detail -> 'south')
WHERE detail ? 'north';
