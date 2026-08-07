# Monitoring Persistence

Cloud-persistent, rolling **7-day** history of AURA monitoring and SLE data, stored in
Railway PostgreSQL.

## Why this exists

Before this, every historical data path in AURA was volatile:

| Where history lived | Failure |
|---|---|
| `src/services/sleDataCollection.ts` — browser `localStorage`, 10k points | Per-browser. Collection only ran while a tab was open. |
| `src/services/sle/xiqSleHistory.ts` — browser `localStorage`, ~2h | Same. |
| `server.js` `throughputStore` — module-scope array, 1000 entries | Wiped on every redeploy; shared across tenants. |
| `server/sentinel/sentinelEngine.js` `#trendStore` | Same, and only polled while a browser had pushed it a token. |
| `src/services/metricsStorage.ts` — Supabase | `isSupabaseConfigured` is false in this deployment, so writes went to a no-op stub. |

Refreshing the browser, redeploying, or replacing a Railway instance lost everything.

## Architecture

```
Controller / Gateway APIs
  └─ Collector (server/collectorWorker.js, or in-process behind an advisory lock)
       └─ PostgreSQL  ← authoritative 7-day store
            └─ Aura backend API  (/api/monitoring/*)
                 └─ Aura React UI
```

The browser **reads** history from the backend. It never maintains it.

## Data flow

1. **Collect** — `server/monitoring/collectorRunner.js` loads enabled sources, takes a
   per-source PostgreSQL advisory lock, and runs each collector under a concurrency cap
   and a request timeout.
2. **Normalize** — pure functions in `server/monitoring/normalizers/` turn controller
   payloads into samples. Null and non-numeric points are dropped, never zero-filled.
3. **Persist** — `sampleRepository.insertSamples` does a batched
   `INSERT … ON CONFLICT DO UPDATE` on a deterministic identity key, inside one
   transaction per batch.
4. **Serve** — `monitoringRouter.js` answers bounded range queries scoped to the caller's
   authorized sources.
5. **Expire** — `server/retentionCleanup.js` deletes rows past `expires_at`.

## Railway services

Every service runs the same start command (`node server.js`) and differs only by
`MONITORING_ROLE` — see below.

| Service | `MONITORING_ROLE` | Purpose |
|---|---|---|
| PostgreSQL | — | Authoritative store. Provides `DATABASE_URL`. |
| Aura web/API | unset | UI + `/api/monitoring/*`. |
| `aura-collector` | `collector` | Polls controllers 24/7. |
| `aura-cleanup` (cron `17 * * * *`) | `cleanup` | Retention sweep, then exits. |

Migrations are deliberately **not** chained into the web start command. They were once, and
it took the service down — any migration problem became a full outage. Run them explicitly:
`railway run --service <svc> npm run migrate`.

### Files must live under `server/`

The deployed image contains only `build/`, `node_modules/`, `package*.json`, `server/`, and
`server.js`. Anything at another top level — a root `worker.js`, a `scripts/` directory, a
root `migrations/` directory — is **absent at runtime** and fails with
`ERR_MODULE_NOT_FOUND` or `ENOENT`. That is why the worker, the cleanup command, and the
migration SQL all live under `server/`. Keep new runtime files there.

### Choosing the role

Railway runs every service in a project from one repository with one start command, and
that command cannot be overridden per service from the CLI. The role is therefore chosen by
an environment variable, so the topology stays reproducible from the repo:

| `MONITORING_ROLE` | Behaviour |
|---|---|
| unset or `web` | The HTTP server (default — unset behaves exactly as before) |
| `collector` | The collector worker; opens no HTTP listener |
| `cleanup` | One retention sweep, then exits 0 |

To split the collector out: add a service from this repo and set `MONITORING_ROLE=collector`
plus `DATABASE_URL` and the controller variables. Nothing else changes — the advisory lock
makes it safe to run alongside an in-process collector during the switchover.

For a single-service deployment, set `MONITORING_COLLECTOR_IN_PROCESS=true` and
`MONITORING_CLEANUP_IN_PROCESS=true` on the web service instead. The tradeoff: in-process
work competes with request handling for CPU and dies with the web service, which is why
neither is the default.

## Commands

