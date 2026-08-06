# Railway Deployment Checklist — Monitoring Persistence

Repository-specific steps. Commands come from this repo's `package.json`; nothing here
assumes a Railway UI layout beyond "a service has a start command and variables".

Current project: **EDGE Services** (`9251c5b9-d1db-462a-8dcc-ef7d913ec37e`), environment
`production`. Relevant services: `Integration (AURA)` (public domain
`integration.up.railway.app`) and `Postgres` (private domain
`postgres-ab37.railway.internal`, PostgreSQL 18.4). NIXPACKS builder; the web start
command was previously `node server.js`.

Postgres has **no public TCP proxy**, so it is reachable only from inside the project's
private network. That is the right default — enable a proxy only if you need external
tooling, and prefer `railway ssh --service Postgres` with `psql` instead.

---

## 1. Add PostgreSQL

Add a PostgreSQL database to the existing Railway project. Railway exposes
`DATABASE_URL` on that service.

- [ ] PostgreSQL service shows **Online**.

## 2. Expose `DATABASE_URL` to the app services

On the **Aura web/API** service (and later the collector and cleanup services), set:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Use the reference form, not a pasted literal — it follows credential rotation and stays
on Railway's private network.

- [ ] `DATABASE_URL` present on every service that needs it.

## 3. Set monitoring variables on the web service

Minimum:

```
CAMPUS_CONTROLLER_URL=https://<your-controller>
MONITORING_CONTROLLER_USERNAME=<service account>      # or CAMPUS_CONTROLLER_USER
MONITORING_CONTROLLER_PASSWORD=<service account pw>   # or CAMPUS_CONTROLLER_PASSWORD
MONITORING_RETENTION_DAYS=7
MONITORING_POLL_INTERVAL_SECONDS=300
MONITORING_STALE_AFTER_SECONDS=900
MONITORING_COLLECTOR_ENABLED=true
MONITORING_CLEANUP_ENABLED=true
MONITORING_CREDENTIAL_KEY=<openssl rand -base64 32>
```

⚠ **Remove `VITE_CAMPUS_CONTROLLER_USER` and `VITE_CAMPUS_CONTROLLER_PASSWORD` if
present.** `VITE_`-prefixed variables are compiled into the browser bundle, so those
publish controller credentials to every visitor. `.env.example` marks them
DEPRECATED — DO NOT USE. The collector reads the unprefixed names.

- [ ] Controller credentials set (unprefixed only).
- [ ] No `VITE_`-prefixed credential variables remain.

## 4. Deploy database migrations

The web service start command in `railway.toml` already runs them:

```
node server/db/migrate.js && node server.js
```

The runner is advisory-locked and idempotent, so concurrent instances are safe. To run
it manually:

```bash
railway run npm run migrate
```

- [ ] Deploy logs show `[migrate] applying 0001_monitoring.sql` (first deploy) or
      `0 applied, 1 already present` (subsequent).

**Already done for the *EDGE Services* project.** `0001_monitoring.sql` is applied to the
`railway` database and recorded in `schema_migrations`, so the first deploy of this branch
will report it as already present. The database had no `public` tables beforehand; the
eight now there are all from this migration.

## 5. Confirm the web service

- [ ] Boot log shows `✓ DATABASE_URL configured`.
- [ ] Boot log shows `✓ Monitoring history API mounted at /api/monitoring/*`.
- [ ] Boot log shows `✓ Monitoring source registered: <controller url>`.
- [ ] No `⚠ No collector credentials configured` warning.
- [ ] `GET /health` returns `{"status":"ok","database":{"ok":true,…}}`.

## 6. Create the collector service

New service from the **same repository**.

```
Start command: npm run collector
Variables:     DATABASE_URL=${{Postgres.DATABASE_URL}}
               CAMPUS_CONTROLLER_URL
               MONITORING_CONTROLLER_USERNAME / _PASSWORD
               MONITORING_CREDENTIAL_KEY
               MONITORING_RETENTION_DAYS, MONITORING_POLL_INTERVAL_SECONDS
```

**Single-service alternative:** skip this and set `MONITORING_COLLECTOR_IN_PROCESS=true`
on the web service. Both take the same advisory lock, so running both is safe.

- [ ] Collector logs `{"event":"collector.started",…}`.
- [ ] Within one poll interval, `{"event":"monitoring.source_collected","status":"succeeded"}`.

## 7. Create the cleanup service

New service from the same repository, scheduled.

