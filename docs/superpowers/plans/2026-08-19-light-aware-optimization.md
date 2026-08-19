# Light-Aware Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Light-Aware Optimization to the Energy page — an ambient-light trigger that models AP energy savings and feeds the same resolver, scenario engine, and rate model as the rest of the page.

**Architecture:** A single `resolveApState` power resolver replaces the multiplicative scenario math so What-if and Light-Aware optimizations never double-count. Light samples are normalized (lux → bright/dim/dark/unknown with hysteresis), persisted to new Postgres tables, and analyzed for observed durations and historical replay. Capability detection is centralized. No live config writes this phase — actions are model + recommend only.

**Tech Stack:** Node ESM + Express (`server/energy/`), PostgreSQL (`server/db/pool.js`, filename-ordered migrations via `server/db/migrate.js`), Vitest for both server and frontend, React 19 + TypeScript strict + Tailwind + Radix (`src/components/energy/`).

Spec: `docs/superpowers/specs/2026-08-19-light-aware-optimization-design.md`.

## Global Constraints

- **Do NOT deploy to Production Demo.** Target AURA Integration only.
- **No live config writes** this phase. Every action's `canExecute = false`; UI labels them "modeled / not currently executable".
- **Unknown is never Dark.** Stale (past TTL) or missing telemetry → `unknown`, never `dark`.
- **WLAN safety:** `disableWlan` targets only WLAN ids explicitly listed in policy; any id in `protectedWlanIds` is stripped from the action set. WLAN/Network = configured object (id); SSID = broadcast name — never model an SSID as the config object.
- **No separate electricity rate.** Light-Aware savings use `energy_rate_preferences` + `energyCalculator.js` like the rest of the page.
- **Capability from model, not feed presence.** "APs reporting power" and "APs supporting Light-Aware" are distinct counts.
- **TypeScript strict:** no `any` without a justification comment; interfaces PascalCase; `@/*` → `src/*`.
- **Files ≤ ~300 lines**, Radix primitives for interactive elements, Tailwind utilities only (no inline styles), EP1 design system, dark-mode aware.
- **Modeled share constants** (single source, `server/energy/powerModel.js`): `BAND_SHARE = { '2.4': 0.15, '5': 0.30, '6': 0.25 }`, `CHAIN_SHARE = 0.10`, `WLAN_SHARE = 0.05`, `PROFILE_SHARE = 0.15`, `DEFAULT_TX_PERCENT = 20`, `MAX_REMOVED_SHARE = 0.9`.
- **Pure math returns `null`, never NaN/Infinity** (match `energyCalculator.js`).
- Commit after every task with a conventional-commit message.

---

## File Structure

**Server (new):**
- `server/energy/powerModel.js` — `resolveApState` shared resolver + share constants.
- `server/energy/apCapabilities.js` — model→capability registry.
- `server/energy/lightAware/lightState.js` — lux normalization + hysteresis/debounce.
- `server/energy/lightAware/lightRepository.js` — SQL for samples/transitions/policy/observed.
- `server/energy/lightAware/lightIngest.js` — normalize+persist pipeline for reports.
- `server/energy/lightAware/energyActions.js` — action catalog with capability + executability flags.
- `server/energy/lightAware/policyEngine.js` — eligibility + WLAN safety → optimization descriptors.
- `server/energy/lightAware/triggers/ambientLightTrigger.js` — the one concrete trigger.
- `server/energy/lightAware/router.js` — `/api/energy/light-aware/*`.
- `server/db/migrations/0005_light_aware.sql` — three tables.

**Server (modified):**
- `server/energy/scenarioEngine.js` — delegate to `resolveApState`; accept `lightAware` block.
- `server/energy/recommendationEngine.js` — add light-aware recommendations.
- `server.js` — wire `lightIngest` into `POST /api/light-sensor/report`; mount light-aware router.

**Frontend (new):**
- `src/lib/apCapabilities.ts` — UI mirror of the capability registry.
- `src/components/energy/LightAwareOptimization.tsx` — the panel.
- `src/components/energy/LightAwarePolicyDialog.tsx` — Configure dialog.
- `src/components/energy/LightAwareApDrawer.tsx` — View APs drill-down.

**Frontend (modified):**
- `src/types/energy.ts` — light-aware types + `lightAware` on `EnergyScenarioPolicy`.
- `src/services/energyService.ts` — light-aware client functions.
- `src/hooks/useEnergyData.ts` — light-aware hooks.
- `src/components/energy/EnergyOptimization.tsx` — insert panel, restructure lower layout.
- `src/components/energy/EnergyScenarioBuilder.tsx` — "Model Light-Aware policy" toggle.

---

## Phase A — Foundational pure modules (no DB)

### Task 1: Shared power resolver

**Files:**
- Create: `server/energy/powerModel.js`
- Test: `server/energy/powerModel.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const BAND_SHARE`, `CHAIN_SHARE`, `WLAN_SHARE`, `PROFILE_SHARE`, `DEFAULT_TX_PERCENT`, `MAX_REMOVED_SHARE`.
  - `export function resolveApState(baselineWatts, optimizations) -> number` where each optimization is `{ kind: 'disableRadio'|'reduceTxPower'|'reduceChains'|'disableWlan'|'lowPowerProfile', band?, reducePercent?, wlanId?, source?, reason? }`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/energy/powerModel.test.js
import { describe, it, expect } from 'vitest';
import { resolveApState } from './powerModel.js';