```bash
npm run migrate             # apply server/db/migrations/*.sql (idempotent, advisory-locked)
npm start                   # web + API
npm run collector           # collector worker
npm run monitoring:cleanup  # one-shot retention sweep; exits 0
```

## Environment

See `.env.example` for the full annotated list. Required in production:

- `DATABASE_URL` — **the server exits at boot without it.**
- `CAMPUS_CONTROLLER_URL` — seeds the default monitored source.
- `MONITORING_CONTROLLER_USERNAME` / `_PASSWORD` (or `CAMPUS_CONTROLLER_USER` /
  `_PASSWORD`) — without these the collector has nothing to authenticate with and
  reports `not_configured` rather than failing silently.

Optional but recommended: `MONITORING_CREDENTIAL_KEY` (`openssl rand -base64 32`) so
additional controllers can be registered with their own encrypted credentials.

`DATABASE_URL` and controller credentials are read server-side only. No `VITE_`-prefixed
variable carries a secret; anything `VITE_`-prefixed is compiled into the browser bundle.

## Schema

`server/db/migrations/0001_monitoring.sql`.

| Table | Purpose |
|---|---|
| `monitored_sources` | A controller/gateway being polled, plus health and probed capabilities. |
| `monitored_source_credentials` | AES-256-GCM ciphertext. Separate table so no read path can join it. |
| `collection_runs` | One row per polling attempt: status, counts, duration, sanitized error. |
| `metric_samples` | Timestamped measurements. The 7-day history. |
| `current_metric_state` | Latest value per series. **Not** expiry-pruned. |
| `collection_cursors` | Durable per-source, per-family high-water mark for backfill. |
| `collector_leases` | Observability for advisory locks. |

### Idempotency

`metric_samples` has a unique index on:

```
(monitored_source_id, site_key, device_key, radio_key, wlan_key, client_key,
 metric_family, metric_name, observed_at, dimensions_hash)
```

`*_key` and `dimensions_hash` are generated columns, so they cannot drift from the
nullable columns they mirror. This is what makes a retried, crashed, or duplicated
collector safe: re-ingesting a window updates rows in place. A random UUID would not.

### Read indexes

`0002_timerange_indexes.sql`. Every read path resolves an authorized source set *first*, so
the leading column of a useful index is always `monitored_source_id`:

- `(monitored_source_id, metric_family, observed_at DESC)` — history, coverage, aggregate.
- `(monitored_source_id, site_id, metric_family, observed_at DESC) WHERE site_id IS NOT NULL`
  — a dashboard filtered to one site. Partial, because a site-scoped query never wants the
  org-wide rows.

0001's `idx_metric_samples_site_observed` and `idx_metric_samples_metric_observed` were
**dropped**. Neither led with `monitored_source_id`, so neither could serve a source-scoped
query; they only cost write throughput on a table the collector appends to continuously.

`CREATE INDEX CONCURRENTLY` is not available here — the migration runner wraps each file in a
transaction — so these take a brief write lock on `metric_samples`. Acceptable at a rolling
7 days with a backing-off collector; a much larger table would need the index built outside
the runner.

### Metric semantics

`server/monitoring/metricRegistry.js` classifies every metric before storage:

- **gauge** — instantaneous; averaging over time is meaningful.
- **percentage** — never summed; only averaged weighted by its denominator.
- **counter** — monotonic cumulative (`/v1/stations` `rxBytes`/`txBytes`). Stored raw;
  intervals come from `counterDelta.js`, which returns `null` on a reset rather than a
  negative number or the raw post-reset reading.
- **ratio / event_count** — as named.

Every SLE sample stores `numerator` and `denominator` as well as the percentage, so a
multi-site or multi-hour figure is recomputed from the parts. Averaging stored
percentages would weight a 3-client site the same as a 300-client one.

## Retention

Default 7 days, via `MONITORING_RETENTION_DAYS`. Each row carries `expires_at`, stamped
at write time — so changing the setting affects **newly collected data only** and a typo
cannot retroactively destroy history.