```
Start command: npm run monitoring:cleanup
Cron schedule: 17 * * * *
Variables:     DATABASE_URL, MONITORING_RETENTION_DAYS, MONITORING_CLEANUP_ENABLED
```

Hourly at minute 17 — avoids midnight batch pile-ups. The command exits 0 when there is
nothing to delete or when another instance holds the lock, so a legitimate no-op does not
report as a failed job.

- [ ] Scheduled run logs `[cleanup] removed N expired sample(s) …` and exits 0.

## 8. Verify networking and variables

- [ ] `DATABASE_URL` resolves over Railway's private network (`*.railway.internal`).
- [ ] The collector can reach `CAMPUS_CONTROLLER_URL` from Railway's egress.
- [ ] `MONITORING_CREDENTIAL_KEY` is identical on the web and collector services —
      credentials written by one must decrypt on the other.

## 9. Confirm collection health

```bash
curl -H "Authorization: Bearer $TOKEN" \
     -H "X-Controller-URL: https://<your-controller>" \
     https://<app>/api/monitoring/sources/health
```

- [ ] `state: "fresh"`, `consecutiveFailures: 0`.
- [ ] `recentRuns[0].status: "succeeded"` with a non-zero `recordsInserted`.
- [ ] `servingFrom: "database"`.

## 10. Confirm history is being stored

```bash
railway run psql $DATABASE_URL -c \
  "SELECT metric_family, count(*), min(observed_at), max(observed_at)
   FROM metric_samples GROUP BY 1;"
```

- [ ] `sle` and `site_report` rows present, `max(observed_at)` advancing between polls.

## 11. Simulate a gateway outage

Point `CAMPUS_CONTROLLER_URL` at an unreachable host on the collector service, or block
the controller, and wait one poll interval.

- [ ] Collector logs `{"event":"monitoring.collector_failed","errorClass":"network"}`.
- [ ] `/api/monitoring/sources/health` shows `consecutiveFailures > 0` and eventually
      `state: "offline"`.
- [ ] **No new samples were written** —
      `SELECT max(observed_at) FROM metric_samples;` has not advanced.

## 12. Verify stored history stays visible

With the gateway still down, open Service Levels in a **different browser** (or a private
window) and reload.

- [ ] Charts still render the preceding days.
- [ ] The badge reads **Gateway unavailable**, with "Showing stored data through …".
- [ ] Nothing is labelled "live".
- [ ] The outage renders as a break in the line, **not** as a run of zeros.
- [ ] A site that was never collected reads **No data collected**, distinct from offline.

Then restore the controller.

- [ ] Collection resumes automatically after the backoff window.
- [ ] The badge returns to **Stored**.

## 13. Verify retention

On a **scratch database only** (this deletes data):

```bash
DATABASE_URL=$SCRATCH_URL MONITORING_RETENTION_DAYS=1 npm run monitoring:cleanup
```

- [ ] Rows whose `expires_at` has passed are removed; newer rows remain.
- [ ] A second run reports 0 deleted — the operation is idempotent.
- [ ] `current_metric_state` still has rows, so "offline since X" survives expiry.

---

## Production hardening

`NODE_ENV=production` is set on the *EDGE Services* web service. That is what makes the
boot-time `DATABASE_URL` assertion real — without it a missing database degrades silently
instead of failing visibly.

It also enables the `/api/*` rate limiter, which is why `app.set('trust proxy', 1)` had to
land first. Railway forwards over one proxy hop, so without it `req.ip` is the proxy's
address for every visitor and the limiter keys the entire internet into one
2000-per-15-minutes bucket. `1` rather than `true`, so a client cannot spoof its own address
by sending `X-Forwarded-For` itself.

**Still open:** `ALLOWED_ORIGINS` is unset, so CORS accepts any origin even in production.
Setting it to the served origin (`https://integration.up.railway.app`) would enforce the
whitelist — deliberately not done here, because it would also block any other access path,
and which origins are legitimate is a deployment decision rather than a code one.

`VITE_CAMPUS_CONTROLLER_USER` and `VITE_CAMPUS_CONTROLLER_PASSWORD` have been **deleted**.
Anything `VITE_`-prefixed is compiled into the browser bundle, so those published the
controller password to every visitor. The collector reads the unprefixed names.

## Rollback

Set `MONITORING_COLLECTOR_ENABLED=false` and redeploy. Collection stops; the API keeps
serving stored history; nothing is deleted. To roll back the UI as well, revert the
branch — the schema is additive and leaving the tables in place is harmless.