describe('resolveApState', () => {
  it('returns baseline unchanged with no optimizations', () => {
    expect(resolveApState(20, [])).toBe(20);
  });

  it('removes a single band share once', () => {
    // 6 GHz share 0.25 -> 20 * 0.75
    expect(resolveApState(20, [{ kind: 'disableRadio', band: '6' }])).toBeCloseTo(15, 6);
  });

  it('counts the same band disabled by two sources only once (no double-count)', () => {
    const opts = [
      { kind: 'disableRadio', band: '6', source: 'whatif' },
      { kind: 'disableRadio', band: '6', source: 'lightAware' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(15, 6);
  });

  it('reconciles overlapping Tx reductions to the deepest single percent', () => {
    const opts = [
      { kind: 'reduceTxPower', reducePercent: 20, source: 'whatif' },
      { kind: 'reduceTxPower', reducePercent: 30, source: 'lightAware' },
    ];
    // deepest 30% -> 20 * 0.70, NOT 20 * 0.8 * 0.7
    expect(resolveApState(20, opts)).toBeCloseTo(14, 6);
  });

  it('applies Tx reduction to the draw remaining after band disables', () => {
    const opts = [
      { kind: 'disableRadio', band: '6' }, // -0.25 share
      { kind: 'reduceTxPower', reducePercent: 30 },
    ];
    // remaining = 20*0.75 = 15; then *0.70 = 10.5
    expect(resolveApState(20, opts)).toBeCloseTo(10.5, 6);
  });

  it('counts chain reduction once regardless of source count', () => {
    const opts = [
      { kind: 'reduceChains', source: 'whatif' },
      { kind: 'reduceChains', source: 'lightAware' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(20 * 0.9, 6);
  });

  it('adds one WLAN share per distinct wlanId', () => {
    const opts = [
      { kind: 'disableWlan', wlanId: 'a' },
      { kind: 'disableWlan', wlanId: 'a' },
      { kind: 'disableWlan', wlanId: 'b' },
    ];
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - 0.1), 6); // 2 distinct * 0.05
  });

  it('clamps total removed share at MAX_REMOVED_SHARE', () => {
    const opts = [
      { kind: 'disableRadio', band: '2.4' },
      { kind: 'disableRadio', band: '5' },
      { kind: 'disableRadio', band: '6' },
      { kind: 'reduceChains' },
      { kind: 'lowPowerProfile' },
      { kind: 'disableWlan', wlanId: 'a' },
    ]; // shares sum > 0.9
    expect(resolveApState(20, opts)).toBeCloseTo(20 * (1 - 0.9), 6);
  });

  it('returns 0 for non-finite baseline', () => {
    expect(resolveApState(NaN, [{ kind: 'reduceChains' }])).toBe(0);
    expect(resolveApState(-5, [])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/powerModel.test.js`
Expected: FAIL — `resolveApState` is not defined.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/powerModel.js
/**
 * The single power resolver. Every optimization — from a What-if toggle or a
 * Light-Aware policy — resolves here into ONE optimized-watts number so the same
 * resource can never be counted twice (spec §9). Additive share removal per
 * resource (each band/chain/profile/WLAN counted once), then the deepest single
 * Tx-power reduction applied to the remaining draw.
 */

export const BAND_SHARE = { '2.4': 0.15, '5': 0.3, '6': 0.25 };
export const CHAIN_SHARE = 0.1;
export const WLAN_SHARE = 0.05;
export const PROFILE_SHARE = 0.15;
export const DEFAULT_TX_PERCENT = 20;
export const MAX_REMOVED_SHARE = 0.9;

export function resolveApState(baselineWatts, optimizations = []) {
  if (!Number.isFinite(baselineWatts) || baselineWatts <= 0) return 0;

  const bands = new Set();
  const wlanIds = new Set();
  let chains = false;
  let profile = false;
  let txPercent = 0;

  for (const opt of optimizations) {
    switch (opt?.kind) {
      case 'disableRadio':
        if (opt.band && BAND_SHARE[opt.band] != null) bands.add(opt.band);
        break;
      case 'reduceChains':
        chains = true;
        break;
      case 'lowPowerProfile':
        profile = true;
        break;
      case 'disableWlan':
        if (opt.wlanId != null) wlanIds.add(opt.wlanId);
        break;
      case 'reduceTxPower': {
        const pct = Number.isFinite(opt.reducePercent) ? opt.reducePercent : DEFAULT_TX_PERCENT;
        if (pct > txPercent) txPercent = pct;
        break;
      }
      default:
        break;
    }
  }

  let removed = 0;
  for (const b of bands) removed += BAND_SHARE[b];
  if (chains) removed += CHAIN_SHARE;
  if (profile) removed += PROFILE_SHARE;
  removed += wlanIds.size * WLAN_SHARE;
  removed = Math.min(removed, MAX_REMOVED_SHARE);

  const clampedTx = Math.max(0, Math.min(txPercent, 100));
  return baselineWatts * (1 - removed) * (1 - clampedTx / 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/powerModel.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add server/energy/powerModel.js server/energy/powerModel.test.js
git commit -m "feat(energy): add shared resolveApState power resolver"
```

---

### Task 2: Refactor scenarioEngine onto the resolver

**Files:**
- Modify: `server/energy/scenarioEngine.js`
- Test: `server/energy/scenarioEngine.test.js` (update existing expectations to resolved values)

**Interfaces:**
- Consumes: `resolveApState` from Task 1.
- Produces: `export function optimizationsForSample(sample, policy) -> Array<optimization>` (new, exported for reuse by the light-aware path); `simulatedWattsForSample(sample, policy)` now returns `resolveApState(sample.watts, optimizationsForSample(sample, policy))`. `replayScenario` signature unchanged.

- [ ] **Step 1: Write the failing test** — add to `server/energy/scenarioEngine.test.js`:

```javascript
import { optimizationsForSample, simulatedWattsForSample } from './scenarioEngine.js';

describe('optimizationsForSample', () => {
  it('maps disable6GhzHours to a 6 GHz disableRadio in-window', () => {
    const sample = { watts: 20, observedAt: '2026-08-19T02:00:00Z' };
    const opts = optimizationsForSample(sample, { disable6GhzHours: [2] });
    expect(opts).toEqual([{ kind: 'disableRadio', band: '6', source: 'whatif', reason: 'disable6GhzHours' }]);
  });

  it('maps low-util radios to a 5 GHz disableRadio', () => {
    const sample = { watts: 20, observedAt: '2026-08-19T02:00:00Z', channelUtilization: 2 };
    const opts = optimizationsForSample(sample, { disableLowUtilRadios: true, lowUtilThresholdPercent: 5 });
    expect(opts).toEqual([{ kind: 'disableRadio', band: '5', source: 'whatif', reason: 'lowUtil' }]);
  });

  it('does not double-count 6 GHz when both hour-disable and light-aware dark disable it', () => {
    const sample = { watts: 20, observedAt: '2026-08-19T02:00:00Z' };
    const opts = [
      ...optimizationsForSample(sample, { disable6GhzHours: [2] }),
      { kind: 'disableRadio', band: '6', source: 'lightAware', reason: 'dark' },
    ];
    expect(simulatedWattsForSample(sample, { disable6GhzHours: [2] })).toBeCloseTo(15, 6);
    // resolver collapses the duplicate band
    const { resolveApState } = require('./powerModel.js');
  });
});
```

(Also: update any existing assertions in this file that expected multiplicatively-stacked values — the low-util share moved 0.25→0.30 and stacked cases now resolve additively. Recompute expected numbers from `resolveApState`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/scenarioEngine.test.js`
Expected: FAIL — `optimizationsForSample` not exported.

- [ ] **Step 3: Write minimal implementation** — replace the body of `simulatedWattsForSample` and add `optimizationsForSample`:

```javascript
import { kwhFromWattSeconds, savingsPercent } from './energyCalculator.js';
import { resolveApState } from './powerModel.js';

function hourOfDayUTC(iso) {
  return new Date(iso).getUTCHours();
}

function isAfterHours(hour, start, end) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** Translate a What-if policy into resolver optimization descriptors for one sample. */
export function optimizationsForSample(sample, policy = {}) {
  const opts = [];
  if (!Number.isFinite(sample.watts)) return opts;
  const hour = hourOfDayUTC(sample.observedAt);

  if (Array.isArray(policy.disable6GhzHours) && policy.disable6GhzHours.includes(hour)) {
    opts.push({ kind: 'disableRadio', band: '6', source: 'whatif', reason: 'disable6GhzHours' });
  }
  if (
    policy.disableLowUtilRadios &&
    Number.isFinite(sample.channelUtilization) &&
    sample.channelUtilization < (policy.lowUtilThresholdPercent ?? 5)
  ) {
    opts.push({ kind: 'disableRadio', band: '5', source: 'whatif', reason: 'lowUtil' });
  }
  if (policy.reduceTxPower && isAfterHours(hour, policy.afterHoursStart ?? 22, policy.afterHoursEnd ?? 6)) {
    const reducePercent = Number.isFinite(policy.reducePercent) ? policy.reducePercent : 20;
    opts.push({ kind: 'reduceTxPower', reducePercent, source: 'whatif', reason: 'afterHours' });
  }
  return opts;
}

export function simulatedWattsForSample(sample, policy = {}) {
  if (!Number.isFinite(sample.watts)) return 0;
  return resolveApState(sample.watts, optimizationsForSample(sample, policy));
}
```

Keep `replayScenario` and `SIX_GHZ_BAND_SHARE` export as-is (leave the const for any external importer; the resolver now owns the math).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/scenarioEngine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/scenarioEngine.js server/energy/scenarioEngine.test.js
git commit -m "refactor(energy): route scenario replay through resolveApState"
```

---

### Task 3: AP capability registry (server)

**Files:**
- Create: `server/energy/apCapabilities.js`
- Test: `server/energy/apCapabilities.test.js`

**Interfaces:**
- Produces:
  - `export function capabilitiesForModel(model) -> { ambientLightSensor, radioPowerControl, radioEnableDisable, chainControl, wlanEnableDisable, energyProfileControl }` (all booleans).
  - `export function supportsLightSensor(model) -> boolean`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/energy/apCapabilities.test.js
import { describe, it, expect } from 'vitest';
import { capabilitiesForModel, supportsLightSensor } from './apCapabilities.js';

describe('capabilitiesForModel', () => {
  it('flags ambient light sensor on Wi-Fi 7 JSA-1141 models', () => {
    expect(supportsLightSensor('AP5020')).toBe(true);
    expect(capabilitiesForModel('AP5020').ambientLightSensor).toBe(true);
  });

  it('matches case-insensitively and on descriptive strings', () => {
    expect(supportsLightSensor('ap5020')).toBe(true);
    expect(supportsLightSensor('Extreme AP5020 Wi-Fi 7')).toBe(true);
  });

  it('does not flag older models without the sensor', () => {
    expect(supportsLightSensor('AP4020X')).toBe(false);
    expect(supportsLightSensor('AP505')).toBe(false);
  });

  it('defaults unknown models to no sensor and conservative capabilities', () => {
    const caps = capabilitiesForModel('SomeFutureAP9999');
    expect(caps.ambientLightSensor).toBe(false);
    expect(caps.radioEnableDisable).toBe(false);
  });

  it('handles null/empty model safely', () => {
    expect(supportsLightSensor(null)).toBe(false);
    expect(supportsLightSensor('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/apCapabilities.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/apCapabilities.js
/**
 * Single source of truth for AP hardware capabilities (spec §4). Sensor
 * eligibility derives from the AP MODEL, never from whether the AP currently
 * appears in the light feed. Unknown models default to no sensor / conservative
 * capabilities so adding a new Extreme model can never silently enable actions.
 *
 * SENSOR_MODELS: Wi-Fi 7 models carrying the onboard JSA-1141 ambient light
 * sensor. Add new models here — the only edit needed to support them.
 */

const SENSOR_MODELS = ['AP5020', 'AP5050']; // Wi-Fi 7, JSA-1141

const CAPABLE_DEFAULTS = {
  ambientLightSensor: false,
  radioPowerControl: false,
  radioEnableDisable: false,
  chainControl: false,
  wlanEnableDisable: false,
  energyProfileControl: false,
};

function normalize(model) {
  return typeof model === 'string' ? model.toUpperCase() : '';
}

export function supportsLightSensor(model) {
  const m = normalize(model);
  return SENSOR_MODELS.some((s) => m.includes(s));
}

export function capabilitiesForModel(model) {
  const m = normalize(model);
  const hasSensor = supportsLightSensor(model);
  // Wi-Fi 7 sensor-bearing models also expose the radio/WLAN/profile controls we
  // model against. Everything else stays at conservative defaults.
  if (hasSensor) {
    return {
      ambientLightSensor: true,
      radioPowerControl: true,
      radioEnableDisable: true,
      chainControl: true,
      wlanEnableDisable: true,
      energyProfileControl: true,
    };
  }
  // Tri-band non-sensor models still support radio enable/disable + Tx control.
  const triBand = ['AP4000', 'AP4020', 'AP5010'].some((s) => m.includes(s));
  return {
    ...CAPABLE_DEFAULTS,
    radioPowerControl: triBand,
    radioEnableDisable: triBand,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/apCapabilities.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/apCapabilities.js server/energy/apCapabilities.test.js
git commit -m "feat(energy): add centralized AP capability registry"
```

---

### Task 4: Lux normalization + hysteresis

**Files:**
- Create: `server/energy/lightAware/lightState.js`
- Test: `server/energy/lightAware/lightState.test.js`

**Interfaces:**
- Produces:
  - `export const DEFAULT_THRESHOLDS = { brightLux: 200, darkLux: 10 }`.
  - `export const DEFAULT_HYSTERESIS = { dimDwellMinutes: 15, darkDwellMinutes: 30, restoreDwellMinutes: 5 }`.
  - `export function normalizeLux(lux, reportedState, thresholds) -> 'bright'|'dim'|'dark'|'unknown'`.
  - `export function commitTransition(prev, candidate, dwellSeconds, hysteresis) -> { state, committed }` — pure debounce decision, where `prev = { state, since }`, `candidate` is the freshly normalized state.

- [ ] **Step 1: Write the failing test**

```javascript
// server/energy/lightAware/lightState.test.js
import { describe, it, expect } from 'vitest';
import { normalizeLux, commitTransition, DEFAULT_THRESHOLDS, DEFAULT_HYSTERESIS } from './lightState.js';

describe('normalizeLux', () => {
  it('classifies by lux thresholds', () => {
    expect(normalizeLux(500, null, DEFAULT_THRESHOLDS)).toBe('bright');
    expect(normalizeLux(50, null, DEFAULT_THRESHOLDS)).toBe('dim');
    expect(normalizeLux(2, null, DEFAULT_THRESHOLDS)).toBe('dark');
  });

  it('falls back to reported state when lux is absent', () => {
    expect(normalizeLux(null, 'light', DEFAULT_THRESHOLDS)).toBe('bright');
    expect(normalizeLux(undefined, 'dark', DEFAULT_THRESHOLDS)).toBe('dark');
  });

  it('is unknown when neither lux nor a usable reported state exists', () => {
    expect(normalizeLux(null, 'unknown', DEFAULT_THRESHOLDS)).toBe('unknown');
    expect(normalizeLux(null, null, DEFAULT_THRESHOLDS)).toBe('unknown');
  });
});

describe('commitTransition', () => {
  it('keeps the previous state until the candidate survives its dwell', () => {
    const prev = { state: 'bright', since: 0 };
    const res = commitTransition(prev, 'dark', 60, DEFAULT_HYSTERESIS); // 1 min < 30 min
    expect(res).toEqual({ state: 'bright', committed: false });
  });

  it('commits dark once the dark dwell elapses', () => {
    const prev = { state: 'bright', since: 0 };
    const res = commitTransition(prev, 'dark', 30 * 60, DEFAULT_HYSTERESIS);
    expect(res).toEqual({ state: 'dark', committed: true });
  });

  it('uses restore dwell when returning toward bright', () => {
    const prev = { state: 'dark', since: 0 };
    expect(commitTransition(prev, 'bright', 60, DEFAULT_HYSTERESIS)).toEqual({ state: 'dark', committed: false });
    expect(commitTransition(prev, 'bright', 5 * 60, DEFAULT_HYSTERESIS)).toEqual({ state: 'bright', committed: true });
  });

  it('never treats unknown as a committed dark', () => {
    const prev = { state: 'bright', since: 0 };
    expect(commitTransition(prev, 'unknown', 999999, DEFAULT_HYSTERESIS)).toEqual({ state: 'unknown', committed: true });
  });

  it('no-op when candidate equals current state', () => {
    const prev = { state: 'dim', since: 0 };
    expect(commitTransition(prev, 'dim', 999, DEFAULT_HYSTERESIS)).toEqual({ state: 'dim', committed: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/lightAware/lightState.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/lightAware/lightState.js
/**
 * Normalize raw ambient-light telemetry into bright/dim/dark/unknown and debounce
 * transitions so brief fluctuations do not cause config churn (spec §5).
 * Unknown is never coerced to dark.
 */

export const DEFAULT_THRESHOLDS = { brightLux: 200, darkLux: 10 };
export const DEFAULT_HYSTERESIS = {
  dimDwellMinutes: 15,
  darkDwellMinutes: 30,
  restoreDwellMinutes: 5,
};

const ORDER = { dark: 0, dim: 1, bright: 2 };

export function normalizeLux(lux, reportedState, thresholds = DEFAULT_THRESHOLDS) {
  if (Number.isFinite(lux)) {
    if (lux >= thresholds.brightLux) return 'bright';
    if (lux <= thresholds.darkLux) return 'dark';
    return 'dim';
  }
  if (reportedState === 'light') return 'bright';
  if (reportedState === 'dark') return 'dark';
  return 'unknown';
}

/** Required dwell (seconds) for a candidate given the current state. */
function requiredDwellSeconds(prevState, candidate, h) {
  if (candidate === 'unknown') return 0; // fail-safe: surface loss of signal immediately
  if (candidate === 'dark') return (h.darkDwellMinutes ?? 30) * 60;
  if (candidate === 'dim') return (h.dimDwellMinutes ?? 15) * 60;
  // moving toward more light (bright) or lateral up
  if (ORDER[candidate] > ORDER[prevState]) return (h.restoreDwellMinutes ?? 5) * 60;
  return (h.dimDwellMinutes ?? 15) * 60;
}

export function commitTransition(prev, candidate, dwellSeconds, hysteresis = DEFAULT_HYSTERESIS) {
  if (candidate === prev.state) return { state: prev.state, committed: false };
  const need = requiredDwellSeconds(prev.state, candidate, hysteresis);
  if (dwellSeconds >= need) return { state: candidate, committed: true };
  return { state: prev.state, committed: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/lightAware/lightState.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/lightAware/lightState.js server/energy/lightAware/lightState.test.js
git commit -m "feat(energy): add lux normalization and transition hysteresis"
```

---

## Phase B — Persistence

### Task 5: Migration for light-aware tables

**Files:**
- Create: `server/db/migrations/0005_light_aware.sql`
- Test: `server/db/migrations/0005_light_aware.test.js` (runs against a configured test DB; skips when unconfigured — follow the pattern in `server/energy/energyRepository.db.test.js`)

**Interfaces:**
- Produces tables: `light_sensor_samples`, `light_state_transitions`, `light_aware_policies` (columns per spec §6.1).

- [ ] **Step 1: Write the failing test**

```javascript
// server/db/migrations/0005_light_aware.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { isDatabaseConfigured, query } from '../pool.js';

const maybe = isDatabaseConfigured() ? describe : describe.skip;

maybe('0005_light_aware tables', () => {
  it('has the three light-aware tables with expected columns', async () => {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('light_sensor_samples','light_state_transitions','light_aware_policies')`
    );
    const names = rows.map((r) => r.table_name).sort();
    expect(names).toEqual(['light_aware_policies', 'light_sensor_samples', 'light_state_transitions']);
  });

  it('enforces normalized_state check constraint', async () => {
    await expect(
      query(
        `INSERT INTO light_sensor_samples (monitored_source_id, ap_serial, normalized_state)
         VALUES (gen_random_uuid(), 'X', 'purple')`
      )
    ).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/db/migrations/0005_light_aware.test.js`
Expected: FAIL (tables missing) — or SKIP if no DB. If skipped, verify against a local Postgres before proceeding.

- [ ] **Step 3: Write the migration** — exact SQL from spec §6.1:

```sql
-- server/db/migrations/0005_light_aware.sql
CREATE TABLE IF NOT EXISTS light_sensor_samples (
  id                   bigserial PRIMARY KEY,
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  ap_serial            text NOT NULL,
  lux                  double precision,
  reported_state       text,
  normalized_state     text NOT NULL
                         CHECK (normalized_state IN ('bright','dim','dark','unknown')),
  observed_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_light_samples_ap_time
  ON light_sensor_samples (monitored_source_id, ap_serial, observed_at DESC);

CREATE TABLE IF NOT EXISTS light_state_transitions (
  id                   bigserial PRIMARY KEY,
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  ap_serial            text NOT NULL,
  from_state           text,
  to_state             text NOT NULL
                         CHECK (to_state IN ('bright','dim','dark','unknown')),
  entered_at           timestamptz NOT NULL,
  dwell_seconds        integer
);
CREATE INDEX IF NOT EXISTS idx_light_transitions_ap_time
  ON light_state_transitions (monitored_source_id, ap_serial, entered_at DESC);

CREATE TABLE IF NOT EXISTS light_aware_policies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  site_group_id        text,
  site_id              text,
  ap_serial            text,
  enabled              boolean NOT NULL DEFAULT false,
  policy               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_light_policy_scope
  ON light_aware_policies (monitored_source_id, COALESCE(site_id,''), COALESCE(ap_serial,''));
```

- [ ] **Step 4: Apply and verify**

Run: `npm run migrate && npx vitest run server/db/migrations/0005_light_aware.test.js`
Expected: PASS (or SKIP without DB, tables confirmed manually).

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/0005_light_aware.sql server/db/migrations/0005_light_aware.test.js
git commit -m "feat(energy): add light-aware Postgres schema (migration 0005)"
```

---

### Task 6: Light repository

**Files:**
- Create: `server/energy/lightAware/lightRepository.js`
- Test: `server/energy/lightAware/lightRepository.db.test.js` (DB-gated like Task 5)

**Interfaces:**
- Consumes: `query`, `withTransaction` from `server/db/pool.js`.
- Produces:
  - `insertSample({ sourceId, apSerial, lux, reportedState, normalizedState, observedAt })`
  - `getOpenTransition({ sourceId, apSerial })` → latest row with `dwell_seconds IS NULL` or null.
  - `closeAndOpenTransition({ sourceId, apSerial, fromState, toState, enteredAt })` → closes the open row (sets `dwell_seconds`) and inserts a new open one, in one transaction.
  - `getObservedDistribution({ sourceId, siteId, start, end })` → `{ brightSeconds, dimSeconds, darkSeconds, unknownSeconds, days }`.
  - `getPolicy({ sourceId, siteId })` → row or null (site match first, then source default with `site_id IS NULL`).
  - `upsertPolicy({ sourceId, siteId, enabled, policy })` → saved row.

- [ ] **Step 1: Write the failing test** — DB-gated; insert samples/transitions and assert round-trips:

```javascript
// server/energy/lightAware/lightRepository.db.test.js
import { describe, it, expect } from 'vitest';
import { isDatabaseConfigured, query } from '../../db/pool.js';
import * as repo from './lightRepository.js';

const maybe = isDatabaseConfigured() ? describe : describe.skip;

maybe('lightRepository', () => {
  it('upserts and reads back a policy scoped to source default', async () => {
    const { rows } = await query('SELECT id FROM monitored_sources LIMIT 1');
    const sourceId = rows[0].id;
    const saved = await repo.upsertPolicy({ sourceId, siteId: null, enabled: true, policy: { dark: { actions: [] } } });
    expect(saved.enabled).toBe(true);
    const got = await repo.getPolicy({ sourceId, siteId: null });
    expect(got.enabled).toBe(true);
  });

  it('closes an open transition and opens a new one with dwell filled', async () => {
    const { rows } = await query('SELECT id FROM monitored_sources LIMIT 1');
    const sourceId = rows[0].id;
    await repo.closeAndOpenTransition({ sourceId, apSerial: 'T1', fromState: null, toState: 'bright', enteredAt: '2026-08-19T00:00:00Z' });
    await repo.closeAndOpenTransition({ sourceId, apSerial: 'T1', fromState: 'bright', toState: 'dark', enteredAt: '2026-08-19T01:00:00Z' });
    const open = await repo.getOpenTransition({ sourceId, apSerial: 'T1' });
    expect(open.to_state).toBe('dark');
    expect(open.dwell_seconds).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/lightAware/lightRepository.db.test.js`
Expected: FAIL — module not found (or SKIP without DB).

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/lightAware/lightRepository.js
/** SQL for light samples, transitions, observed distribution, and policies. */
import { query, withTransaction } from '../../db/pool.js';

export async function insertSample({ sourceId, apSerial, lux, reportedState, normalizedState, observedAt }) {
  await query(
    `INSERT INTO light_sensor_samples
       (monitored_source_id, ap_serial, lux, reported_state, normalized_state, observed_at)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now()))`,
    [sourceId, apSerial, Number.isFinite(lux) ? lux : null, reportedState ?? null, normalizedState, observedAt ?? null]
  );
}

export async function getOpenTransition({ sourceId, apSerial }) {
  const { rows } = await query(
    `SELECT * FROM light_state_transitions
     WHERE monitored_source_id = $1 AND ap_serial = $2 AND dwell_seconds IS NULL
     ORDER BY entered_at DESC LIMIT 1`,
    [sourceId, apSerial]
  );
  return rows[0] ?? null;
}

export async function closeAndOpenTransition({ sourceId, apSerial, fromState, toState, enteredAt }) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE light_state_transitions
         SET dwell_seconds = GREATEST(0, EXTRACT(EPOCH FROM ($4::timestamptz - entered_at))::int)
       WHERE monitored_source_id = $1 AND ap_serial = $2 AND dwell_seconds IS NULL`,
      [sourceId, apSerial, null, enteredAt]
    );
    await client.query(
      `INSERT INTO light_state_transitions
         (monitored_source_id, ap_serial, from_state, to_state, entered_at)
       VALUES ($1,$2,$3,$4,$5::timestamptz)`,
      [sourceId, apSerial, fromState ?? null, toState, enteredAt]
    );
  });
}

export async function getObservedDistribution({ sourceId, siteId, start, end }) {
  // Sum dwell per state for closed transitions within the window.
  const { rows } = await query(
    `SELECT to_state, COALESCE(SUM(dwell_seconds),0)::bigint AS secs
     FROM light_state_transitions
     WHERE monitored_source_id = $1
       AND entered_at >= $2::timestamptz AND entered_at < $3::timestamptz
       AND dwell_seconds IS NOT NULL
       ${siteId ? 'AND ap_serial IN (SELECT DISTINCT device_external_id FROM metric_samples WHERE site_id = $4)' : ''}
     GROUP BY to_state`,
    siteId ? [sourceId, start, end, siteId] : [sourceId, start, end]
  );
  const by = { bright: 0, dim: 0, dark: 0, unknown: 0 };
  for (const r of rows) by[r.to_state] = Number(r.secs);
  const days = Math.max((new Date(end) - new Date(start)) / 86_400_000, 0);
  return { brightSeconds: by.bright, dimSeconds: by.dim, darkSeconds: by.dark, unknownSeconds: by.unknown, days };
}

export async function getPolicy({ sourceId, siteId }) {
  if (siteId) {
    const { rows } = await query(
      `SELECT * FROM light_aware_policies WHERE monitored_source_id=$1 AND site_id=$2 AND ap_serial IS NULL LIMIT 1`,
      [sourceId, siteId]
    );
    if (rows[0]) return rows[0];
  }
  const { rows } = await query(
    `SELECT * FROM light_aware_policies WHERE monitored_source_id=$1 AND site_id IS NULL AND ap_serial IS NULL LIMIT 1`,
    [sourceId]
  );
  return rows[0] ?? null;
}

export async function upsertPolicy({ sourceId, siteId, enabled, policy }) {
  const { rows } = await query(
    `INSERT INTO light_aware_policies (monitored_source_id, site_id, enabled, policy, updated_at)
     VALUES ($1,$2,$3,$4::jsonb, now())
     ON CONFLICT (monitored_source_id, COALESCE(site_id,''), COALESCE(ap_serial,''))
     DO UPDATE SET enabled = EXCLUDED.enabled, policy = EXCLUDED.policy, updated_at = now()
     RETURNING *`,
    [sourceId, siteId ?? null, !!enabled, JSON.stringify(policy ?? {})]
  );
  return rows[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/lightAware/lightRepository.db.test.js`
Expected: PASS (or SKIP without DB; verify against local Postgres).

- [ ] **Step 5: Commit**

```bash
git add server/energy/lightAware/lightRepository.js server/energy/lightAware/lightRepository.db.test.js
git commit -m "feat(energy): add light-aware repository (samples, transitions, policy)"
```

---

### Task 7: Ingest pipeline wired into the report endpoint

**Files:**
- Create: `server/energy/lightAware/lightIngest.js`
- Modify: `server.js` (the `POST /api/light-sensor/report` handler, ~line 887)
- Test: `server/energy/lightAware/lightIngest.test.js`

**Interfaces:**
- Consumes: `normalizeLux`, `commitTransition` (Task 4); repository fns (Task 6, injectable for tests).
- Produces: `export async function ingestLightReport({ sourceId, serial, state, data, at }, deps) -> { normalizedState, committed }`. `deps` defaults to the real repository; tests inject fakes.

- [ ] **Step 1: Write the failing test**

```javascript
// server/energy/lightAware/lightIngest.test.js
import { describe, it, expect, vi } from 'vitest';
import { ingestLightReport } from './lightIngest.js';

function fakeDeps(open) {
  return {
    insertSample: vi.fn().mockResolvedValue(undefined),
    getOpenTransition: vi.fn().mockResolvedValue(open),
    closeAndOpenTransition: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ingestLightReport', () => {
  it('always inserts a sample with the normalized state', async () => {
    const deps = fakeDeps({ to_state: 'bright', entered_at: '2026-08-19T00:00:00Z' });
    await ingestLightReport({ sourceId: 's', serial: 'A', state: 'dark', data: 2, at: '2026-08-19T00:10:00Z' }, deps);
    expect(deps.insertSample).toHaveBeenCalledWith(
      expect.objectContaining({ apSerial: 'A', normalizedState: 'dark' })
    );
  });

  it('does not commit a transition before dwell elapses', async () => {
    const deps = fakeDeps({ to_state: 'bright', entered_at: '2026-08-19T00:00:00Z' });
    const res = await ingestLightReport({ sourceId: 's', serial: 'A', state: 'dark', data: 2, at: '2026-08-19T00:01:00Z' }, deps);
    expect(res.committed).toBe(false);
    expect(deps.closeAndOpenTransition).not.toHaveBeenCalled();
  });

  it('commits a transition once dwell elapses', async () => {
    const deps = fakeDeps({ to_state: 'bright', entered_at: '2026-08-19T00:00:00Z' });
    const res = await ingestLightReport({ sourceId: 's', serial: 'A', state: 'dark', data: 2, at: '2026-08-19T00:31:00Z' }, deps);
    expect(res.committed).toBe(true);
    expect(deps.closeAndOpenTransition).toHaveBeenCalledWith(
      expect.objectContaining({ toState: 'dark', fromState: 'bright' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/lightAware/lightIngest.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/lightAware/lightIngest.js
/**
 * Normalize a light report, persist the sample, and (when the change survives its
 * dwell) commit a transition. Called fire-and-forget from the report endpoint —
 * ingest failures must never break the endpoint (spec §6.2).
 */
import { normalizeLux, commitTransition, DEFAULT_THRESHOLDS, DEFAULT_HYSTERESIS } from './lightState.js';
import * as repo from './lightRepository.js';

export async function ingestLightReport({ sourceId, serial, state, data, at }, deps = repo) {
  const observedAt = at ?? new Date().toISOString();
  const lux = Number.isFinite(Number(data)) ? Number(data) : null;
  const normalizedState = normalizeLux(lux, state, DEFAULT_THRESHOLDS);

  await deps.insertSample({ sourceId, apSerial: serial, lux, reportedState: state ?? null, normalizedState, observedAt });

  const open = await deps.getOpenTransition({ sourceId, apSerial: serial });
  const prevState = open?.to_state ?? 'unknown';
  const since = open?.entered_at ?? observedAt;
  const dwellSeconds = Math.max(0, (new Date(observedAt) - new Date(since)) / 1000);

  const decision = commitTransition({ state: prevState, since }, normalizedState, dwellSeconds, DEFAULT_HYSTERESIS);
  if (decision.committed && decision.state !== prevState) {
    await deps.closeAndOpenTransition({
      sourceId,
      apSerial: serial,
      fromState: prevState === 'unknown' && !open ? null : prevState,
      toState: decision.state,
      enteredAt: observedAt,
    });
    return { normalizedState, committed: true };
  }
  return { normalizedState, committed: false };
}
```

- [ ] **Step 4: Wire into `server.js`** — inside the existing `POST /api/light-sensor/report` handler, after `lightSensorStates.set(...)` and before `res.json({ ok: true })`, add a fire-and-forget ingest. The source id resolves from the report token→source mapping if present, else the single monitored source; guard the whole thing so failures are swallowed:

```javascript
// server.js — add near the other imports at top
import { ingestLightReport } from './server/energy/lightAware/lightIngest.js';
import { getPrimarySourceId } from './server/energy/lightAware/lightIngest.js'; // see note

// inside POST /api/light-sensor/report, before res.json({ ok: true }):
Promise.resolve()
  .then(async () => {
    const sourceId = await resolveLightSourceId(req); // helper below
    if (sourceId) {
      await ingestLightReport({ sourceId, serial: String(serial), state, data });
    }
  })
  .catch((e) => console.warn('[light-ingest] skipped:', e?.message));
```

Add a small `resolveLightSourceId(req)` helper in `server.js` that returns the first configured monitored source id (query `SELECT id FROM monitored_sources ORDER BY created_at LIMIT 1` via the pool, cached), returning `null` when the DB is unconfigured. Do NOT export a `getPrimarySourceId` from lightIngest — remove that speculative import; keep the helper local to `server.js`.

Run: `npx vitest run server/energy/lightAware/lightIngest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/lightAware/lightIngest.js server/energy/lightAware/lightIngest.test.js server.js
git commit -m "feat(energy): persist normalized light samples and transitions on report"
```

---

## Phase C — Actions, policy engine, trigger

### Task 8: Action catalog

**Files:**
- Create: `server/energy/lightAware/energyActions.js`
- Test: `server/energy/lightAware/energyActions.test.js`

**Interfaces:**
- Consumes: capability keys from `apCapabilities.js` (by name only).
- Produces:
  - `export const ACTION_CATALOG` — map of `kind -> { capabilityRequired, canModel, canRecommend, canExecute, label }`.
  - `export function isActionAllowed(action, capabilities) -> boolean` (capability gate).

- [ ] **Step 1: Write the failing test**

```javascript
// server/energy/lightAware/energyActions.test.js
import { describe, it, expect } from 'vitest';
import { ACTION_CATALOG, isActionAllowed } from './energyActions.js';

describe('ACTION_CATALOG', () => {
  it('marks every action non-executable this phase', () => {
    for (const def of Object.values(ACTION_CATALOG)) {
      expect(def.canExecute).toBe(false);
      expect(def.canModel).toBe(true);
    }
  });
});

describe('isActionAllowed', () => {
  const caps = { radioEnableDisable: true, radioPowerControl: false, wlanEnableDisable: false, chainControl: true, energyProfileControl: false };
  it('allows disableRadio when radioEnableDisable is present', () => {
    expect(isActionAllowed({ kind: 'disableRadio', band: '6' }, caps)).toBe(true);
  });
  it('blocks reduceTxPower without radioPowerControl', () => {
    expect(isActionAllowed({ kind: 'reduceTxPower', reducePercent: 20 }, caps)).toBe(false);
  });
  it('blocks disableWlan without wlanEnableDisable', () => {
    expect(isActionAllowed({ kind: 'disableWlan', wlanId: 'x' }, caps)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/lightAware/energyActions.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/lightAware/energyActions.js
/**
 * Catalog of light-aware energy actions. Each declares the capability it needs
 * and its executability tier (spec §20). canExecute is false everywhere this
 * phase — actions are model + recommend only.
 */
export const ACTION_CATALOG = {
  reduceTxPower: { capabilityRequired: 'radioPowerControl', canModel: true, canRecommend: true, canExecute: false, label: 'Reduce Tx power' },
  reduceChains: { capabilityRequired: 'chainControl', canModel: true, canRecommend: true, canExecute: false, label: 'Reduce radio chains' },
  disableRadio: { capabilityRequired: 'radioEnableDisable', canModel: true, canRecommend: true, canExecute: false, label: 'Disable radio' },
  disableWlan: { capabilityRequired: 'wlanEnableDisable', canModel: true, canRecommend: true, canExecute: false, label: 'Disable WLAN' },
  lowPowerProfile: { capabilityRequired: 'energyProfileControl', canModel: true, canRecommend: true, canExecute: false, label: 'Apply low-power profile' },
};

export function isActionAllowed(action, capabilities = {}) {
  const def = ACTION_CATALOG[action?.kind];
  if (!def) return false;
  return !!capabilities[def.capabilityRequired];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/lightAware/energyActions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/lightAware/energyActions.js server/energy/lightAware/energyActions.test.js
git commit -m "feat(energy): add light-aware action catalog with capability gating"
```

---

### Task 9: Policy engine (eligibility + WLAN safety)

**Files:**
- Create: `server/energy/lightAware/policyEngine.js`
- Test: `server/energy/lightAware/policyEngine.test.js`

**Interfaces:**
- Consumes: `isActionAllowed` (Task 8).
- Produces: `export function eligibleOptimizations({ state, capabilities, policy }) -> Array<optimization>` returning resolver-shaped descriptors with `source: 'lightAware'`. Honors dwell-state selection (dim vs dark actions), capability gating, and `protectedWlanIds` stripping.

- [ ] **Step 1: Write the failing test**

```javascript
// server/energy/lightAware/policyEngine.test.js
import { describe, it, expect } from 'vitest';
import { eligibleOptimizations } from './policyEngine.js';

const fullCaps = {
  radioPowerControl: true, radioEnableDisable: true, chainControl: true,
  wlanEnableDisable: true, energyProfileControl: true,
};

const policy = {
  dim: { actions: [{ kind: 'reduceTxPower', reducePercent: 20 }, { kind: 'reduceChains' }] },
  dark: { actions: [{ kind: 'disableRadio', band: '6' }, { kind: 'reduceTxPower', reducePercent: 30 }, { kind: 'disableWlan', wlanId: 'guest' }] },
  protectedWlanIds: ['iot', 'voice'],
};

describe('eligibleOptimizations', () => {
  it('returns nothing for bright or unknown', () => {
    expect(eligibleOptimizations({ state: 'bright', capabilities: fullCaps, policy })).toEqual([]);
    expect(eligibleOptimizations({ state: 'unknown', capabilities: fullCaps, policy })).toEqual([]);
  });

  it('applies dim actions when state is dim', () => {
    const opts = eligibleOptimizations({ state: 'dim', capabilities: fullCaps, policy });
    expect(opts).toContainEqual(expect.objectContaining({ kind: 'reduceTxPower', reducePercent: 20, source: 'lightAware' }));
    expect(opts).toContainEqual(expect.objectContaining({ kind: 'reduceChains', source: 'lightAware' }));
  });

  it('applies dark actions when state is dark', () => {
    const opts = eligibleOptimizations({ state: 'dark', capabilities: fullCaps, policy });
    expect(opts).toContainEqual(expect.objectContaining({ kind: 'disableRadio', band: '6' }));
  });

  it('never disables a protected WLAN even if listed in dark actions', () => {
    const p = { ...policy, dark: { actions: [{ kind: 'disableWlan', wlanId: 'iot' }] } };
    const opts = eligibleOptimizations({ state: 'dark', capabilities: fullCaps, policy: p });
    expect(opts.find((o) => o.kind === 'disableWlan')).toBeUndefined();
  });

  it('drops actions the hardware cannot perform', () => {
    const caps = { ...fullCaps, wlanEnableDisable: false };
    const opts = eligibleOptimizations({ state: 'dark', capabilities: caps, policy });
    expect(opts.find((o) => o.kind === 'disableWlan')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/lightAware/policyEngine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/lightAware/policyEngine.js
/**
 * Turns a committed light state + AP capabilities + policy into resolver-shaped
 * optimization descriptors. Only 'dim' and 'dark' produce actions. WLAN safety:
 * protected WLAN ids are stripped even if a dark action names them (spec §7).
 */
import { isActionAllowed } from './energyActions.js';

export function eligibleOptimizations({ state, capabilities, policy }) {
  if (state !== 'dim' && state !== 'dark') return [];
  const block = policy?.[state];
  if (!block || !Array.isArray(block.actions)) return [];
  const protectedIds = new Set(policy.protectedWlanIds ?? []);

  const out = [];
  for (const action of block.actions) {
    if (action.kind === 'disableWlan' && protectedIds.has(action.wlanId)) continue;
    if (!isActionAllowed(action, capabilities)) continue;
    out.push({ ...action, source: 'lightAware', reason: state });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/lightAware/policyEngine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/lightAware/policyEngine.js server/energy/lightAware/policyEngine.test.js
git commit -m "feat(energy): add light-aware policy engine with WLAN safety"
```

---

### Task 10: Ambient light trigger

**Files:**
- Create: `server/energy/lightAware/triggers/ambientLightTrigger.js`
- Test: `server/energy/lightAware/triggers/ambientLightTrigger.test.js`

**Interfaces:**
- Produces: `export function ambientLightTrigger(apLightRow, now) -> { state, since, dwellSeconds, confidence }`. `apLightRow = { to_state, entered_at }` (open transition) or null. Stale/missing → `{ state: 'unknown', ... confidence: 'low' }`.

- [ ] **Step 1: Write the failing test**

```javascript
// server/energy/lightAware/triggers/ambientLightTrigger.test.js
import { describe, it, expect } from 'vitest';
import { ambientLightTrigger } from './ambientLightTrigger.js';

const NOW = new Date('2026-08-19T02:00:00Z');

describe('ambientLightTrigger', () => {
  it('reports the open transition state and dwell', () => {
    const t = ambientLightTrigger({ to_state: 'dark', entered_at: '2026-08-19T01:00:00Z' }, NOW);
    expect(t.state).toBe('dark');
    expect(t.dwellSeconds).toBe(3600);
    expect(t.confidence).toBe('high');
  });

  it('returns unknown for a missing row', () => {
    const t = ambientLightTrigger(null, NOW);
    expect(t.state).toBe('unknown');
    expect(t.confidence).toBe('low');
  });

  it('never returns dark for a null row', () => {
    expect(ambientLightTrigger(null, NOW).state).not.toBe('dark');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/lightAware/triggers/ambientLightTrigger.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/lightAware/triggers/ambientLightTrigger.js
/**
 * The one concrete environmental trigger this phase (spec §17). Reads an AP's
 * open light-state transition into a normalized trigger signal. Missing signal
 * is 'unknown', never 'dark'.
 */
export function ambientLightTrigger(openTransition, now = new Date()) {
  if (!openTransition || !openTransition.to_state) {
    return { state: 'unknown', since: null, dwellSeconds: 0, confidence: 'low' };
  }
  const since = openTransition.entered_at;
  const dwellSeconds = Math.max(0, Math.round((now - new Date(since)) / 1000));
  return { state: openTransition.to_state, since, dwellSeconds, confidence: 'high' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/lightAware/triggers/ambientLightTrigger.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/lightAware/triggers/ambientLightTrigger.js server/energy/lightAware/triggers/ambientLightTrigger.test.js
git commit -m "feat(energy): add ambient light trigger"
```

---

## Phase D — API + engine integration

### Task 11: Light-aware router (summary, aps, policy, observed)

**Files:**
- Create: `server/energy/lightAware/router.js`
- Modify: `server.js` (mount under `/api`, alongside the energy router ~line 2103)
- Test: `server/energy/lightAware/router.test.js` (supertest with injected fakes, mirroring `energyRouter.test.js`)

**Interfaces:**
- Consumes: repository fns (Task 6), `capabilitiesForModel`/`supportsLightSensor` (Task 3), `eligibleOptimizations` (Task 9), `resolveApState` (Task 1), `ambientLightTrigger` (Task 10), `estimateCost`/`projectAnnual`/`projectDaily` (`energyCalculator.js`), `getRatePreferences` (`energyRepository.js`).
- Produces: `export function createLightAwareRouter(options)` returning an Express router mounting:
  - `GET /energy/light-aware/summary`
  - `GET /energy/light-aware/aps`
  - `GET /energy/light-aware/policy` + `PUT`
  - `GET /energy/light-aware/observed`
  All under `requireControllerScope` (reuse `options.scopeMiddleware` like `energyRouter.js`).

- [ ] **Step 1: Write the failing test** — inject fake deps so no DB is needed:

```javascript
// server/energy/lightAware/router.test.js
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLightAwareRouter } from './router.js';

function appWith(overrides = {}) {
  const app = express();
  const scopeMiddleware = (req, _res, next) => {
    req.monitoringScope = { sources: [{ id: '00000000-0000-0000-0000-000000000001' }] };
    next();
  };
  app.use('/api', createLightAwareRouter({
    scopeMiddleware,
    deps: {
      listApLightStates: async () => [
        { serial: 'A', apName: 'AP-A', model: 'AP5020', siteId: 's1', watts: 20, openTransition: { to_state: 'dark', entered_at: '2026-08-19T00:00:00Z' } },
        { serial: 'B', apName: 'AP-B', model: 'AP4020X', siteId: 's1', watts: 18, openTransition: null },
      ],
      getPolicy: async () => ({ enabled: true, policy: { dark: { actions: [{ kind: 'disableRadio', band: '6' }] } } }),
      upsertPolicy: async (p) => ({ ...p }),
      getObservedDistribution: async () => ({ brightSeconds: 60, dimSeconds: 0, darkSeconds: 40, unknownSeconds: 0, days: 1 }),
      getRatePreferences: async () => ({ currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 }),
      ...overrides,
    },
    nowFn: () => new Date('2026-08-19T02:00:00Z'),
  }));
  return app;
}

describe('GET /energy/light-aware/summary', () => {
  it('counts sensor-capable APs distinctly from reporting APs', async () => {
    const res = await request(appWith()).get('/api/energy/light-aware/summary');
    expect(res.status).toBe(200);
    expect(res.body.sensorCapableCount).toBe(1); // only AP5020
    expect(res.body.reportingCount).toBe(2);
    expect(res.body.stateBreakdown).toEqual(expect.objectContaining({ dark: 1, unknown: 1 }));
  });
});

describe('GET /energy/light-aware/aps', () => {
  it('returns modeled current/optimized watts per AP', async () => {
    const res = await request(appWith()).get('/api/energy/light-aware/aps');
    const a = res.body.aps.find((x) => x.serial === 'A');
    expect(a.sensorCapable).toBe(true);
    expect(a.optimizedWatts).toBeLessThan(a.currentWatts); // dark -> 6GHz disabled
  });
});

describe('PUT /energy/light-aware/policy', () => {
  it('rejects a policy that is not an object', async () => {
    const res = await request(appWith()).put('/api/energy/light-aware/policy').send({ enabled: true, policy: 5 });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/lightAware/router.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/energy/lightAware/router.js
/**
 * /api/energy/light-aware/* — read/model API over persisted light state. Auth
 * reuses requireControllerScope. Mutates no controller config: policies are
 * stored intent; actions are modeled, never executed (spec §20).
 */
import { Router, json as expressJson } from 'express';
import { createRequireControllerScope } from '../../monitoring/requireControllerScope.js';
import { supportsLightSensor, capabilitiesForModel } from '../apCapabilities.js';
import { eligibleOptimizations } from './policyEngine.js';
import { ambientLightTrigger } from './triggers/ambientLightTrigger.js';
import { resolveApState } from '../powerModel.js';
import { projectDaily, projectAnnual, estimateCost } from '../energyCalculator.js';
import * as repo from './lightRepository.js';
import { getRatePreferences } from '../energyRepository.js';
import { listApLightStates as realListApLightStates } from './lightRepository.js';

const STATES = ['bright', 'dim', 'dark', 'unknown'];

export function createLightAwareRouter(options = {}) {
  const {
    scopeMiddleware = createRequireControllerScope({ graceMs: 900000 }),
    nowFn = () => new Date(),
    deps = {},
  } = options;
  const listApLightStates = deps.listApLightStates ?? realListApLightStates;
  const getPolicy = deps.getPolicy ?? repo.getPolicy;
  const upsertPolicy = deps.upsertPolicy ?? repo.upsertPolicy;
  const getObservedDistribution = deps.getObservedDistribution ?? repo.getObservedDistribution;
  const getPrefs = deps.getRatePreferences ?? getRatePreferences;

  const router = Router();
  const jsonBody = expressJson({ limit: '32kb' });
  router.use('/energy/light-aware', scopeMiddleware);

  function sourceId(req) {
    return req.monitoringScope?.sources?.[0]?.id;
  }
  async function prefs(req) {
    return (await getPrefs(sourceId(req))) ?? { currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 };
  }

  // Build per-AP modeled rows from stored state + policy.
  async function buildRows(req) {
    const siteId = req.query.siteId ?? null;
    const rows = await listApLightStates({ sourceId: sourceId(req), siteId });
    const policyRow = (await getPolicy({ sourceId: sourceId(req), siteId })) ?? { enabled: false, policy: {} };
    const now = nowFn();
    return rows.map((r) => {
      const sensorCapable = supportsLightSensor(r.model);
      const caps = capabilitiesForModel(r.model);
      const trigger = ambientLightTrigger(r.openTransition, now);
      const opts = policyRow.enabled && sensorCapable
        ? eligibleOptimizations({ state: trigger.state, capabilities: caps, policy: policyRow.policy })
        : [];
      const optimizedWatts = resolveApState(r.watts, opts);
      return {
        serial: r.serial,
        apName: r.apName,
        siteId: r.siteId,
        model: r.model,
        sensorCapable,
        lightState: trigger.state,
        dwellSeconds: trigger.dwellSeconds,
        policyEnabled: !!policyRow.enabled,
        currentWatts: r.watts,
        optimizedWatts,
        savingsWatts: Math.max(0, r.watts - optimizedWatts),
      };
    });
  }

  router.get('/energy/light-aware/summary', async (req, res) => {
    try {
      const rows = await buildRows(req);
      const p = await prefs(req);
      const stateBreakdown = { bright: 0, dim: 0, dark: 0, unknown: 0 };
      let savingsWatts = 0;
      for (const r of rows) {
        stateBreakdown[r.lightState] = (stateBreakdown[r.lightState] ?? 0) + 1;
        savingsWatts += r.savingsWatts;
      }
      // Watts saved held for a year is a projection, not a measurement.
      const annualKwh = projectAnnual(projectDaily((savingsWatts * 86400) / 3_600_000, 86400));
      res.json({
        sensorCapableCount: rows.filter((r) => r.sensorCapable).length,
        reportingCount: rows.length,
        stateBreakdown,
        policyEnabled: rows.some((r) => r.policyEnabled),
        projectedAnnual: {
          kwh: annualKwh,
          cost: estimateCost(annualKwh ?? 0, p.ratePerKwh),
        },
        currency: p.currencyCode,
        currencySymbol: p.currencySymbol,
      });
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  router.get('/energy/light-aware/aps', async (req, res) => {
    try {
      res.json({ aps: await buildRows(req) });
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  router.get('/energy/light-aware/policy', async (req, res) => {
    try {
      const row = await getPolicy({ sourceId: sourceId(req), siteId: req.query.siteId ?? null });
      res.json(row ?? { enabled: false, policy: {} });
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  router.put('/energy/light-aware/policy', jsonBody, async (req, res) => {
    try {
      const { enabled, policy, siteId } = req.body ?? {};
      if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) {
        return res.status(400).json({ error: 'policy object required', errorClass: 'validation' });
      }
      const saved = await upsertPolicy({ sourceId: sourceId(req), siteId: siteId ?? null, enabled: !!enabled, policy });
      res.json(saved);
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  router.get('/energy/light-aware/observed', async (req, res) => {
    try {
      const dist = await getObservedDistribution({
        sourceId: sourceId(req),
        siteId: req.query.siteId ?? null,
        start: req.query.start,
        end: req.query.end,
      });
      const total = STATES.reduce((s, k) => s + (dist[`${k}Seconds`] ?? 0), 0);
      const pct = (secs) => (total > 0 ? (secs / total) * 100 : null);
      const avgDarkHoursPerDay = dist.days > 0 ? dist.darkSeconds / 3600 / dist.days : null;
      const confidence = dist.days >= 7 ? 'high' : dist.days >= 3 ? 'medium' : 'low';
      res.json({
        brightPct: pct(dist.brightSeconds),
        dimPct: pct(dist.dimSeconds),
        darkPct: pct(dist.darkSeconds),
        unknownPct: pct(dist.unknownSeconds),
        avgDarkHoursPerDay,
        confidence,
        collecting: total === 0,
      });
    } catch (e) {
      res.status(500).json({ error: 'Request failed' });
    }
  });

  return router;
}
```

Add to `server/energy/lightAware/lightRepository.js` a `listApLightStates({ sourceId, siteId })` that joins the latest AP inventory (serial, apName, model, siteId, latest watts from `metric_samples`) with each AP's open transition. Because AP model/name live in the controller payload not Postgres, this query returns rows from `metric_samples` (serial=`device_external_id`, latest `numeric_value/1000` as watts, `site_id`) LEFT JOINed to `light_state_transitions` open rows; `model`/`apName` default to the serial when absent and are enriched client-side. Ship a minimal version returning `{ serial, apName, model, siteId, watts, openTransition }`.

- [ ] **Step 2 (mount): Modify `server.js`** — after the energy router mount (~line 2112), add:

```javascript
import { createLightAwareRouter } from './server/energy/lightAware/router.js'; // top with other imports
// inside the `if (monitoringConfig) {` block, after the energy mount:
app.use('/api', createLightAwareRouter({
  scopeMiddleware: undefined, // uses default requireControllerScope
}));
console.log('[Proxy Server] ✓ Light-Aware API mounted at /api/energy/light-aware/*');
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run server/energy/lightAware/router.test.js`
Expected: PASS.

- [ ] **Step 4: Full server suite sanity**

Run: `npx vitest run server/energy`
Expected: PASS (no regressions in existing energy tests).

- [ ] **Step 5: Commit**

```bash
git add server/energy/lightAware/router.js server/energy/lightAware/lightRepository.js server.js
git commit -m "feat(energy): add light-aware API router (summary/aps/policy/observed)"
```

---

### Task 12: Fold Light-Aware into the scenario engine

**Files:**
- Modify: `server/energy/scenarioEngine.js`
- Modify: `server/energy/energyRouter.js` (`POST /energy/scenarios` accepts `policy.lightAware`)
- Test: `server/energy/scenarioEngine.test.js` (add lightAware cases)

**Interfaces:**
- Consumes: `eligibleOptimizations` (Task 9), `resolveApState` (Task 1), `optimizationsForSample` (Task 2).
- Produces: `replayScenario` uses combined What-if + Light-Aware optimizations per sample through one `resolveApState` call. `simulatedWattsForSample(sample, policy)` where `policy.lightAware = { enabled, actionsByState, capabilitiesBySerial }` merges light-aware descriptors when the sample carries a `lightState`.

- [ ] **Step 1: Write the failing test**

```javascript
describe('replayScenario with lightAware', () => {
  it('does not double-count 6 GHz when whatif overnight and dark-policy both disable it', () => {
    const samples = [
      { deviceExternalId: 'A', watts: 20, observedAt: '2026-08-19T02:00:00Z', lightState: 'dark' },
      { deviceExternalId: 'A', watts: 20, observedAt: '2026-08-19T03:00:00Z', lightState: 'dark' },
    ];
    const policy = {
      disable6GhzHours: [2, 3],
      lightAware: { enabled: true, actionsByState: { dark: [{ kind: 'disableRadio', band: '6' }] } },
    };
    const { simulatedWattsForSample } = require('./scenarioEngine.js');
    // combined resolves to a single 6 GHz disable: 20 * 0.75 = 15
    expect(simulatedWattsForSample(samples[0], policy)).toBeCloseTo(15, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/scenarioEngine.test.js`
Expected: FAIL — lightAware not merged.

- [ ] **Step 3: Write minimal implementation** — extend `simulatedWattsForSample`:

```javascript
import { resolveApState } from './powerModel.js';

function lightAwareOptsForSample(sample, policy) {
  const la = policy?.lightAware;
  if (!la?.enabled || !sample.lightState) return [];
  const actions = la.actionsByState?.[sample.lightState];
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => ({ ...a, source: 'lightAware', reason: sample.lightState }));
}

export function simulatedWattsForSample(sample, policy = {}) {
  if (!Number.isFinite(sample.watts)) return 0;
  const opts = [...optimizationsForSample(sample, policy), ...lightAwareOptsForSample(sample, policy)];
  return resolveApState(sample.watts, opts);
}
```

In `energyRouter.js` `POST /energy/scenarios`, no signature change is needed — `policy` already passes through to `replayScenario`; the `lightAware` block rides inside it. Add a one-line comment noting `policy.lightAware` is honored.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/scenarioEngine.test.js server/energy/energyRouter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/scenarioEngine.js server/energy/energyRouter.js server/energy/scenarioEngine.test.js
git commit -m "feat(energy): model light-aware policy inside scenario replay (no double-count)"
```

---

### Task 13: Light-aware recommendations

**Files:**
- Modify: `server/energy/recommendationEngine.js`
- Test: `server/energy/recommendationEngine.test.js`

**Interfaces:**
- Consumes: existing recommendation shape (`EnergyRecommendation`).
- Produces: `buildRecommendations` optionally accepts `lightObserved` (`{ sensorCapableCount, darkAvgHoursByAp, ratePerKwh }`) and emits a `light_aware_opportunity` recommendation only when real observed dark time exists.

- [ ] **Step 1: Write the failing test**

```javascript
import { buildRecommendations } from './recommendationEngine.js';

describe('light-aware recommendation', () => {
  it('emits an opportunity only when APs were dark for real observed time', () => {
    const recs = buildRecommendations({
      samples: [],
      windowDays: 7,
      ratePerKwh: 0.14,
      maxGapSeconds: 7200,
      lightObserved: { sensorCapableCount: 4, darkApCount: 3, darkAvgHours: 6.2, baselineKwhDark: 50 },
    });
    const r = recs.find((x) => x.type === 'light_aware_opportunity');
    expect(r).toBeTruthy();
    expect(r.affectedApCount).toBe(3);
    expect(r.estimatedAnnualSaving).toBeGreaterThan(0);
  });

  it('emits nothing when no observed dark time', () => {
    const recs = buildRecommendations({
      samples: [], windowDays: 7, ratePerKwh: 0.14, maxGapSeconds: 7200,
      lightObserved: { sensorCapableCount: 4, darkApCount: 0, darkAvgHours: 0, baselineKwhDark: 0 },
    });
    expect(recs.find((x) => x.type === 'light_aware_opportunity')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/recommendationEngine.test.js`
Expected: FAIL — new branch absent.

- [ ] **Step 3: Write minimal implementation** — at the end of `buildRecommendations`, before returning, append:

```javascript
if (lightObserved && lightObserved.darkApCount > 0 && lightObserved.darkAvgHours > 0) {
  // Modeled: 6 GHz disable during observed dark time (band share 0.25).
  const savingsKwh = (lightObserved.baselineKwhDark ?? 0) * 0.25;
  const annualFactor = windowDays > 0 ? 365 / windowDays : 0;
  const estimatedAnnualSaving = savingsKwh * annualFactor * (ratePerKwh ?? 0);
  recommendations.push({
    id: 'light-aware-opportunity',
    type: 'light_aware_opportunity',
    scope: 'fleet',
    title: 'Enable Light-Aware Optimization for dark spaces',
    explanation: `${lightObserved.sensorCapableCount} APs support ambient light sensing; ${lightObserved.darkApCount} averaged ${lightObserved.darkAvgHours.toFixed(1)} h dark during the window.`,
    affectedApCount: lightObserved.darkApCount,
    baselineKwh: lightObserved.baselineKwhDark ?? 0,
    projectedKwh: (lightObserved.baselineKwhDark ?? 0) - savingsKwh,
    savingsKwh,
    savingsPercent: 25,
    estimatedAnnualSaving,
    riskLevel: 'low',
    confidenceLevel: windowDays >= 7 ? 'high' : windowDays >= 3 ? 'medium' : 'low',
    supportingData: { source: 'light-aware', modeled: true },
  });
}
```

Ensure `buildRecommendations` destructures `lightObserved` from its argument object (default `undefined`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/recommendationEngine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/recommendationEngine.js server/energy/recommendationEngine.test.js
git commit -m "feat(energy): add light-aware opportunity recommendation"
```

---

## Phase E — Frontend

### Task 14: Types + capability mirror

**Files:**
- Modify: `src/types/energy.ts`
- Create: `src/lib/apCapabilities.ts`
- Test: `src/lib/apCapabilities.test.ts`

**Interfaces:**
- Produces (types):
  - `LightState = 'bright' | 'dim' | 'dark' | 'unknown'`
  - `LightAwareSummary`, `LightAwareApRow`, `LightAwarePolicy`, `LightAwareObserved` interfaces (fields mirror the router responses in Tasks 11).
  - `EnergyScenarioPolicy.lightAware?: { enabled: boolean; actionsByState?: Record<string, LightActionInput[]> }`.
- Produces (lib): `supportsLightSensor(model: string | undefined): boolean` mirroring the server registry.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/apCapabilities.test.ts
import { describe, it, expect } from 'vitest';
import { supportsLightSensor } from './apCapabilities';

describe('supportsLightSensor', () => {
  it('flags confirmed sensor families', () => {
    expect(supportsLightSensor('AP5020')).toBe(true);
    expect(supportsLightSensor('ap4020x')).toBe(true);
    expect(supportsLightSensor('AP4060X')).toBe(true);
  });
  it('rejects non-sensor and unknown models', () => {
    expect(supportsLightSensor('AP4000')).toBe(false);
    expect(supportsLightSensor(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/apCapabilities.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/apCapabilities.ts
/** UI mirror of server/energy/apCapabilities.js. Keep SENSOR_MODELS in sync.
 *  Confirmed sensor families: AP4020/4020X/4020FX, AP4060/4060X, AP5020. */
const SENSOR_MODELS = ['AP4020', 'AP4060', 'AP5020'];

export function supportsLightSensor(model: string | undefined | null): boolean {
  if (!model) return false;
  const m = model.toUpperCase();
  return SENSOR_MODELS.some((s) => m.includes(s));
}
```

Append to `src/types/energy.ts`:

```typescript
export type LightState = 'bright' | 'dim' | 'dark' | 'unknown';

export interface LightAwareSummary {
  sensorCapableCount: number;
  reportingCount: number;
  stateBreakdown: Record<LightState, number>;
  policyEnabled: boolean;
  projectedAnnual: { kwh: number | null; cost: number | null };
  currency: string;
  currencySymbol: string;
}

export interface LightAwareApRow {
  serial: string;
  apName: string;
  siteId: string | null;
  model: string;
  sensorCapable: boolean;
  lightState: LightState;
  dwellSeconds: number;
  policyEnabled: boolean;
  currentWatts: number;
  optimizedWatts: number;
  savingsWatts: number;
}

export interface LightActionInput {
  kind: 'reduceTxPower' | 'reduceChains' | 'disableRadio' | 'disableWlan' | 'lowPowerProfile';
  band?: '2.4' | '5' | '6';
  reducePercent?: number;
  wlanId?: string;
}

export interface LightAwarePolicyDoc {
  thresholds?: { brightLux: number; darkLux: number };
  hysteresis?: { dimDwellMinutes: number; darkDwellMinutes: number; restoreDwellMinutes: number };
  dim?: { actions: LightActionInput[] };
  dark?: { actions: LightActionInput[] };
  protectedWlanIds?: string[];
  restore?: { toNormal: boolean };
}

export interface LightAwarePolicy {
  enabled: boolean;
  policy: LightAwarePolicyDoc;
}

export interface LightAwareObserved {
  brightPct: number | null;
  dimPct: number | null;
  darkPct: number | null;
  unknownPct: number | null;
  avgDarkHoursPerDay: number | null;
  confidence: 'high' | 'medium' | 'low';
  collecting: boolean;
}
```

And extend `EnergyScenarioPolicy` with:

```typescript
  lightAware?: {
    enabled: boolean;
    actionsByState?: Partial<Record<LightState, LightActionInput[]>>;
  };
```

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run src/lib/apCapabilities.test.ts && npm run type-check`
Expected: PASS + no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/energy.ts src/lib/apCapabilities.ts src/lib/apCapabilities.test.ts
git commit -m "feat(energy): add light-aware types and UI capability mirror"
```

---

### Task 15: energyService client functions

**Files:**
- Modify: `src/services/energyService.ts`
- Test: `src/services/energyService.test.ts` (extend if present; else create with `vi.stubGlobal('fetch', ...)`)

**Interfaces:**
- Consumes: existing `request<T>`, `buildQuery`, `windowParams`, `buildMonitoringHeaders`.
- Produces:
  - `getLightAwareSummary(filters, signal) -> Promise<LightAwareSummary>`
  - `getLightAwareAps(filters, signal) -> Promise<{ aps: LightAwareApRow[] }>`
  - `getLightAwarePolicy(filters, signal) -> Promise<LightAwarePolicy>`
  - `putLightAwarePolicy(body: { enabled; policy; siteId? }) -> Promise<LightAwarePolicy>`
  - `getLightAwareObserved(filters, signal) -> Promise<LightAwareObserved>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/energyService.test.ts (add)
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getLightAwareSummary } from './energyService';

afterEach(() => vi.unstubAllGlobals());

describe('getLightAwareSummary', () => {
  it('calls the summary endpoint with window params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sensorCapableCount: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    const res = await getLightAwareSummary({ site: 'all', timeRange: '24h' });
    expect(res.sensorCapableCount).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/energy/light-aware/summary');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/energyService.test.ts`
Expected: FAIL — function not exported.

- [ ] **Step 3: Write implementation** — append to `energyService.ts` (follow the existing `getEnergyOverview` pattern for query/window building):

```typescript
import type {
  LightAwareSummary, LightAwareApRow, LightAwarePolicy, LightAwareObserved,
} from '../types/energy';

export function getLightAwareSummary(
  filters: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<LightAwareSummary> {
  const { start, end } = windowParams(filters.timeRange);
  return request<LightAwareSummary>(
    `/light-aware/summary${buildQuery({ siteId: filters.site, start, end })}`,
    { signal }
  );
}

export function getLightAwareAps(
  filters: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<{ aps: LightAwareApRow[] }> {
  const { start, end } = windowParams(filters.timeRange);
  return request<{ aps: LightAwareApRow[] }>(
    `/light-aware/aps${buildQuery({ siteId: filters.site, start, end })}`,
    { signal }
  );
}

export function getLightAwarePolicy(
  filters: { site: string },
  signal?: AbortSignal
): Promise<LightAwarePolicy> {
  return request<LightAwarePolicy>(
    `/light-aware/policy${buildQuery({ siteId: filters.site })}`,
    { signal }
  );
}

export function putLightAwarePolicy(body: {
  enabled: boolean;
  policy: LightAwarePolicy['policy'];
  siteId?: string;
}): Promise<LightAwarePolicy> {
  return request<LightAwarePolicy>('/light-aware/policy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getLightAwareObserved(
  filters: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<LightAwareObserved> {
  const { start, end } = windowParams(filters.timeRange);
  return request<LightAwareObserved>(
    `/light-aware/observed${buildQuery({ siteId: filters.site, start, end })}`,
    { signal }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/energyService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/energyService.ts src/services/energyService.test.ts
git commit -m "feat(energy): add light-aware energy service client"
```

---

### Task 16: Light-aware hooks

**Files:**
- Modify: `src/hooks/useEnergyData.ts`
- Test: `src/hooks/useEnergyData.test.tsx` (add cases following existing hook tests)

**Interfaces:**
- Consumes: `useEnergyResource` (existing), the service fns (Task 15).
- Produces: `useLightAwareSummary()`, `useLightAwareAps(enabled)`, `useLightAwareObserved()` returning `AsyncState<T>`; `useLightAwarePolicy()` returning `{ data, loading, error, save }`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/useEnergyData.test.tsx (add)
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useLightAwareSummary } from './useEnergyData';
import * as svc from '../services/energyService';

it('useLightAwareSummary loads summary', async () => {
  vi.spyOn(svc, 'getLightAwareSummary').mockResolvedValue({
    sensorCapableCount: 4, reportingCount: 6,
    stateBreakdown: { bright: 2, dim: 1, dark: 1, unknown: 2 },
    policyEnabled: true, projectedAnnual: { kwh: 100, cost: 14 },
    currency: 'USD', currencySymbol: '$',
  });
  const { result } = renderHook(() => useLightAwareSummary());
  await waitFor(() => expect(result.current.data?.sensorCapableCount).toBe(4));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useEnergyData.test.tsx`
Expected: FAIL — hook not exported.

- [ ] **Step 3: Write implementation** — append to `useEnergyData.ts`:

```typescript
import {
  getLightAwareSummary, getLightAwareAps, getLightAwareObserved,
  getLightAwarePolicy, putLightAwarePolicy,
} from '../services/energyService';
import type {
  LightAwareSummary, LightAwareApRow, LightAwareObserved, LightAwarePolicy,
} from '../types/energy';

export function useLightAwareSummary(): AsyncState<LightAwareSummary> {
  return useEnergyResource((filters, signal) => getLightAwareSummary(filters, signal));
}

export function useLightAwareAps(enabled: boolean): AsyncState<LightAwareApRow[]> {
  return useEnergyResource(
    async (filters, signal) => (await getLightAwareAps(filters, signal)).aps,
    enabled
  );
}

export function useLightAwareObserved(): AsyncState<LightAwareObserved> {
  return useEnergyResource((filters, signal) => getLightAwareObserved(filters, signal));
}

export function useLightAwarePolicy() {
  const { filters } = useGlobalFilters();
  const [data, setData] = useState<LightAwarePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getLightAwarePolicy({ site: filters.site }, controller.signal)
      .then((r) => { if (!controller.signal.aborted) { setData(r); setLoading(false); } })
      .catch((e) => { if (!controller.signal.aborted) { setError(messageOf(e)); setLoading(false); } });
    return () => controller.abort();
  }, [filters.site, nonce]);

  const save = useCallback(
    async (body: { enabled: boolean; policy: LightAwarePolicy['policy'] }) => {
      const saved = await putLightAwarePolicy({ ...body, siteId: filters.site === 'all' ? undefined : filters.site });
      setData(saved);
      setNonce((n) => n + 1);
      return saved;
    },
    [filters.site]
  );

  return { data, loading, error, save };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useEnergyData.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEnergyData.ts src/hooks/useEnergyData.test.tsx
git commit -m "feat(energy): add light-aware data hooks"
```

---

### Task 17: Light-Aware panel + layout restructure

**Files:**
- Create: `src/components/energy/LightAwareOptimization.tsx`
- Modify: `src/components/energy/EnergyOptimization.tsx` (insert panel under `EnergySiteRankings`)
- Test: `src/components/energy/LightAwareOptimization.test.tsx`

**Interfaces:**
- Consumes: `useLightAwareSummary` (Task 16).
- Produces: `export function LightAwareOptimization({ onConfigure, onViewAps }: { onConfigure: () => void; onViewAps: () => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/energy/LightAwareOptimization.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { LightAwareOptimization } from './LightAwareOptimization';
import * as hooks from '../../hooks/useEnergyData';

it('shows sensor-capable ratio and state counts from real data', () => {
  vi.spyOn(hooks, 'useLightAwareSummary').mockReturnValue({
    data: {
      sensorCapableCount: 4, reportingCount: 6,
      stateBreakdown: { bright: 2, dim: 1, dark: 1, unknown: 2 },
      policyEnabled: true, projectedAnnual: { kwh: 123, cost: 17.22 },
      currency: 'USD', currencySymbol: '$',
    },
    loading: false, error: null, refetch: () => {},
  });
  render(<LightAwareOptimization onConfigure={() => {}} onViewAps={() => {}} />);
  expect(screen.getByText('4 / 6')).toBeInTheDocument();
  expect(screen.getByText(/Bright/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/energy/LightAwareOptimization.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write implementation** — build the panel (Tailwind + EP1 tokens, matching `EnergySiteRankings` card styling: `rounded-lg border border-border bg-card`). Show: title + subtitle; "Sensor-capable APs `x / y`"; CURRENT STATE list (Bright/Dim/Dark/Unknown with counts and a `Modeled`/`Observed` badge as appropriate); "Light-aware policy Enabled/Disabled"; "Projected annual savings" (`$X.XX` + `XXX kWh`, with a `Projected` badge, §16); `Configure` and `View APs` buttons wired to props. Render skeleton on `loading`, and a "No sensor-capable APs" state when `sensorCapableCount === 0`. Keep ≤ 300 lines.

Wire into `EnergyOptimization.tsx`: add `const [policyOpen, setPolicyOpen] = useState(false)` and `const [apDrawerOpen, setApDrawerOpen] = useState(false)`. In the left column, after `<EnergySiteRankings .../>` and before `<EnergyApTable .../>`, insert:

```tsx
<LightAwareOptimization
  onConfigure={() => setPolicyOpen(true)}
  onViewAps={() => setApDrawerOpen(true)}
/>
```

(The dialog/drawer components mount in Tasks 18-19; add placeholder state now, wire components then.)

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run src/components/energy/LightAwareOptimization.test.tsx && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/energy/LightAwareOptimization.tsx src/components/energy/LightAwareOptimization.test.tsx src/components/energy/EnergyOptimization.tsx
git commit -m "feat(energy): add Light-Aware Optimization panel to Energy page"
```

---

### Task 18: Configure policy dialog

**Files:**
- Create: `src/components/energy/LightAwarePolicyDialog.tsx`
- Modify: `src/components/energy/EnergyOptimization.tsx` (mount the dialog)
- Test: `src/components/energy/LightAwarePolicyDialog.test.tsx`

**Interfaces:**
- Consumes: `useLightAwarePolicy` (Task 16).
- Produces: `export function LightAwarePolicyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/energy/LightAwarePolicyDialog.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { LightAwarePolicyDialog } from './LightAwarePolicyDialog';
import * as hooks from '../../hooks/useEnergyData';

it('renders Dim and Dark action sections when open', () => {
  vi.spyOn(hooks, 'useLightAwarePolicy').mockReturnValue({
    data: { enabled: false, policy: {} }, loading: false, error: null, save: vi.fn(),
  });
  render(<LightAwarePolicyDialog open onOpenChange={() => {}} />);
  expect(screen.getByText(/When Dim/i)).toBeInTheDocument();
  expect(screen.getByText(/When Dark/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/energy/LightAwarePolicyDialog.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write implementation** — Radix `Dialog`. **Simple by default:** essential controls first — an Enabled toggle, "When Dim" action checkboxes (Reduce Tx power [%], Reduce chains), "When Dark" action checkboxes (Disable 6 GHz, Reduce 5 GHz Tx power [%], Disable WLANs [multiselect]). Behind an "Advanced" `Collapsible`: thresholds (brightLux/darkLux), dwell minutes (dim/dark/restore), and Protected WLANs multiselect. On Save, assemble a `LightAwarePolicyDoc` and call `save({ enabled, policy })`, then `onOpenChange(false)`. Label all actions "modeled / not currently executable" via a small caption. Keep ≤ 300 lines; split action-row rendering into a local sub-component if needed.

Mount in `EnergyOptimization.tsx`: `<LightAwarePolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />`.

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run src/components/energy/LightAwarePolicyDialog.test.tsx && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/energy/LightAwarePolicyDialog.tsx src/components/energy/EnergyOptimization.tsx src/components/energy/LightAwarePolicyDialog.test.tsx
git commit -m "feat(energy): add light-aware policy configuration dialog"
```

---

### Task 19: View APs drill-down

**Files:**
- Create: `src/components/energy/LightAwareApDrawer.tsx`
- Modify: `src/components/energy/EnergyOptimization.tsx` (mount the drawer)
- Test: `src/components/energy/LightAwareApDrawer.test.tsx`

**Interfaces:**
- Consumes: `useLightAwareAps(enabled)` (Task 16).
- Produces: `export function LightAwareApDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/energy/LightAwareApDrawer.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { LightAwareApDrawer } from './LightAwareApDrawer';
import * as hooks from '../../hooks/useEnergyData';

it('lists AP rows with light state and modeled savings', () => {
  vi.spyOn(hooks, 'useLightAwareAps').mockReturnValue({
    data: [{
      serial: 'A', apName: 'AP-A', siteId: 's1', model: 'AP5020',
      sensorCapable: true, lightState: 'dark', dwellSeconds: 3600, policyEnabled: true,
      currentWatts: 20, optimizedWatts: 15, savingsWatts: 5,
    }],
    loading: false, error: null, refetch: () => {},
  });
  render(<LightAwareApDrawer open onOpenChange={() => {}} />);
  expect(screen.getByText('AP-A')).toBeInTheDocument();
  expect(screen.getByText(/dark/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/energy/LightAwareApDrawer.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write implementation** — Radix `Dialog` (or the project's existing drawer/slideout primitive if one is in use on the Energy page; otherwise Dialog). Pass `enabled={open}` to `useLightAwareAps` so it only fetches when open. Render a table: AP | Site | Model | Sensor | Light | Duration | Policy | Current W | Optimized W | Savings. Add filter controls (§13): Sensor capable / unavailable, light state (bright/dim/dark/unknown), policy enabled, site, model — client-side filtering over the loaded rows. Duration formats `dwellSeconds` to `Xh Ym`. Keep ≤ 300 lines.

Mount in `EnergyOptimization.tsx`: `<LightAwareApDrawer open={apDrawerOpen} onOpenChange={setApDrawerOpen} />`.

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run src/components/energy/LightAwareApDrawer.test.tsx && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/energy/LightAwareApDrawer.tsx src/components/energy/EnergyOptimization.tsx src/components/energy/LightAwareApDrawer.test.tsx
git commit -m "feat(energy): add light-aware View APs drill-down"
```

---

### Task 20: What-if "Model Light-Aware policy" toggle

**Files:**
- Modify: `src/components/energy/EnergyScenarioBuilder.tsx`
- Test: `src/components/energy/EnergyScenarioBuilder.test.tsx`

**Interfaces:**
- Consumes: `useLightAwarePolicy` (Task 16), existing scenario submit path.
- Produces: a checkbox "Model Light-Aware policy" that, when checked, adds a `lightAware` block to the scenario `policy` sent to `postEnergyScenario`, built from the saved policy's dim/dark actions (`actionsByState`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/energy/EnergyScenarioBuilder.test.tsx (add)
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { EnergyScenarioBuilder } from './EnergyScenarioBuilder';
import * as hooks from '../../hooks/useEnergyData';

it('offers a Model Light-Aware policy toggle', () => {
  vi.spyOn(hooks, 'useLightAwarePolicy').mockReturnValue({
    data: { enabled: true, policy: { dark: { actions: [{ kind: 'disableRadio', band: '6' }] } } },
    loading: false, error: null, save: vi.fn(),
  });
  render(<EnergyScenarioBuilder />);
  expect(screen.getByText(/Model Light-Aware policy/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/energy/EnergyScenarioBuilder.test.tsx`
Expected: FAIL — toggle absent.

- [ ] **Step 3: Write implementation** — add a checkbox row (matching the builder's existing option styling). When checked and a saved policy exists, include in the submitted `policy`:

```typescript
lightAware: {
  enabled: true,
  actionsByState: {
    dim: policy?.policy?.dim?.actions ?? [],
    dark: policy?.policy?.dark?.actions ?? [],
  },
},
```

Disable the toggle with a caption "Configure a policy first" when no saved policy exists.

- [ ] **Step 4: Run test + type-check**

Run: `npx vitest run src/components/energy/EnergyScenarioBuilder.test.tsx && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/energy/EnergyScenarioBuilder.tsx src/components/energy/EnergyScenarioBuilder.test.tsx
git commit -m "feat(energy): add Model Light-Aware policy toggle to What-if"
```

---

## Final Verification

- [ ] **Step 1: Full test suite**

Run: `npm run test -- --run`
Expected: All green (existing ~3,200 + new tests). Investigate any red — the baseline is green, a failure is a real signal.

- [ ] **Step 2: Lint + types + format**

Run: `npm run lint && npm run type-check && npm run format:check`
Expected: clean.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: production build succeeds.

- [ ] **Step 4: Manual smoke (optional, local)**

Start `npm run dev`, open the Energy page: confirm the Light-Aware panel appears in the lower-left under Sites by energy use, Configure opens the dialog, View APs opens the drawer, and the What-if toggle is present. Post a couple of `/api/light-sensor/report` payloads (with `LIGHT_SENSOR_TOKEN` if set) to see states flow.

- [ ] **Step 5: Finish the branch** — use `superpowers:finishing-a-development-branch` to open the PR (do NOT deploy to Production Demo; target Integration per CLAUDE.md/QA_AND_RELEASE.md).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §2/§3 panel + layout → Task 17. §4 resolver spine → Tasks 1-2. §5 states + hysteresis → Task 4. §4/§6.4 capability registry → Tasks 3, 14. §6 configuration experience → Task 18. §7 WLAN safety → Task 9. §8 What-if integration → Tasks 12, 20. §9 double-count → Tasks 1, 12. §10 page-wide savings/rate reuse → Tasks 11 (prefs) + resolver. §11 confidence/observed → Task 11 `observed` + Task 6 distribution. §12 historical replay → Task 12 (scenario reuse). §13 View APs → Task 19. §14 hierarchy schema-only → Task 5 (nullable scope cols). §15 recommendations → Task 13. §16 measured/observed/modeled/projected labels → Tasks 17-19 badges. §17 trigger abstraction → Task 10. §18 persistence/retention → Tasks 5-7. §19 fail-safe (unknown≠dark) → Tasks 4, 10. §20 model/recommend/execute tiers → Task 8.
- Gap noted: retention/rollup job for `light_sensor_samples` is specified in the spec (§18) but implemented as a schema/pattern note only — pruning reuses the existing metric_samples retention mechanism; if that mechanism is a cron elsewhere, add light_sensor_samples to it during Task 5. Flagged for the implementer.

**Placeholder scan:** No TBD/TODO; every code step carries real code.

**Type consistency:** `resolveApState`, `optimizationsForSample`, `eligibleOptimizations`, `ambientLightTrigger`, `listApLightStates`, `LightAwareSummary`/`LightAwareApRow`/`LightAwarePolicy`/`LightAwareObserved`, and the `{ enabled, policy }` policy shape are used consistently across server and client tasks. Optimization descriptor shape (`kind/band/reducePercent/wlanId/source/reason`) matches between Tasks 1, 2, 9, 12.
