-- Indexes matched to how the dashboard actually queries a time range.
--
-- Every read path is scoped to an authorized source set first (see
-- requireControllerScope), so the leading column of a useful index is always
-- monitored_source_id. The queries that follow are:
--
--   history   : source IN (…) AND observed_at BETWEEN … [AND metric_family = …]
--                                                       [AND site_id = …]
--   coverage  : the same window, grouped by local calendar day
--   aggregate : the same window, narrowed to one metric_name
--
-- 0001 shipped (monitored_source_id, observed_at DESC), which serves the window
-- but then re-checks metric_family on every row it returns — on a source that
-- collects four families, roughly three quarters of the heap fetches for an SLE
-- chart are discarded after the fact. The composite below lets the family filter
-- be satisfied by the index instead.
--
-- Note on CONCURRENTLY: the migration runner wraps each file in a transaction,
-- where CREATE INDEX CONCURRENTLY is not permitted. These therefore take a
-- write lock on metric_samples for the duration of the build. That is
-- acceptable here — the collector retries with backoff and the table is small
-- (a rolling 7 days) — but a future migration against a much larger table
-- should be run outside the runner.

-- Primary read path: source + family + time.
CREATE INDEX IF NOT EXISTS idx_metric_samples_source_family_observed
  ON metric_samples (monitored_source_id, metric_family, observed_at DESC);

-- Site-scoped variant, for a dashboard filtered to one site. Partial, because a
-- site-scoped query never wants the org-wide rows where site_id IS NULL.
CREATE INDEX IF NOT EXISTS idx_metric_samples_source_site_family_observed
  ON metric_samples (monitored_source_id, site_id, metric_family, observed_at DESC)
  WHERE site_id IS NOT NULL;

-- Superseded by the two above.
--
-- Both were keyed on a dimension *without* monitored_source_id, so neither
-- could serve a query that must filter by authorized source first — the planner
-- would have had to scan every source's rows for the site or metric and filter
-- afterwards, which is strictly worse than the source-leading composites. They
-- only cost write throughput on a table the collector appends to continuously.
DROP INDEX IF EXISTS idx_metric_samples_site_observed;
DROP INDEX IF EXISTS idx_metric_samples_metric_observed;
