# Cloud-Persistent 7-Day Monitoring & SLE History — Design

**Date:** 2026-08-05
**Status:** Approved, in implementation
**Branch:** `feat/monitoring-persistence`

## Problem

AURA's monitoring and SLE history exists only in volatile memory. Every historical data path
is lost on browser refresh, Railway redeploy, or instance replacement.

| Where history lives today | File | Failure mode |
|---|---|---|
| Browser `localStorage`, 10k-point cap | `src/services/sleDataCollection.ts` | Per-browser. Collection only runs while a tab is open. |
| Browser `localStorage`, 120-point cap (~2h) | `src/services/sle/xiqSleHistory.ts` | Same; only fills as the page refreshes. |
| Node module-scope array, 1000-item cap | `server.js` `throughputStore` | Wiped on every redeploy. Shared across tenants. |
| Node module-scope arrays | `server.js` `alarmStore`, `eventStore`, `backupStore` | Same. |
| Engine in-process `#trendStore` | `server/sentinel/sentinelEngine.js` | Same, and only polls while a browser has POSTed it a token. |
| Supabase `service_metrics_snapshots` | `src/services/metricsStorage.ts` | `isSupabaseConfigured` is false here, so writes go into a no-op stub. |

There is no `pg`, no ORM, no `DATABASE_URL`, and no migration runner in the repo.
`.github/workflows/metrics-collection.yml` invokes `metrics-collector-once.js`, a file that
does not exist — the workflow has never done anything.

## Outcome

A rolling 7-day history of monitoring and SLE data in Railway PostgreSQL, collected by a
server-side worker that runs whether or not a browser is open, read by the UI through the Aura
backend, surviving restarts, redeploys, browser changes, and controller outages — with outages
rendered as explicit gaps, never as zeros or fabricated values.

## Target architecture

```
Controller / Gateway APIs
  └─ Aura collector (worker.js, or in-process behind an advisory lock)
       └─ PostgreSQL (authoritative 7-day store)
            └─ Aura backend API (/api/monitoring/*)
                 └─ Aura React UI
```

## Controller historical capability

`/v1/report/aps/{serial}`, `/v1/report/sites[/{siteId}]`, `/v3/sites/{id}/report/venue`,
`/v1/report/stations/{mac}` accept `duration` + `resolution` + `widgetList` and return
source-timestamped, pre-bucketed series:

```jsonc
{ "deviceSerialNo": "…", "throughputReport": [
    { "reportName": "Throughput", "reportType": "Timeseries", "band": "all",
      "statistics": [ { "statName": "Total", "unit": "bps",
                        "values": [ { "timestamp": 1785961920000, "value": "42354" } ] } ] } ] }
```

Verified against the live capture in `src/test/fixtures/apInsights.fixture.ts`
(XCC 10.18.1.0-011R). Units observed: `bps`, `%`, `dBm`, `mW`, `users`.

**Limitation:** on that controller build `duration=24H|7D|30D` return HTTP 500 for every AP
widget; only `3H` works. Backfill capability is probed per source and recorded in
`monitored_sources.capabilities`. Where long windows fail, the collector polls forward at `3H`
and preserves the gap. AURA never claims to recover samples the source did not supply.

## Key decisions

1. **`pg` with raw parameterized SQL, no ORM.** The repo has zero ORM and hand-written `.sql`.
2. **Numbered `.sql` migrations** + a small advisory-locked runner, tracked in `schema_migrations`.
3. **Separate Railway collector service by default**; `MONITORING_COLLECTOR_IN_PROCESS=true`
   runs the identical loop inside the web service. Both take the same Postgres advisory lock,
   so the modes are safe simultaneously and splitting later needs no code change.
4. **Collector credentials:** env service account (`MONITORING_CONTROLLER_USERNAME` /
   `_PASSWORD`) plus optional AES-256-GCM ciphertext in `monitored_source_credentials`, keyed by
   `MONITORING_CREDENTIAL_KEY`, write-only over HTTP. Access tokens live in memory only.
5. **Real authorization on read.** `requireAuth` in `server.js` is presence-only. The monitoring
   routes use `requireControllerScope`, which validates the caller's token against the controller
   and derives the authorized source set from it. Browser-supplied ids filter within that set.
6. **Numerator and denominator stored for every ratio** so percentages re-aggregate correctly.
   Percentages are never summed or averaged.
7. **Metric kind registry.** Every metric is classified before storage. Report-API series are
   gauges/percentages; `/v1/stations` `rxBytes`/`txBytes` are monotonic counters, stored raw with
   a separately computed delta and reset detection.

## Outage semantics

On failure the collector records the attempt, increments `consecutive_failures`, sets sanitized
error fields, backs off with jitter — and writes no samples. No zero-fill, no carry-forward, no
synthetic points. Existing rows expire only on their own `expires_at`, so a gateway down for two
days still shows the five remaining days. `/latest` reports `stale` past
`MONITORING_STALE_AFTER_SECONDS` and `offline` once the source is failing. Charts render `null`
(a break in the line), never `0`.

## Privacy

`client_external_id` is NULL by default — no MAC or username is persisted. Per-client history is
gated behind `MONITORING_PERSIST_CLIENT_IDENTIFIERS`; when enabled, MACs are stored as
HMAC-SHA256 pseudonyms.

## Out of scope

Supabase-backed Network Rewind (`metricsStorage.ts`) is not migrated. PostgreSQL becomes the
source of truth for monitoring and SLE history only.

## Deliberate omissions

**No raw-payload table.** Nothing in this design needs replay, and AP report payloads run ~80 KB
each. Revisit only if a normalization bug requires reprocessing historical collections.

**No table partitioning.** Estimated volume at the shipped defaults is ~0.8M rows / ~250 MB over
seven days. Revisit above a sustained 20M live rows.
