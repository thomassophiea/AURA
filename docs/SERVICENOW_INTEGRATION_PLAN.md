# ServiceNow Bidirectional Integration — Future Plan

**Status:** planned, not started (assessed 2026-08-31)
**Estimate:** ~1.5–2 weeks full bidirectional; 2–3 days for demo-grade outbound-only
**Verdict:** ~60% of the required infrastructure already exists. Outbound is
small-to-moderate; inbound is moderate and the security plumbing is the bulk of it.

## What the integration does

- **Outbound:** Sentinel alerts become ServiceNow incidents (Table API,
  `POST/PATCH /api/now/table/incident`), routed through the existing
  min-severity / quiet-hours / escalation policy. Escalation updates the
  incident; alert resolution closes it.
- **Inbound:** ServiceNow (Business Rule or Flow Designer flow) calls back into
  AURA to ack or close an alert when the incident is worked in ServiceNow.

## What already exists (do not rebuild)

| Capability | Where |
|---|---|
| Alarm model: dedup, severity, occurrences, ack, auto-resolve | `server/sentinel/alertStore.js` (in-memory, authoritative) + `server/sentinel/sentinelRepository.js` (Postgres mirror) |
| Routing policy: min-severity, quiet hours (IANA tz), escalation | `server/sentinel/alertRouting.js`, config in `sentinel_config` |
| Dispatch choke point for new alerts | `sentinelEngine.js` poll loop builds `notifiable[]` (~line 200) → private `#dispatch(toRoute, 'sentinel.alerts')` (~line 280); second path `#dispatchEscalations()` (~line 293) |
| Generic outbound POST (fire-and-forget) | `server/sentinel/sentinelWebhook.js` |
| Template for an authenticated outbound client | `server/guests/cwpClient.js` — bearer auth, call-time env config, `configured` inert flag, typed `Unavailable` vs `Request` errors |
| Settings storage | `aura_settings` KV via `getSetting`/`setSetting` in `server/identity/identityStore.js`; write-only secret pattern = `clientSecretSet` boolean (see `src/components/admin/IdentityAdminSection.tsx`) |
| Admin UI precedent | Sentinel webhook dialog in `src/components/sle/SentinelInfraTab.tsx` (`SentinelWebhookButton`, ~line 911) + `src/services/sentinelService.ts` |
| Audit trail | `audit(action, {actor, source, target, detail})` in `identityStore.js` → `aura_audit_log` |
| Background-job pattern (interval + advisory lock + done-recently check) | `startNightlyCapture()` in `server/config/configSnapshotService.js` |

## What is net-new

1. **Delivery durability** — `dispatchWebhook` drops failures with a
   `console.warn`. A ticketing system needs an outbox/retry.
2. **Resolve event** — `resolveAbsent()` and `syncCheckAlerts` resolve alerts
   silently; nothing is emitted, so auto-close has no hook today.
3. **Inbound service-to-service auth** — none exists. `requireAuth`
   (`server.js:~450`) is presence-only and accepts any ≥10-char bearer string.
4. **Resolve-by-external-system** — ack exists
   (`POST /api/sentinel/alerts/:id/ack`), a close/resolve route does not.

## Phase 1 — Correlation store + ServiceNow client (outbound foundation)

Sentinel's authoritative state is an in-memory Map (cap 500, resolved pruned
after 30 min); the Postgres mirror self-disables on schema error. **Do not
piggyback correlation on the alert store.** New table, own module:

- `servicenow_incidents (alert_id text PK, sys_id text, state text,
  last_pushed_at, attempts int, last_error text, created_at, updated_at)` —
  doubles as the outbox (state: `pending|created|update_pending|closed|failed`).
- Schema must be written **twice**: `server/db/migrations/0014_servicenow.sql`
  **and** an idempotent DDL const in the new repository module (deployed Railway
  images don't ship `migrations/`; migrations run manually via
  `railway run --service <svc> npm run migrate` — see `railway.toml` comment).
- `server/servicenow/serviceNowClient.js` modeled on `cwpClient.js`:
  Table API, basic auth or OAuth; instance URL/user/field-mappings in
  `aura_settings` under `servicenow`; secret env-only
  (`SERVICENOW_SECRET`) surfaced as `secretSet` boolean.
- Severity → urgency/impact mapping lives in settings, with sane defaults
  (critical→1/1, warning→2/2, info excluded — info is already never notifiable).

## Phase 2 — Wire outbound dispatch + retry

- Open up the `#dispatch` choke point: either a small dispatcher registry
  inside `SentinelEngine` or promote dispatch to a notifier module the engine
  calls. Existing webhook keeps working unchanged.
- New alert → insert `pending` row + attempt create; escalation → `PATCH`
  (bump urgency / add work note).
- Retry sweep: `setInterval` + `pg_try_advisory_lock` (copy the
  `startNightlyCapture` pattern), retries `pending`/`failed` rows with capped
  attempts. No queue library — the repo deliberately has none.
- Every push/failure → `audit('sentinel.servicenow', …)`.

**Demo-grade cutline:** end of Phase 2 without the retry sweep is the 2–3 day
outbound-only version.

## Phase 3 — Resolve event + auto-close

- Capture transitioning IDs in `resolveAbsent()` / `syncCheckAlerts` (the bulk
  `UPDATE` path) and emit a `sentinel.resolved` dispatch.
- Handler closes the incident (`state=6/7` per mapping, close notes = alert
  message + occurrences) and marks the correlation row `closed`.

## Phase 4 — Inbound callback (security is the work)

- Real HMAC middleware (shared secret, `X-AURA-Signature` over raw body,
  timestamp window vs replay). Model: the CWP repo's `INTERNAL_API_TOKEN`
  discipline — **missing secret means the route is disabled, never open**.
- `server/servicenow/serviceNowCallbackRouter.js`, mounted in `server.js`
  **before the catch-all `/api` proxy (~line 2474)** or callbacks silently
  proxy to the Campus Controller.
- Add the signature header to the fixed CORS `allowedHeaders` list
  (`server.js:~296` region) and carve out / verify `apiLimiter` behavior.
- Actions: ack (reuse existing store logic, actor = `servicenow`) and the new
  **resolve** store method + route. Both audited.
- ServiceNow side: Business Rule / Flow Designer on incident state change →
  POST to AURA. Standard config, low risk.

## Phase 5 — Admin UI + QA

- Lift integration config out of the buried Sentinel dialog into a proper
  **Administration → Integrations** tab (`src/components/Administration.tsx`
  currently has system/administrators/applications; note
  `ApplicationsManagement.tsx:~377` has a literal "Webhooks" label — check if
  inert placeholder). Copy `IdentityAdminSection.tsx` shape: GET/PUT settings,
  secret-set flag, Test button (create+close a sandbox incident).
- Tests through the normal AURA-QA gate; promotion via AURA-Release as always.

## Risks / decisions to make up front

- **Disposable alert store vs durable tickets** — solved by Phase 1's own
  table; do not add ServiceNow columns to `sentinel_alerts`.
- **OAuth vs basic auth** to ServiceNow — basic is faster to ship; decide per
  the target instance's policy.
- **Which ServiceNow instance** (customer PDI vs Extreme dev instance) — needed
  before Phase 1 can be verified end-to-end.
