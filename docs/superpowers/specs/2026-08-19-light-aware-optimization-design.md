# Light-Aware Optimization — Design Spec

**Date:** 2026-08-19
**Internal project:** Green AP — Light-Aware Optimization (extends Energy Optimization / Green AP Phase 3)
**Customer-facing name:** Light-Aware Optimization
**Target environment:** AURA Integration
**Do NOT deploy to:** Production Demo

---

## 1. Problem

The Energy Optimization page turns real AP power telemetry into fleet/site/financial
intelligence. It does not yet use the ambient-light side-channel that already flows
into AURA. Some Wi-Fi 7 APs carry an onboard ambient-light sensor (JSA-1141). Their
`lightguard` agents already POST state to AURA. That signal is currently used only to
render a sun/moon column on the AP list. This feature turns ambient light into an
**energy-optimization trigger**: when a space goes dark or dim for long enough, a
configurable policy identifies eligible energy-saving actions, models the resulting AP
power draw, and feeds those savings into the same optimization engine that drives the
rest of the Energy page.

**The light sensor is a trigger, not the policy.** `dark = radios off` is explicitly
NOT the model. Different customers configure different actions per light state.

---

## 2. Ground Truth (what exists today)

Verified against the codebase, not assumed:

### Ambient-light side-channel (real, but minimal)
- `POST /api/light-sensor/report` (`server.js`) — token-gated via `LIGHT_SENSOR_TOKEN`.
  Body: `{ serial, state, data }`. `state` is coerced to `light` | `dark` | `unknown`;
  `data` is a raw number (lux).
- `GET /api/light-sensor/states` — returns `{ [serial]: { state, data, ts, stale } }`.
- Storage is an **in-memory `Map` (`lightSensorStates`) with a 120s TTL** (`LIGHT_SENSOR_TTL_MS`).
  Beyond 120s a reading is flagged `stale`. **There is no history and no persistence.**
- `AccessPoints.tsx` merges the feed into AP inventory client-side (keyed by serial);
  `AccessPoint` carries `lightState?: 'light' | 'dark' | 'unknown'` and `lightData?: number`.
- Only **two real states** exist today (`light`, `dark`), plus `unknown`.

### Energy module (real, mature)
- Postgres migration `server/db/migrations/0004_energy.sql`: `energy_rate_preferences`,
  `energy_scenarios`, `energy_scenario_results`. Power readings stay in `metric_samples`
  (`metric_family='ap_report'`, `metric_name='power_consumption'`, unit `mW`).
- `server/energy/energyRouter.js` — `/api/energy/*`, auth via `requireControllerScope`.
- `server/energy/scenarioEngine.js` — **simulation-only** replay. The controller exposes
  no per-radio power, so radio effects use a band-ratio model (`SIX_GHZ_BAND_SHARE = 0.25`).
  **Current defect:** effects compound multiplicatively per-sample
  (`watts *= 1 - 0.25; watts *= 1 - 0.20; …`) — this is the live double-counting the
  new resolver fixes (§6).
- `server/energy/energyCalculator.js` — pure kWh/cost/projection math; returns `null`
  (never NaN) on bad input.
- `server/energy/recommendationEngine.js` — derives recommendations from aggregated patterns.
- Frontend: `EnergyOptimization.tsx` + `EnergyOverviewCards`, `EnergySiteRankings`,
  `EnergyApTable`, `EnergyScenarioBuilder`, `EnergyRecommendations`, `EnergyPreferencesPanel`;
  hooks in `useEnergyData.ts`; client `energyService.ts`; types `src/types/energy.ts`;
  currency/rate prefs already applied everywhere.

### Capability detection (ad-hoc today)
- AP-model capability is inferred by string matching in `api.ts`
  (`isSingleBand`/`isTriBand` on `AP505`/`AP4020`/`AP5020`/…). There is **no centralized
  capability registry** and **no sensor-capability concept** beyond "appears in the feed."

### Execution
- The energy module performs **no** live config writes. Scenarios are simulation only.

---

