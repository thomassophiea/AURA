# AURA Integration — stale data, Gateway load, Energy readiness

**Date:** 2026-10-08 · **Environment:** Integration (`integration.up.railway.app`) · **Gateway:** VE6120 `192.168.100.12` / `tsophiea.ddns.net`

## Verdict

The dashboard was stale because **AURA was overloading the Gateway, and its own freshness bookkeeping amplified it**. All causes are fixed on `main` and verified live on Integration.

## Measured before

| Symptom | Measurement |
|---|---|
| Operational Insights badge | `Stale` (source last-success age 536 s vs 180 s threshold) |
| SLE collection cadence | 28 runs in 2 h (target 120) — one per ~4.3 min |
| Venue report (`/v3/sites/{id}/report/venue`) | 14–31 s per site; PrimarySite 500 at 31.0 s; 5 of 7 sites `NoData` |
| Per-AP report (`/v1/report/aps/{serial}`) | ~18 s per AP × 18 APs, against a **15 s** client timeout |
| Client collector (flex MuTable) | 28/28 runs failed (Gateway's 31 s flex timeout), fired every 60 s |
| `/v1/stations` latency | 12.7 s (was 3.7 s on 2026-09-16) |
| `/health` | 503 — cleanup "behind" (21-day window vs 7-day retention) |
| Operational Insights load | 15–30 s; first `/v1/stations` aborted at exactly 6.0 s |

## Root causes

1. **Serial collector tick.** SLE, site reports, AP reports and clients ran one after another in one 60 s tick; the tick skipped while a 3–6 min report pass ran, so source freshness lagged by minutes.
2. **Report timeout below Gateway latency.** 15 s budget vs 18–31 s responses → aborted after the Gateway did the work, nothing stored, re-fired next tick. Two collectors (Integration + Production) did this against one Gateway.
3. **No back-off per scope.** A deterministically failing site / flex read was re-asked every minute.
4. **Wasted reads.** Venue reports for sites with no APs; AP reports for APs not in service.
5. **In-flight dedupe inherited the shortest timeout.** A 6 s `/v1/stations` call shared its abort with every 30 s caller that joined it.
6. **Frontend.** Refresh did not refetch headline tiles (frozen live window); `ConnectionState` reported "Data stale/Disconnected" from idle time; `lastUpdate` advanced on failed fetches; 401s on stations/services/reports were suppressed without token refresh; caches not keyed by controller.
7. **Retention.** 16,549 rows from 09-17…09-30 carried a legacy 30-day `expires_at`.

## Fixes (commits on `main`)

| Commit | Change |
|---|---|
| `35289c1c` | Collector families with independent loops/locks: core SLE (60 s), clients (300 s), reports (900 s). `MONITORING_REPORT_TIMEOUT_SECONDS` = 45 s. Per-scope circuit breaker (5 min → 1 h, jittered). Skip AP-less sites and non-InService APs. |
| `f1941aa5`…`17eb8293` | 401 refresh-and-retry everywhere with single-flight refresh; Retry-After-aware 429; controller-scoped caches; `no-store`; ConnectionState from request outcomes; Refresh advances the live window; good data kept on failure; tab-return refresh (no idle timers). |
| `fc7d94de`, `1b2ee189` | Energy: measured `energy_ap_state` power is primary (ap_report fallback, provenance labelled); error/empty states; truthful activation counts + confirm dialogs; crash-safe rollback marker; single-flight trigger guard; local-time scenarios; sensor endpoint auth. |
| `baf736db` | Energy pair follows Gateway site renames by id (EAL-PT-N/S → EAL-PT-B/A on 10-06). |
| `71ab79af` | In-flight GET joins extend the deadline; stations reads use the 20 s budget. |
| ops | Integration DB: 16,549 legacy rows restamped to 7-day expiry, 23,066 swept. `LIGHT_SENSOR_TOKEN` set on Integration. |

## Measured after (Integration)

| Check | Result |
|---|---|
| `/health` | `ok`, `failing: []` |
| Source freshness | `fresh`, last-success age 20–55 s across samples |
| SLE cadence | every 60 s, ~1.1 s per run |
| AP report | succeeded (1,022 / 126 rows) — previously partial/empty |
| Flex probing | one probe per breaker window instead of every minute |
| Browser: OI badge | `fresh · Stored` |
| Browser: idle 70 s | no "Data stale"/"Disconnected", no timer polling |
| Browser: Refresh | 11 requests, all 200, window aggregates included |
| Energy | Source "Measured AP power"; draw 89 W = live 88.6 W across 7 in-service APs; pair shows EAL-PT-B vs EAL-PT-A |
| `/api/light-sensor/report` without token | 401 |
| Unit tests | 5,544 passed, 0 failed |

## Open — owner decisions / lab state

1. **EAL demo APs are offline.** The 10 `EAL-PT-A/B-Floor*` AP5022s were online (~12.5 W each) until **2026-10-07 17:14 UTC** and are now `critical`, 0 W. The two original demo APs were moved to site `EAL` on 10-06 by Gateway user `full`. The Treatment/Control experiment has **no live APs** until the floor APs return or the pair is re-pointed. Nothing in AURA can fix this.
2. **Demo projection is labelled "Measured".** When the demo light-bulb fallback is used, simulated savings render as measured (`EnergyExperimentPanel.tsx`, `ExperimentComparisonChart.tsx`, `ExperimentApTable.tsx`). Left unchanged as a deliberate earlier decision; presenting it to customers as measurement is a misrepresentation risk.
3. **Production Demo still runs the old collector** against the same Gateway. It receives these fixes only via the AURA-QA → AURA-Release promotion gate.
4. **PrimarySite venue report** 500s at 31 s on the Gateway itself (flex/Langley defect, see vault). Breaker contains it; Gateway-side fix needed.