`expires_at` is anchored to `observed_at`, **not** to collection time. Anchoring to
collection time would give a backfilled point a full `retentionDays` from whenever it
happened to be fetched — a 6-day-old sample would survive 13 days — and every re-ingest of
an overlapping backfill window would extend it again. Keyed on the observation, expiry is a
pure function of the point itself, so the window is a true rolling `retentionDays` of
history and re-ingesting is idempotent in lifetime as well as in value.

A consequence worth knowing: on first contact the collector requests the largest supported
window inside retention, so points at the far edge arrive already expired and the next
sweep removes them. That is correct for a rolling window, not data loss.

Cleanup deletes in bounded batches under an advisory lock. It is idempotent and safe to
run during ingestion. `current_metric_state` is deliberately **not** expiry-pruned: "the
last value we ever saw, and when" is what lets the UI say *offline since X* instead of
*never collected*.

## Gateway outages

When a controller cannot be reached the collector:

- records the attempt and increments `consecutive_failures`;
- stores a sanitized error class;
- backs off exponentially with jitter, capped by `MONITORING_MAX_BACKOFF_SECONDS`;
- **writes no samples.**

No zero-fill, no carry-forward, no synthetic points. Existing rows expire only on their
own schedule, so a gateway down for two days still shows the five days that remain inside
the rolling window. `/api/monitoring/latest` reports `stale` past
`MONITORING_STALE_AFTER_SECONDS` and `offline` once the source is failing. Charts render
a break, never a zero. UI copy:

> Gateway unavailable. Showing stored data through {lastSuccessfulCollection}.

Never "live".

## Backfill

`/v1/report/aps/{serial}`, `/v1/report/sites[/{siteId}]`, and
`/v3/sites/{id}/report/venue` accept `duration` + `resolution` and return
source-timestamped buckets, so a gap **can** be re-requested after an outage. The
deterministic uniqueness key makes the overlap a no-op.

**Support is probed per source, never assumed.** On XCC 10.18.1.0-011R,
`duration=24H|7D|30D` return HTTP 500 for every AP widget while `3H` works. Probe results
land in `monitored_sources.capabilities` and are re-probed at most daily.

**Known limitation.** Where the controller does not support a window long enough to cover
a gap, AURA polls forward at the largest window that works and the remainder stays a gap.
AURA does not, and will not, fabricate samples the source never supplied. Unrecoverable
gaps are logged as `monitoring.unrecoverable_gap`.

## Authorization

`requireAuth` in `server.js` only checks that a Bearer header is *present* — enough for
the mock endpoints it guards, not for persisted cross-controller data. The monitoring
routes use `requireControllerScope`, which validates the caller's token against the
controller named by `X-Controller-URL` (60-second positive cache) and derives the
readable source set from that. `orgId` / `siteId` from the browser are filters applied
*within* that scope, never the trust boundary.

The token-validation cache keys on SHA-256 of the **whole** token. A prefix-based key would
let two tokens from the same issuer collide, and an invalid one would inherit a valid one's
cached verdict.

The `/api/throughput/*` endpoints use the same scope middleware. They read and write durable
history now, so presence-only auth would let anyone with an arbitrary Bearer string poison
stored throughput for a registered controller.

### Reading history while the controller is down

Validating every read against the controller had a perverse consequence: a gateway outage
locked operators out of the history collected *before* the outage — the one moment it is most
wanted. `MONITORING_AUTH_GRACE_SECONDS` (default 900) fixes that. A token that has already
validated successfully keeps working for that long when the controller **cannot be
contacted**, and `req.monitoringScope.degradedAuth` records that it happened.

The grace is narrow on purpose:

- Only a *successful* validation writes to the grace cache, so an unknown token is never
  admitted, outage or not.
- A controller that **answers** `401`/`403` is definitive: the request is rejected
  immediately and the token is evicted from the grace cache, so a later outage cannot
  resurrect it.
- Any other failure — transport error, timeout, `5xx`, a proxy error, a gateway mid-restart —
  says nothing about the token and is treated as unreachable.
- With no usable grace record the response is **503 "Controller unreachable"**, not 401. A
  401 would send the operator to a login screen that cannot help them.
- Grace is **not** extended by a grace-authorized request. Only a real success refreshes the
  record, so the window is always measured from the last time the controller actually
  confirmed the token — otherwise it would renew itself indefinitely.