## 3. Design Decisions (resolved with user)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Light history (needed for §11 observed durations, §12 replay) | **Persist now.** Add light sample/transition tables + normalization pipeline. Live panel/policy/modeled savings work immediately; observed-duration and replay panels show "collecting…" until enough data accrues, then light up. |
| 2 | Bright/Dim/Dark/Unknown derivation | **Derive from lux + hysteresis.** Normalize raw `data` (lux) into Bright/Dim/Dark with configurable thresholds + dwell/debounce; fall back to reported `light`/`dark` when lux absent; stale/missing → Unknown. |
| 3 | Live execution this phase | **Model + recommend only. No live writes.** Execution is a labeled provider abstraction with `canExecute=false`; actions render as "modeled / not currently executable." |
| 4 | Scenario math | **Replace multiplicative compounding with one shared resolver** (§6). Touches existing What-if behavior deliberately. |
| 5 | Light persistence location | **New Postgres tables**, not `metric_samples`. |
| 6 | Policy hierarchy (§14) | **Schema allows org→site-group→site→AP; UI is source/site-level only this phase.** |

---

## 4. Architecture: the shared power resolver (the spine)

Every requirement about savings correctness (§9 no double-counting, §8 reuse the
What-if engine, §10 feed page-wide metrics) reduces to one principle:

> Every optimization — What-if toggle or Light-Aware policy — resolves against **one**
> AP-state model that yields **one** optimized-watts value per AP per sample interval.

### `resolveApState(baselineWatts, applicableOptimizations) → optimizedWatts`

Lives in a new `server/energy/powerModel.js`. Given the baseline draw for a sample and
the set of optimizations acting on that AP at that hour, it produces a single resolved
optimized-watts number:

- **Band disables collapse:** 6 GHz-overnight (What-if) and Dark→disable-6 GHz
  (Light-Aware) on the same AP/hour count the 6 GHz band share **once**, not twice.
- **Tx-power reductions reconcile to the deepest single reduction**, not the product:
  Tx −20% after-hours and Dark→Tx −30% resolve to −30%, not −44%.
- **Radio-chain reductions** apply their modeled share once.
- Ordering is deterministic and documented in the module so results are reproducible.

Both `scenarioEngine.js` and the light-aware modeling path call `resolveApState`.
`scenarioEngine.simulatedWattsForSample` is refactored to build an
`applicableOptimizations` list and delegate to the resolver — its current inline
multiplication is removed.

### Optimization descriptor shape

```
{
  kind: 'disableRadio' | 'reduceTxPower' | 'reduceChains' | 'disableWlan' | 'lowPowerProfile',
  band?: '2.4' | '5' | '6',
  reducePercent?: number,        // for reduceTxPower
  source: 'whatif' | 'lightAware',
  reason?: string                // e.g. 'dark-dwell-30m'
}
```

The resolver groups by `kind`/`band` and resolves overlaps within each group before
applying the combined effect to `baselineWatts`.

---

## 5. Trigger abstraction (§17)

`server/energy/lightAware/triggers/`:

- `trigger.js` — documents the minimal interface: a trigger yields, per AP,
  `{ state, since, dwellSeconds, confidence }` where `state` is a normalized enum.
- `ambientLightTrigger.js` — the **only** concrete trigger built this phase. Reads
  normalized light state + dwell from the persistence layer / live feed.

Future triggers (schedule, utilization, occupancy, PoE, AI) are **not** built — the
interface simply doesn't preclude them. Light-Aware is the first environmental trigger,
not a trigger platform. (YAGNI.)

---

## 6. Backend

### 6.1 Migration — `server/db/migrations/0005_light_aware.sql`

Power/lux readings are new (not in `metric_samples`). Three tables:

```sql
-- Raw-ish ambient light samples (retained short-term, rolled up like metric_samples).
CREATE TABLE IF NOT EXISTS light_sensor_samples (
  id                   bigserial PRIMARY KEY,
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  ap_serial            text NOT NULL,
  lux                  double precision,          -- raw `data`; null when only state reported
  reported_state       text,                      -- 'light' | 'dark' | 'unknown' as sent
  normalized_state     text NOT NULL              -- 'bright' | 'dim' | 'dark' | 'unknown'
                         CHECK (normalized_state IN ('bright','dim','dark','unknown')),
  observed_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_light_samples_ap_time
  ON light_sensor_samples (monitored_source_id, ap_serial, observed_at DESC);

-- Committed (debounced) state transitions — powers observed-durations & replay.
CREATE TABLE IF NOT EXISTS light_state_transitions (
  id                   bigserial PRIMARY KEY,
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  ap_serial            text NOT NULL,
  from_state           text,
  to_state             text NOT NULL
                         CHECK (to_state IN ('bright','dim','dark','unknown')),
  entered_at           timestamptz NOT NULL,
  dwell_seconds        integer                    -- filled when the NEXT transition closes it
);
CREATE INDEX IF NOT EXISTS idx_light_transitions_ap_time
  ON light_state_transitions (monitored_source_id, ap_serial, entered_at DESC);

-- Light-aware policy documents. Scope columns present for future hierarchy; UI uses
-- source/site level only this phase (null site_id = source-wide default).
CREATE TABLE IF NOT EXISTS light_aware_policies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  site_group_id        text,                      -- reserved for future inheritance
  site_id              text,                      -- null = source default
  ap_serial            text,                      -- reserved for future AP override
  enabled              boolean NOT NULL DEFAULT false,
  policy               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_light_policy_scope
  ON light_aware_policies (monitored_source_id, COALESCE(site_id,''), COALESCE(ap_serial,''));
```

**Policy JSON shape:**

```json
{
  "thresholds": { "brightLux": 200, "darkLux": 10 },
  "hysteresis": { "dimDwellMinutes": 15, "darkDwellMinutes": 30, "restoreDwellMinutes": 5 },
  "dim":  { "actions": [ { "kind": "reduceTxPower", "reducePercent": 20 },
                          { "kind": "reduceChains" } ] },
  "dark": { "actions": [ { "kind": "disableRadio", "band": "6" },
                          { "kind": "reduceTxPower", "reducePercent": 30 },
                          { "kind": "disableWlan", "wlanIds": ["<uuid>"] } ] },
  "protectedWlanIds": ["<uuid>", "<uuid>"],
  "restore": { "toNormal": true }
}
```

### 6.2 Persistence pipeline

`server.js` `POST /api/light-sensor/report` handler is extended: it keeps the in-memory
Map (fast, stale-aware `states` endpoint) **and** calls a new
`server/energy/lightAware/lightIngest.js` that:
1. normalizes `data`/`state` → `bright|dim|dark|unknown` (§6.3),
2. inserts a `light_sensor_samples` row,
3. runs debounce; when a state change survives its dwell, closes the prior
   `light_state_transitions` row (`dwell_seconds`) and opens a new one.

Ingest failures must never break the report endpoint (fire-and-forget with logging),
matching the existing "side-channel is optional" posture.

Retention: `light_sensor_samples` is pruned/rolled up on the same schedule/pattern as
`metric_samples`. `light_state_transitions` is compact and retained longer for history.

### 6.3 Normalization + hysteresis — `lightState.js`

- `normalizeLux(lux, thresholds) → 'bright'|'dim'|'dark'`: `lux >= brightLux → bright`,
  `lux <= darkLux → dark`, between → `dim`. When `lux` is absent, map reported
  `light→bright`, `dark→dark`, else `unknown`.
- Stale (older than TTL) or missing → **`unknown`**. **Unknown is never treated as Dark** (§19).
- Debounce: a candidate state must persist for the configured dwell
  (`dimDwellMinutes`/`darkDwellMinutes`/`restoreDwellMinutes`) before it commits as a
  transition and becomes policy-eligible. Brief fluctuations do not cause churn.

### 6.4 Capability registry — `server/energy/apCapabilities.js` (+ `src/lib/apCapabilities.ts` mirror)

