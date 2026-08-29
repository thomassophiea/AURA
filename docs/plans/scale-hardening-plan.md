# Plan: Scale Hardening for 100K APs / hundreds of Gateways / thousands of Sites

## Context
AURA runs against Extreme Campus Controllers. Target customers have ~100,000 APs,
hundreds of Gateways (each a monitored "source"), and thousands of sites. The
controller API returns full collections (`/v1/aps`, `/v1/stations`) with no
offset/limit paging — only a `brief` projection and a `/v1/aps/query?query=&requestedColumns=`
filter. So scale must be handled in the AURA Express server and the React client:
never hold 100K rows in a browser dropdown, never make 100K per-AP controller
calls in one poll, never re-probe hundreds of gateways on every page load.

Deploys go to Integration from `main`. Every mutating route is RBAC-gated
(requireRole viewer<operator<admin) and audited. Server modules follow a
resilience contract: without DATABASE_URL they degrade to safe no-ops; DDL is
lazy-ensured (migrations/ is the canonical copy, deployed images lack it).

## Global Constraints
- Node ESM, 2-space indent, single quotes, 100-char lines (Prettier/ESLint enforced).
- New Express routes: RBAC via `requireRole` from `server/identity/identityRouter.js`;
  audit sensitive writes via `audit()` from `server/identity/identityStore.js`.
- Reads open to any authenticated caller; writes need `operator`; user/settings need `admin`.
- Tests: Vitest. Pure logic gets unit tests. No test that asserts nothing.
- Never disable TLS verification. Controller sessions use the existing
  `ControllerSession` (server/monitoring/controllerClient.js) or the proxy.
- No fake data. If a capability can't be backed by real controller data, don't ship UI for it.
- Every new caps/limits value is a named constant with a comment.

## Task 1 — Server-side device search endpoints
Create `server/devices/deviceSearchRouter.js` exposing:
- `GET /api/devices/aps/search?q=&limit=` — fetch APs from the controller via the
  proxy path `/v1/aps/query` with `requestedColumns` limited to
  serialNumber,apName,hostname,ipAddress,siteName/hostSite,status and (when q is
  empty) `brief`; filter case-insensitively by q across name/serial/ip/site; cap
  results at `limit` (default 50, max 200). Response: `{ items, total, capped }`.
- `GET /api/devices/clients/search?q=&limit=` — same shape over `/v1/stations`,
  filtering by hostName/mac/ssid/ip.
- A 15-second in-memory TTL cache keyed by controller URL so repeated typeahead
  keystrokes don't re-hit the controller; the cache holds the brief full list,
  filtering happens per request.
Auth: the caller's bearer/`X-Controller-URL` is forwarded to the controller via
the existing proxy/`makeAuthenticatedRequest` server path — reuse how other
server routers reach the controller (fetch through the in-process proxy or
`ControllerSession` with the request's token). Guard with `requireRole('viewer')`.
Mount in server.js after the other `/api` routers. Unit-test the pure
filter/cap/sort helper (export it) with a synthetic 1,000-item list: q filters,
cap enforced, `capped` flag correct, `total` is the pre-cap match count.

## Task 2 — Wire pickers to server-side search
In `src/components/UnifiedFilterBar.tsx`, the `access-point` and `client` popover
tabs currently call `apiService.getAccessPoints()` / `getStations()` and render
ALL items. Change them to call the Task 1 search endpoints with the popover
search box as `q` (debounced ~250ms), rendering only the returned capped items,
and show a "Showing first N of M — refine search" line when `capped`. The
default (empty q) shows the first N. Keep the existing item shape/behavior
(selecting an AP/client still calls selectAP/selectClient). Add a small
`src/services/deviceSearch.ts` client for the two endpoints. Do NOT change the
`site` scoping picker (SourceSiteSelector) in this task. Type-check clean.

## Task 3 — Bound sentinel check work at fleet scale
`server/sentinel/checks/vlanTrunkCheck.js` and `apStatusCheck.js` must not do
per-AP work across an unbounded fleet. Add a `SENTINEL_MAX_APS_SCANNED` cap
(constant, default 500) applied to the AP list each scans; when the fleet
exceeds the cap, scan the first N and set evidence `sampled: true`,
`scannedCount`, `totalCount`, and a summary that says plainly it sampled N of M
(site-scoped runs remain exhaustive within a site). The LLDP wave batching stays.
No alert may claim fleet-wide certainty when sampled. Update/extend the existing
tests (`vlanTrunkCheck.test.js`, `newChecks.test.js`) to cover: under cap =
exhaustive, over cap = sampled with correct counts and summary wording.

## Task 4 — Estate rollup: bounded concurrency, timeout, TTL cache
`server/estate/estateRouter.js` currently probes every source with
`Promise.all` (unbounded) on each request. Add: (a) a bounded-concurrency runner
(constant `ESTATE_PROBE_CONCURRENCY`, default 8) — create a tiny
`server/lib/pLimit.js` helper (or inline) and unit-test it; (b) a per-source
probe timeout (constant, default 10s) so one hung gateway can't stall the rollup;
(c) a server-side TTL cache (constant `ESTATE_CACHE_TTL_MS`, default 30s) of the
whole summary keyed by the source-set, so hundreds of gateways aren't re-probed
on every page load — include `collectedAt` and a `cached` flag in the response.
Keep worst-first ordering and per-source failure-as-row behavior. Unit-test the
pLimit helper (respects the concurrency cap, preserves result order, surfaces
rejections without killing the batch).

## Task 5 — Config snapshot restore (safe, dry-run-first)
Add restore to `server/config/configSnapshotService.js` + `configRouter.js`:
- `computeRestorePlan(currentSections, targetSnapshotSections)` (pure, exported,
  tested): returns per-section the items that would be created/updated/deleted to
  make current match target, by the same keying as diffSections.
- `POST /api/config/restore` (requireRole('admin'), audited) with body
  `{ snapshotId, sections?: string[], confirm?: string }`. WITHOUT a matching
  confirm token it returns the plan only (dry run): `{ dryRun: true, plan }`.
  WITH `confirm` equal to the snapshot id it is ALLOWED to apply — but apply is
  gated behind `SENTINEL...`? no: gate behind env `CONFIG_RESTORE_ENABLED==='true'`;
  when not enabled, apply returns 403 with a clear message and still returns the
  plan. This keeps a destructive controller write off by default.
- Frontend `src/components/ConfigHistory.tsx`: a "Restore…" action on a snapshot
  that calls the dry-run, shows the plan (counts + item names per section), and
  only offers an Apply button when the server reports restore is enabled;
  Apply requires a typed confirmation. Admin-gated in the UI via useAuraSession.
Unit-test computeRestorePlan (create/update/delete detection, section filter).
Do NOT execute a real apply in any automated test.

## Task 6 — Standalone escalation timer
Escalation currently only sweeps inside `poll()`. When background polling is Off,
unacknowledged criticals never escalate. In `server/sentinel/sentinelEngine.js`
add a lightweight independent interval (constant `ESCALATION_SWEEP_MS`, default
60s) that runs the existing escalation sweep (`#dispatchEscalations`) without
polling, started in the constructor and cleared in `destroy()`. It must be a
no-op when no webhook or no escalation policy is configured, and must not
double-dispatch with the poll-driven sweep (the escalatedIds set already
dedupes). Extend `sentinelEngine.persistence.test.js` (or a new test) to verify
the timer sweeps independently of poll and respects the dedupe.