**Known limit, stated plainly.** AURA has no identity provider of its own; the controller is
the only thing that can vouch for a token. So a gateway that stays down *longer than the grace
window* does eventually block reads of stored history, even though the data is sitting in
PostgreSQL. The default is deliberately conservative: controller tokens themselves live on the
order of an hour, and a grace longer than the token's own lifetime would let an expired token
keep reading. Deployments that would rather have availability during multi-hour outages can
raise `MONITORING_AUTH_GRACE_SECONDS` — that is a security tradeoff to make consciously, not a
default to inherit.

Responses never carry stack traces, database errors, credentials, or raw controller
bodies. `errorSanitizer.js` redacts bearer tokens, embedded credentials, and secret query
parameters before anything is stored or logged.

### Query bounds

`MONITORING_MAX_QUERY_POINTS` (default 20 000) caps a single history response. When the cap
is hit the response sets `truncated: true` and `effectiveStart` to the real beginning of
what came back. Truncation drops the **oldest** points, never the newest — losing the
present on a monitoring chart reads as "nothing has happened lately", which is the most
misleading way to trim.

### Ranges past the retention boundary

`resolveRange` used to reject any window starting before `now - retentionDays`. That made the
**oldest selectable day unselectable**: "7 days ago" as a local calendar date begins at that
day's midnight, up to 24 hours older than `now - 7d`.

It now trims instead of refusing, and reports the trim:

| Requested window | Result |
|---|---|
| Fully retained | Served as asked. `clampedToRetention: false`. |
| Starts up to a day before the boundary | `start` moved to the boundary. `clampedToRetention: true`, `requestedStart` reports the original. The UI labels the day incomplete. |
| Ends before the boundary | `range_outside_retention`. Serving it would return an empty window that reads as an idle network. |
| Spans much more than retention (e.g. 30 days) | `range_too_large`. Trimming to 7 would hand back a window three quarters empty. |

Every response also carries `retentionStart`, which is the hard floor for what is selectable.

## Time-range selection (the UI contract)

The dashboard's window is one token in `useGlobalFilters` — so it survives navigation and
reload — resolved by `src/lib/timeRange.ts`. Two kinds exist and the distinction drives real
behaviour:

- **`day-0` … `day-7`** — a local calendar day, midnight to 23:59:59.999 in the *browser's*
  timezone. Boundaries come from the local `Date` constructor, so a DST transition yields a
  correct 23- or 25-hour day. `day-0` (Today) ends at *now*, not at a midnight in the future.
- **`15m` … `7d`** — a duration ending at now.

`range.isLive` is derived (does the window end at now?) and is the flag everything gates on:

- **Polling.** A finished day does not change, so the dashboard, the SLE page and
  `useMonitoringHistory` all stop their refresh intervals for it.
- **Gateway avoidance.** `controllerDurationFor(range)` returns `null` for a finished day.
  The controller's report APIs only accept a duration back from now and cannot express "that
  Tuesday", so callers must not ask. `VenueStatisticsWidget` and the RF-quality series render
  an explicit "not available for this window" state rather than substituting the last 24 hours
  under a past date.
- **Labelling.** `DashboardHero` drops the "Live Telemetry" eyebrow and the live dot, and
  `HistoricalScopeNotice` states which panels remain current state.

**What a past day genuinely serves from PostgreSQL:** all seven SLEs, AP health and AP counts,
client counts (all reconstructable from the `sle` family's stored `numerator`/`denominator`),
and the throughput trend. None of it needs the controller.

**What it cannot:** the AP, client and service *lists*. The controller exposes no "who was
connected last Tuesday" endpoint and AURA does not persist per-client rosters by default (see
Privacy). Those panels show current state and say so. They are not silently re-labelled.

### One selection, four surfaces

Insights (`DashboardEnhanced`), Operational Insights (`SLEDashboard`), Service Level Analytics,
AP Insights and Client Insights all read the *same* token from `useGlobalFilters` and render the
same `TimeRangeSelector`. They previously each kept their own `useState` with its own vocabulary
— `'7d'` on the SLE page, `'24h'` on Service Levels, `'3H'` on both Insights panels — so moving
between them silently changed the window out from under the operator.

Each surface can serve a past day only as far as its data actually reaches:

| Surface | Live window | Past calendar day |
|---|---|---|
| Insights | controller | SLEs, AP health, client counts, throughput from PostgreSQL |
| Operational Insights | controller | SLE history from PostgreSQL |
| AP Insights | `/v1/report/aps/{serial}` | **rebuilt from the `ap_report` family** — see below |
| Client Insights | `/v1/report/clients/{mac}` | *nothing* — per-client history is not retained |

**AP Insights.** `apInsightsHistory.ts` reassembles stored `ap_report` samples into the exact
`APInsightsResponse` shape the controller returns, so every chart, tooltip and summary tile
renders unchanged from either source and there is only one rendering path to keep correct. This
requires `MONITORING_AP_REPORTS_ENABLED=true`; without it the family is never collected and a
past day correctly reports no stored history.

The one wrinkle is that `reportNormalizer.slugifyStatName` is lossy (`"Power Consumption"` →
`power_consumption`) while the charts key on the original names (`dataKey="Power Consumption"`).
`STAT_NAME_BY_SLUG` maps them back. It is a closed table, and every entry is a slug observed in
`metric_samples` paired with a `dataKey` observed in `APInsights.tsx` — not a guess. An unmapped
slug falls back to itself, which renders as an empty chart rather than as wrong data.

**Client Insights.** Deliberately has no historical path. `client_external_id` is NULL unless
`MONITORING_PERSIST_CLIENT_IDENTIFIERS` is set with a pseudonym salt, so there is nothing stored
to serve. The panel says that, with the reason, and offers no "Try Again" — retrying cannot
change the answer. It is framed as a limitation, not an error: no red alert, no destructive
styling.

### `GET /api/monitoring/coverage`

Backs the selector's disabled and "incomplete" states. Without it the UI would offer every
day and let the user discover an empty chart.

```
GET /api/monitoring/coverage?start=…&end=…&timeZone=America/New_York[&siteId=…][&metricFamily=…]
→ { days: [{ localDate, sampleCount, firstObservedAt, lastObservedAt, hoursPresent }],
    meta: { retentionStart, retentionDays, neverCollected, clampedToRetention, … } }
```

Calendar semantics stay on the **client**: it sends bounds it computed in its own timezone,
and `timeZone` only names the zone the `GROUP BY` key is expressed in. Re-deriving local
midnights server-side for an arbitrary IANA zone would put that logic in a second place where
it could disagree with the labels the user is reading. The zone is validated against `Intl`
before it reaches an `AT TIME ZONE` expression, so a bad locale is a 400 rather than a 503.

Completeness is measured in **local hour buckets**, not sample counts: the collector's
interval is configurable and differs per family, so "how many samples should a day have" is
unanswerable, while "did every hour report something" is. `src/lib/timeRangeAvailability.ts`
turns that into `complete` / `partial` / `empty` / `outside-retention`, tolerating one missing
hour before flagging a day. `empty` and `outside-retention` are unselectable; `partial` stays
selectable with the reason attached — a partly-covered day is usually still what the operator
wants. A day clipped by retention is **never** reported as complete, even at full coverage of
its retained hours.

## Privacy

`client_external_id` is NULL by default — no MAC or username is persisted. Per-client
history is gated behind `MONITORING_PERSIST_CLIENT_IDENTIFIERS`, which requires
`MONITORING_CLIENT_PSEUDONYM_SALT` and stores HMAC-SHA256 pseudonyms rather than raw
identifiers.

## Inspecting collection health

```bash
curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Controller-URL: https://your-controller" \
     https://<app>/api/monitoring/sources/health
```

Returns per source: last attempt, last success, consecutive failures, sanitized error
category, the last five collection runs, and `servingFrom: "database"`.

`GET /health` reports database reachability without touching any controller.

Structured logs are single-line JSON with an `event` field: `monitoring.source_collected`,
`monitoring.collector_failed`, `monitoring.source_backoff`,
`monitoring.source_locked_elsewhere`, `monitoring.unrecoverable_gap`,
`monitoring.cleanup_complete`. Full payloads are never logged.

## Disabling collection safely

```
MONITORING_COLLECTOR_ENABLED=false     # stop all polling
```