Single source of truth. AP model → capability set:

```
{ ambientLightSensor, radioPowerControl, radioEnableDisable,
  chainControl, wlanEnableDisable, energyProfileControl }
```

- Sensor eligibility derives from **model**, independent of whether the AP currently
  appears in the light feed (§4). "6 APs reporting power telemetry" and "4 APs support
  Light-Aware Optimization" are distinct counts and must be able to differ.
- **Unknown models default to no sensor / conservative capabilities** (safe as new
  Extreme models are added). No scattered model checks — all sensor logic reads this registry.
- Seeded from the known Wi-Fi 7 JSA-1141-bearing models; documented so additions are one edit.

### 6.5 Policy engine — `lightAware/policyEngine.js`

- Given an AP's current normalized state + dwell and its scoped policy, returns the
  **eligible** optimization descriptors (respecting dwell thresholds and capability gating).
- **WLAN safety (§7):** `disableWlan` only ever targets WLAN ids explicitly listed in the
  policy `dark.actions`; any id in `protectedWlanIds` is removed from the action set even
  if listed elsewhere. A light state going dark can never implicitly take down a network.
  Nomenclature enforced: WLAN/Network = configured object (id), SSID = broadcast name.

### 6.6 Action catalog — `lightAware/energyActions.js`

Each action declares `{ kind, capabilityRequired, canModel, canRecommend, canExecute }`.
`canExecute = false` for all actions this phase. The UI renders non-executable actions as
"modeled / not currently executable." The abstraction is what lets execution land later
without reshaping the model/recommend layers (§20 can-model / can-recommend / can-execute).

### 6.7 Endpoints — `server/energy/lightAware/router.js`, mounted under `/api/energy/light-aware/*`

Same `requireControllerScope` auth as `/api/energy/*`.

- `GET /api/energy/light-aware/summary` → sensor-capable count `x/y`, current state
  breakdown `{bright,dim,dark,unknown}`, policy `enabled`, `projectedAnnual { kwh, cost }`.
  Feeds the panel. Uses current prefs (currency/rate).
- `GET /api/energy/light-aware/aps` → drill-down rows
  `{ serial, apName, siteId, model, sensorCapable, lightState, dwellSeconds, policyEnabled,
     currentWatts, optimizedWatts, savingsWatts }`, with filters (§13: sensor-capable,
  sensor-unavailable, bright/dim/dark/unknown, policy-enabled, site, model).
- `GET /api/energy/light-aware/policy` / `PUT` → policy CRUD (source/site scope).
- `GET /api/energy/light-aware/observed` → observed distribution over the selected window
  `{ brightPct, dimPct, darkPct, unknownPct, avgDarkHoursPerDay, confidence }` from
  `light_state_transitions`; confidence banded by observation length (reuse
  `dataQualityForDays`). Returns a "collecting…" flag when history is insufficient.

### 6.8 Historical replay (§8, §12) reuses the scenario engine — no new engine

The existing `POST /api/energy/scenarios` accepts a `lightAware` block in `policy`. When
present, `scenarioEngine` builds light-aware optimization descriptors per sample (using
observed transitions where available, else modeled dwell assumptions) and resolves them
through `resolveApState` alongside any What-if toggles. One engine, one resolver.

### 6.9 Recommendations (§15)

`recommendationEngine.js` gains light-aware recommendation types, emitted **only** when
backed by real observed data (e.g., "N APs support ambient light sensing; M were dark
> X h during the window; estimated opportunity …"). No recommendation without supporting data.

---

## 7. What-if + page-wide integration

- `EnergyScenarioPolicy` (`src/types/energy.ts`) gains a `lightAware` block.
  `EnergyScenarioBuilder` adds a **"Model Light-Aware policy"** toggle. Run scenario routes
  through the shared resolver → no double counting (§8, §9).
- Light-Aware modeled savings use the **same** `energy_rate_preferences` and
  `energyCalculator.js`. Changing USD→EUR or the rate recalculates Light-Aware savings with
  everything else. **No separate rate** anywhere (§10).
- Per-AP model surfaced consistently: Baseline W → Optimized W → Watts Saved →
  Expected Hours in State → kWh Saved → Annual kWh → Annual Cost; aggregated AP → Site → Fleet.

---

## 8. Frontend

Restructure the lower half of `EnergyOptimization.tsx` to the approved layout —
left column: `EnergySiteRankings` → **`LightAwareOptimization`** (the currently-empty slot)
→ `EnergyApTable`; right column: `EnergyScenarioBuilder` → `EnergyRecommendations` →
`EnergyPreferencesPanel`. The six KPI cards are untouched.

New components (each ≤ ~300 lines, Radix primitives, Tailwind only, EP1 design system,
dark-mode aware):

- `src/components/energy/LightAwareOptimization.tsx` — the panel: sensor-capable `x/y`,
  current Bright/Dim/Dark/Unknown counts, policy state, projected annual savings
  (kWh + cost), `Configure` / `View APs`. No hardcoded values — all from `summary`.
- `src/components/energy/LightAwarePolicyDialog.tsx` — Configure experience. **Simple by
  default:** essential Dim/Dark actions first; thresholds, dwell, protected WLANs behind an
  Advanced toggle. (Matches the form-simplicity preference.)
- `src/components/energy/LightAwareApDrawer.tsx` — View APs drill-down table + §13 filters.
- Hooks: `useLightAwareSummary`, `useLightAwareAps`, `useLightAwarePolicy`,
  `useLightAwareObserved` (in `useEnergyData.ts` or a sibling).
- Types extend `src/types/energy.ts`.
- **Measured / Observed / Modeled / Projected** badges (§16) so modeled watt reductions
  are never presented as measured hardware results.

---

## 9. Fail-safe (§19)

Since no live writes occur this phase, fail-safe governs what we **model/recommend** and how
we **normalize**:

- Stale/missing telemetry → Unknown; **Unknown is never Dark**.
- Capability unverifiable → AP excluded from sensor-capable set and from modeled actions.
- Ingest/DB failure → report endpoint still succeeds; failure logged and surfaced in the
  panel's data-quality note where appropriate.
- WLAN disable actions require explicit configuration and honor `protectedWlanIds`.

---

## 10. Testing (TDD)

Unit tests (Vitest, this repo):
- Capability registry (known models, unknown-model safe default, capability independence
  from feed presence).
- Lux normalization + hysteresis (thresholds, dwell/debounce, stale→unknown, lux-absent fallback).
- **Resolved-state power model** with explicit double-count cases:
  6 GHz-overnight + Dark→disable-6 GHz same AP/hour = one band share;
  Tx −20% after-hours + Dark→Tx −30% = −30% (not stacked).
- Policy engine dwell + WLAN protection (protected id never in action set).
- Observed-duration aggregation + confidence banding + "collecting…" flag.
- Endpoints (summary/aps/policy/observed) and hooks.
- Panel render (sensor-capable ≠ reporting counts; Unknown state; empty/collecting states).

End-to-end / browser / schema / environment-isolation validation lives in **AURA-QA**
(`thomassophiea/AURA-Pipeline`) against deployed Integration, per CLAUDE.md — not this repo.

---

## 11. Out of scope (explicit)

- Live config execution (radio/Tx/WLAN writes to the controller).
- Triggers other than ambient light.
- Policy-hierarchy UI (org/site-group/AP override) — schema-only this phase.
- Any change to Production Demo.

---

## Definition of Done

Open the existing Energy Optimization page and Light-Aware Optimization appears in the
lower-left slot under "Sites by energy use." AURA can answer: which APs have light sensors;
what they currently sense; how long spaces are typically dark (once history accrues); what
energy actions could be taken; what those actions do to AP power draw (modeled); kWh and
annual cost saved (in the selected currency/rate); and how that changes the overall Energy
projection. Light-Aware savings flow through the **same** resolver, scenario engine, and
rate model as the rest of the page — not an isolated card. Existing Energy functionality
does not regress. Shipped to Integration.