or per source:

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"enabled": false}' \
     https://<app>/api/monitoring/sources/<id>/enabled
```

Both stop writes. Neither deletes stored history, and it stays readable.

## Local development

```bash
docker run --rm -e POSTGRES_PASSWORD=aura -e POSTGRES_DB=aura -p 5432:5432 postgres:16
export DATABASE_URL=postgres://postgres:aura@localhost:5432/aura
npm run migrate
npm start
```

Database integration tests need their own disposable database:

```bash
export TEST_DATABASE_URL=postgres://postgres:aura@localhost:5432/aura_test
npm test
```

Without `TEST_DATABASE_URL` those suites **skip loudly** — they print a warning naming
what was not exercised, so a green run never implies coverage that did not happen.

## Verification status

Verified against the live Railway PostgreSQL (**18.4**) in project *EDGE Services*, using
throwaway databases so no production table was touched:

- `server/db/migrations/0001_monitoring.sql` applies cleanly, and re-applies cleanly to a database
  that already has it while preserving existing rows.
- 15 SQL-contract assertions pass, including the load-bearing one: `ON CONFLICT` correctly
  infers the unique index built over **generated** columns. Had that inference silently
  failed, every upsert would have duplicated instead of updating.
- 63 assertions against the **real repository modules** (`sampleRepository.js`,
  `sourceRepository.js`, `credentialCrypto.js`, `pool.js`) pass — batched upserts,
  insert-vs-update accounting via `xmax`, two concurrent writers producing one row set,
  whole-batch rollback on an invalid row, the AES-256-GCM credential round-trip through
  `bytea`, the older-backfill-does-not-overwrite guard, truncation keeping the newest
  points, batched retention, cleanup concurrent with ingestion, and cursor monotonicity.
- Cross-session advisory locking behaves as the duplicate-worker defence requires:
  `hashtextextended` keys are stable across sessions, a second session is refused while a
  lock is held, different keys proceed concurrently, and a lock releases when its holder
  exits.

The schema is applied to the production `railway` database and recorded in
`schema_migrations`.

### Live in production

Deployed to the *EDGE Services* Railway project and collecting from the lab controller:

- `sle` collector: **succeeded**, 9 samples/poll, all seven SLE metrics including the
  AP-based `ap_health` and `capacity`.
- `ap_report` collector: **succeeded**, 6 APs, ~14 series each — power in `mW`, RSS in
  `dBm`, channel utilization in `%`, throughput in `bps`, unique users.
- **Idempotency confirmed under real load:** a poll reporting `recv=6120 ins=0 upd=6120`,
  i.e. re-fetching the same 3-hour window updated every row in place and duplicated none.
  The following poll inserted only the 68 genuinely new buckets.
- **Backfill confirmed:** the first poll recovered 3.0 hours of history from *before* the
  collector started, because the report endpoint serves a `3H` window.
- Retention stamps sit exactly 7.00 days after each observation.

### Read API and UI, verified in a browser

Driven against the deployed app with a real controller login:

- Service Levels defaults to **Last 7 Days**, all seven SLE metrics render.
- The freshness badge reads **“Stored”**, tooltip *“Served from AURA's database. Last
  successful collection …”*. Nothing in the UI calls stored data live.
- `GET /api/monitoring/history?metricFamily=sle` → **200**, 9 series / 456 points,
  `servingFrom: "database"`, `retentionDays: 7`, `neverCollected: false`,
  `truncated: false`, and numerator/denominator present on every point (36/36).
- `GET /api/monitoring/latest` → **200**, `state: "fresh"`, `dataAgeSeconds: 40`.
- `GET /api/monitoring/sources/health` → **200**, `state: "fresh"`,
  `consecutiveFailures: 0`, `servingFrom: "database"`.

### Outage lifecycle, observed in production

A simulated outage was run end to end by pointing the collector's
`CAMPUS_CONTROLLER_URL` away, so the registered source failed as `not_configured` with zero
login attempts against the real controller:

1. Failures recorded — `consecutive_failures` climbed to 4, `last_error_code=not_configured`
   — and **the sample count froze**. Nothing was written, invented, or zeroed.
2. `/latest` reported `state: "offline"` while **retaining the last value** (100, age 443s).
3. `/history` kept serving throughout: 9 series, 843 points, and no point anywhere with
   value `0`.
4. The UI badge read exactly **“Gateway unavailable”**, tooltip *“Gateway unavailable.
   Showing stored data through Aug 6, 02:16 PM.”*
5. On restore the source **recovered by itself** — `consecutive_failures` back to 0, samples
   resumed — with no intervention.
6. The series kept a genuine **12.5-minute gap** (18:16:03 → 18:28:34) exactly matching the
   outage window.

**Still not run:** the `*.db.test.js` suites under Vitest — there is no local PostgreSQL and
Railway exposes no TCP proxy — though the driver above covers the same ground through the
same modules.

## Volume and future work

At the shipped defaults (site + SLE always, AP reports off), roughly **0.8M rows / 250 MB**
over seven days for 10 sites; ~2.4M rows with AP reports at 15-minute resolution.

Plain PostgreSQL, no partitioning — appropriate at this scale. Revisit partitioning or
longer-term rollups above a sustained ~20M live rows.

## Controller quirks found on XCC 10.18.1.0-011R

Measured against the live lab controller. All of these are controller-side; the collector
handles each without fabricating data.

| Endpoint | Behaviour | How the collector copes |
|---|---|---|
| `/v1/report/aps/{serial}?duration=3H` | **Works.** ~14 series per AP, 2-minute buckets, 90 points per 3H window | Primary source of persisted timeseries |
| `/v1/report/aps/{serial}` at `24H`/`7D`/`30D` | HTTP 500 for every widget | Capability-probed per source; falls back to `3H` and preserves the gap |
| `/v3/sites/{id}/report/venue` on a site with data | **HTTP 500 `"Exception: null"`** for *any* widget list — probed six variations including single-widget and no `statType` | Recorded as a partial failure; no samples written |
| `/v3/sites/{id}/report/venue` on an empty site | HTTP 200, but the only statistic is named `NoData` with value `0` | Skipped as a no-data marker — storing it would have persisted an absence as a zero measurement |
| `/v3/sites/{id}/aps`, `/v1/sites/{id}/aps`, `/v3/sites/{id}/accessPoints` | **All 404.** There is no per-site AP endpoint | APs come from `/v1/aps/query` once per poll, grouped by site via `hostSite` (the site *name* — AP rows carry no `siteId`) |
| `/v3/sites/{id}/stations` | Works | Per-site client data for the SLE collector |
| `/v1/oauth2/token` | Accepts **only** `{grantType, userId, password}`; `grant_type` and `username` variants return HTTP 422 | A 401 on the accepted shape therefore genuinely means bad credentials |

Consequence: on this controller the `site_report` collector permanently reports `partial` and
contributes nothing, because the one site with data 500s and the other two are empty. That
status is accurate and is left visible rather than suppressed. The useful history comes from
`ap_report` and the computed `sle` family.

## Known limitations

1. **XIQ history is not cloud-persisted.** XIQ exposes no reachable time-series API
   through the proxy, so `src/services/sle/xiqSleHistory.ts` still keeps XIQ trends in
   browser `localStorage`. The `monitored_sources.source_type` column allows `'xiq'`, but
   no XIQ collector exists. XIQ trends therefore remain per-browser and are lost on
   refresh — the same limitation as before this work, not a new one.
2. **`sleDataCollection.ts` is retained as a fallback.** When the backend has no stored
   history for a metric, `mergeSleHistory` leaves the existing browser-computed series in
   place, so a freshly deployed collector degrades to the previous behaviour instead of
   showing an empty chart. It is no longer the source of truth.
3. **Long outages may be unrecoverable** on controller builds where only `duration=3H`
   works. See Backfill.
4. **Supabase-backed Network Rewind** (`src/services/metricsStorage.ts`) is unchanged and
   out of scope.

## Backup and restore

Railway PostgreSQL backups cover this data. Because the window is a rolling seven days,
a restore older than seven days yields rows that the next cleanup run will delete — a
restore is useful for recovering recent history, not as an archive. For longer retention,
add a rollup table rather than lengthening `MONITORING_RETENTION_DAYS`, which would
multiply high-resolution volume linearly.
