# Energy Optimization — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `server/energy/` module and `/api/energy/*` API that turns stored AP power telemetry (`metric_samples`, `metric_family='ap_report'`, `metric_name='power_consumption'`, unit `mW`) into fleet/site/AP energy intelligence, what-if scenarios, and recommendations — without ever touching live controller config.

**Architecture:** Hybrid (Option C from the spec). A new Express router mounted at `/api/energy` reuses the existing `requireControllerScope` auth exactly like `/api/monitoring`. A repository runs one aggregate SQL query per view against `metric_samples` (kWh via `LEAD()` time-gap integration). Pure-math and engine modules (calculator, scenario, recommendation) are dependency-free and unit-tested. Three new Postgres tables hold rate preferences, scenario documents, and cached scenario results — power readings are never duplicated.

**Tech Stack:** Node 22 ESM, Express Router, `pg` via `server/db/pool.js` (`query`, `withTransaction`), Vitest. Migrations run through `server/db/migrate.js` (`migrations/NNNN_*.sql`, applied in filename order under an advisory lock).

## Global Constraints

- Target environment: AURA Integration (`https://integration.up.railway.app/`). **Do NOT deploy to Production Demo.**
- All routes live under `/api/energy/*` and are guarded by `createRequireControllerScope` — the authorized source set comes from `req.monitoringScope.sources`, never from query params. `orgId`/`siteId`/`siteGroupId` are filters applied *within* that scope.
- Power readings stay in `metric_samples`. Only the three new tables are added. Migration file: `server/db/migrations/0004_energy.sql`. Every statement idempotent (`IF NOT EXISTS`), all timestamps `timestamptz`.
- Power is stored in **mW**; watts = `numeric_value / 1000.0`.
- Division by zero returns `null`, never `Infinity`/`NaN`. Zero clients → watts-per-client omitted, not infinity. Windows < 3 days flag results as extrapolated.
- kWh uses `LEAD()` gap integration; the last sample per AP (`elapsed_seconds IS NULL`) is excluded, and gaps larger than `maxGapSeconds` are excluded so a collector pause cannot integrate a stale reading across hours.
- Non-destructive: no calls to controller configuration APIs, no radio/PSK/SSID mutation. Scenario/recommendation engines are read-only analysis of history.
- Follow existing module style: parameterized SQL only; sort/column identifiers from fixed allow-lists; errors sanitized via `server/monitoring/errorSanitizer.js` (no stack traces / DB errors / controller bodies leave the module).
- Router factory takes injectable dependencies (repo + engine fns) exactly like `createMonitoringRouter` in `server/monitoring/monitoringRouter.js`, so it is unit-testable with fakes.
- ESLint + Prettier: 2-space indent, single quotes, 100-char width, trailing comma es5. Conventional commits.

---

### Task 1: Energy calculator (pure math)

**Files:**
- Create: `server/energy/energyCalculator.js`
- Test: `server/energy/energyCalculator.test.js`

**Interfaces:**
- Consumes: nothing (pure, dependency-free).
- Produces:
  - `kwhFromWattSeconds(watts: number, seconds: number): number` — `watts * seconds / 3600 / 1000`... **no**: input is watts already, so `watts * seconds / 3600000`? See note. Actually returns watt-hours→kWh: `watts * seconds / 3600 / 1000`.
  - `projectDaily(periodKwh: number, periodSeconds: number): number | null`
  - `projectMonthly(dailyKwh: number): number | null`
  - `projectAnnual(dailyKwh: number): number | null`
  - `estimateCost(kwh: number, ratePerKwh: number): number | null`
  - `savingsPercent(baselineKwh: number, simulatedKwh: number): number | null`
  - `windowDays(startISO: string, endISO: string): number | null`
  - `dataQualityForDays(days: number | null): 'high' | 'medium' | 'low'`

- [ ] **Step 1: Write the failing test**

```js
// server/energy/energyCalculator.test.js
import { describe, it, expect } from 'vitest';
import {
  kwhFromWattSeconds,
  projectDaily,
  projectMonthly,
  projectAnnual,
  estimateCost,
  savingsPercent,
  windowDays,
  dataQualityForDays,
} from './energyCalculator.js';

describe('kwhFromWattSeconds', () => {
  it('integrates watts over seconds into kWh', () => {
    // 1000 W for 3600 s = 1 kWh
    expect(kwhFromWattSeconds(1000, 3600)).toBeCloseTo(1, 6);
  });
  it('returns 0 for zero elapsed time', () => {
    expect(kwhFromWattSeconds(1000, 0)).toBe(0);
  });
  it('returns null on non-finite input', () => {
    expect(kwhFromWattSeconds(Number.NaN, 3600)).toBeNull();
    expect(kwhFromWattSeconds(1000, -5)).toBeNull();
  });
});

describe('projectDaily', () => {
  it('scales a period to a 24h day', () => {
    // 10 kWh over 12h -> 20 kWh/day
    expect(projectDaily(10, 43200)).toBeCloseTo(20, 6);
  });
  it('returns null on zero window', () => {
    expect(projectDaily(10, 0)).toBeNull();
  });
});

describe('projectMonthly / projectAnnual', () => {
  it('multiplies daily by 30 and 365', () => {
    expect(projectMonthly(2)).toBe(60);
    expect(projectAnnual(2)).toBe(730);
  });
  it('propagates null', () => {
    expect(projectMonthly(null)).toBeNull();
    expect(projectAnnual(null)).toBeNull();
  });
});

describe('estimateCost', () => {
  it('multiplies kWh by rate', () => {
    expect(estimateCost(100, 0.14)).toBeCloseTo(14, 6);
  });
  it('returns null on bad rate', () => {
    expect(estimateCost(100, 0)).toBeNull();
    expect(estimateCost(100, null)).toBeNull();
  });
});

describe('savingsPercent', () => {
  it('computes percent reduction', () => {
    expect(savingsPercent(100, 80)).toBeCloseTo(20, 6);
  });
  it('returns null when baseline is zero', () => {
    expect(savingsPercent(0, 0)).toBeNull();
  });
});

describe('windowDays', () => {
  it('returns fractional days between two ISO instants', () => {
    expect(windowDays('2026-08-10T00:00:00Z', '2026-08-17T00:00:00Z')).toBeCloseTo(7, 6);
  });
  it('returns null on invalid dates', () => {
    expect(windowDays('nope', '2026-08-17T00:00:00Z')).toBeNull();
  });
});

describe('dataQualityForDays', () => {
  it('classifies by observation length', () => {
    expect(dataQualityForDays(7)).toBe('high');
    expect(dataQualityForDays(4)).toBe('medium');
    expect(dataQualityForDays(2)).toBe('low');
    expect(dataQualityForDays(null)).toBe('low');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/energy/energyCalculator.test.js`
Expected: FAIL — `Failed to resolve import './energyCalculator.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// server/energy/energyCalculator.js
/**
 * Pure energy math. Every function returns `null` (never NaN/Infinity) when an
 * input is non-finite or would divide by zero, so the API can render a dash
 * instead of a fabricated number.
 */

const MS_PER_DAY = 86_400_000;

function isFinitePositive(value) {
  return Number.isFinite(value) && value >= 0;
}

/** kWh from a constant `watts` held for `seconds`. watts·s / 3600 = Wh; /1000 = kWh. */
export function kwhFromWattSeconds(watts, seconds) {
  if (!Number.isFinite(watts) || !isFinitePositive(seconds)) return null;
  return (watts * seconds) / 3_600_000;
}

/** Scale a period's kWh to a full 24h day. */
export function projectDaily(periodKwh, periodSeconds) {
  if (!Number.isFinite(periodKwh) || !isFinitePositive(periodSeconds) || periodSeconds === 0) {
    return null;
  }
  return periodKwh / (periodSeconds / 86_400);
}

export function projectMonthly(dailyKwh) {
  if (!Number.isFinite(dailyKwh)) return null;
  return dailyKwh * 30;
}

export function projectAnnual(dailyKwh) {
  if (!Number.isFinite(dailyKwh)) return null;
  return dailyKwh * 365;
}

export function estimateCost(kwh, ratePerKwh) {
  if (!Number.isFinite(kwh) || !Number.isFinite(ratePerKwh) || ratePerKwh <= 0) return null;
  return kwh * ratePerKwh;
}

export function savingsPercent(baselineKwh, simulatedKwh) {
  if (!Number.isFinite(baselineKwh) || !Number.isFinite(simulatedKwh) || baselineKwh === 0) {
    return null;
  }
  return ((baselineKwh - simulatedKwh) / baselineKwh) * 100;
}

/** Fractional days between two ISO instants. */
export function windowDays(startISO, endISO) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return (end - start) / MS_PER_DAY;
}

/** Confidence banding on observation length (spec §7). */
export function dataQualityForDays(days) {
  if (!Number.isFinite(days) || days < 3) return 'low';
  if (days < 7) return 'medium';
  return 'high';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/energy/energyCalculator.test.js`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add server/energy/energyCalculator.js server/energy/energyCalculator.test.js
git commit -m "feat(energy): add pure energy calculator (kWh, projections, cost, savings)"
```

---

### Task 2: Database migration

**Files:**
- Create: `server/db/migrations/0004_energy.sql`
- Test: `server/energy/energyRepository.db.test.js` (schema-presence assertions; run only when `DATABASE_URL` is set — mirror `server/monitoring/sampleRepository.db.test.js`)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `energy_rate_preferences`, `energy_scenarios`, `energy_scenario_results` and index `idx_energy_scenario_results_scenario`.

- [ ] **Step 1: Write the migration**

```sql
-- server/db/migrations/0004_energy.sql
-- Energy Optimization (Green AP Phase 3). Power readings are NOT duplicated —
-- they stay in metric_samples. These tables hold only rate preferences,
-- what-if scenario documents, and cached scenario results.
-- Every statement is idempotent. All timestamps are TIMESTAMPTZ (UTC).

CREATE TABLE IF NOT EXISTS energy_rate_preferences (
  monitored_source_id  uuid PRIMARY KEY
                         REFERENCES monitored_sources(id) ON DELETE CASCADE,
  currency_code        text NOT NULL DEFAULT 'USD'
                         CHECK (currency_code IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD')),
  currency_symbol      text NOT NULL DEFAULT '$',
  rate_per_kwh         double precision NOT NULL DEFAULT 0.14
                         CHECK (rate_per_kwh > 0),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS energy_scenarios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  policy               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS energy_scenario_results (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id          uuid NOT NULL REFERENCES energy_scenarios(id) ON DELETE CASCADE,
  site_id              text,
  window_start         timestamptz NOT NULL,
  window_end           timestamptz NOT NULL,
  baseline_kwh         double precision NOT NULL,
  simulated_kwh        double precision NOT NULL,
  savings_kwh          double precision NOT NULL,
  savings_percent      double precision NOT NULL,
  ap_count             integer NOT NULL,
  ap_with_data_count   integer NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_energy_scenario_results_scenario
  ON energy_scenario_results (scenario_id, computed_at DESC);
```

- [ ] **Step 2: Write the schema-presence test**

```js
// server/energy/energyRepository.db.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isDatabaseConfigured, query, closePool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';

const dbAvailable = isDatabaseConfigured();
const d = dbAvailable ? describe : describe.skip;

d('0004_energy migration', () => {
  beforeAll(async () => {
    await runMigrations();
  });
  afterAll(async () => {
    await closePool();
  });

  it('creates the three energy tables', async () => {
    const { rows } = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('energy_rate_preferences','energy_scenarios','energy_scenario_results')`
    );
    const names = rows.map((r) => r.table_name).sort();
    expect(names).toEqual([
      'energy_rate_preferences',
      'energy_scenarios',
      'energy_scenario_results',
    ]);
  });

  it('defaults rate preferences to USD @ 0.14', async () => {
    const { rows } = await query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'energy_rate_preferences' AND column_name = 'rate_per_kwh'`
    );
    expect(rows[0].column_default).toContain('0.14');
  });
});
```

- [ ] **Step 3: Run the migration test**

Run: `DATABASE_URL=$DATABASE_URL npx vitest run server/energy/energyRepository.db.test.js`
Expected: PASS when `DATABASE_URL` is set; SKIPPED otherwise. (CI without a DB skips; a local/Integration DB applies and verifies.)

- [ ] **Step 4: Commit**

```bash
git add server/db/migrations/0004_energy.sql server/energy/energyRepository.db.test.js
git commit -m "feat(energy): add 0004_energy migration (rate prefs, scenarios, results)"
```

---

### Task 3: Energy repository (aggregate SQL)

**Files:**
- Create: `server/energy/energyRepository.js`
- Test: append to `server/energy/energyRepository.db.test.js` (DB-gated integration test that seeds two APs and asserts kWh integration)

**Interfaces:**
- Consumes: `query`, `withTransaction` from `../db/pool.js`; `kwhFromWattSeconds` is NOT used here (SQL integrates); calculator is used at the router layer.
- Produces:
  - `fetchOverviewAggregate({ sourceIds, siteId, siteGroupId, start, end, maxGapSeconds }): Promise<{ apWithDataCount, periodKwh, avgWatts, currentWatts, peakWatts }>`
  - `fetchSiteAggregates({ sourceIds, siteGroupId, start, end, maxGapSeconds }): Promise<Array<{ siteId, apWithDataCount, totalKwh, avgWattsPerAp }>>`
  - `fetchApAggregates({ sourceIds, siteId, start, end, maxGapSeconds }): Promise<Array<{ serial, apName, siteId, avgWatts, peakWatts, totalKwh, sampleCount }>>`
  - `fetchPowerSamples({ sourceIds, siteId, start, end }): Promise<Array<{ deviceExternalId, siteId, watts, observedAt, band, channelUtilization }>>` — raw rows the scenario engine replays.
  - `getRatePreferences(sourceId): Promise<{ currencyCode, currencySymbol, ratePerKwh } | null>`
  - `upsertRatePreferences({ sourceId, currencyCode, currencySymbol, ratePerKwh }): Promise<{ currencyCode, currencySymbol, ratePerKwh }>`
  - `insertScenario({ sourceId, name, policy }): Promise<{ id }>`
  - `insertScenarioResult(result): Promise<void>`
  - `getEarliestPowerSampleAt({ sourceIds, siteId }): Promise<string | null>`

- [ ] **Step 1: Write the failing integration test (append to db test)**

```js
// append to server/energy/energyRepository.db.test.js
import {
  fetchOverviewAggregate,
  upsertRatePreferences,
  getRatePreferences,
} from './energyRepository.js';

d('energyRepository power integration', () => {
  let sourceId;
  const start = '2026-08-10T00:00:00Z';
  const end = '2026-08-10T02:00:00Z';

  beforeAll(async () => {
    await runMigrations();
    const src = await query(
      `INSERT INTO monitored_sources (base_url, display_name)
       VALUES ('https://energy-test.local', 'energy-test')
       ON CONFLICT (base_url) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`
    );
    sourceId = src.rows[0].id;
    // Two samples one hour apart at 2000 mW = 2 W. First integrates over 3600s.
    for (const [ts, mw] of [
      ['2026-08-10T00:00:00Z', 2000],
      ['2026-08-10T01:00:00Z', 2000],
    ]) {
      await query(
        `INSERT INTO metric_samples
           (monitored_source_id, site_id, device_external_id, metric_family, metric_name,
            observed_at, numeric_value, unit, metric_kind, expires_at)
         VALUES ($1,'site-A','AP-1','ap_report','power_consumption',$2,$3,'mW','gauge', now() + interval '7 days')
         ON CONFLICT DO NOTHING`,
        [sourceId, ts, mw]
      );
    }
  });

  it('integrates 2W held for 3600s into 0.002 kWh', async () => {
    const agg = await fetchOverviewAggregate({
      sourceIds: [sourceId],
      siteId: null,
      siteGroupId: null,
      start,
      end,
      maxGapSeconds: 7200,
    });
    expect(agg.apWithDataCount).toBe(1);
    expect(agg.periodKwh).toBeCloseTo(0.002, 6);
    expect(agg.avgWatts).toBeCloseTo(2, 6);
  });

  it('round-trips rate preferences', async () => {
    await upsertRatePreferences({
      sourceId,
      currencyCode: 'EUR',
      currencySymbol: '€',
      ratePerKwh: 0.31,
    });
    const prefs = await getRatePreferences(sourceId);
    expect(prefs).toEqual({ currencyCode: 'EUR', currencySymbol: '€', ratePerKwh: 0.31 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL=$DATABASE_URL npx vitest run server/energy/energyRepository.db.test.js`
Expected: FAIL — `Failed to resolve import './energyRepository.js'`.

- [ ] **Step 3: Implement the repository**

```js
// server/energy/energyRepository.js
/**
 * SQL for energy views. Power is integrated in the database with LEAD() so an
 * irregular collection cadence does not over- or under-count: each sample is
 * weighted by the real gap to the next sample for the same AP. The last sample
 * per AP has a NULL gap and is excluded; gaps larger than maxGapSeconds are
 * excluded so a collector pause cannot integrate a stale reading across hours.
 *
 * Everything is parameterized. Power is stored in mW; watts = numeric_value / 1000.
 */

import { query } from '../db/pool.js';

const POWER_FILTER = `
  metric_family = 'ap_report'
  AND metric_name = 'power_consumption'
  AND monitored_source_id = ANY($1::uuid[])
  AND observed_at >= $2::timestamptz
  AND observed_at <  $3::timestamptz
  AND numeric_value IS NOT NULL
`;

/** Per-AP integrated CTE shared by the aggregate queries. Bind order: $1 sourceIds, $2 start, $3 end, $4 siteId, $5 maxGapSeconds. */
const INTEGRATED_CTE = `
  WITH samples AS (
    SELECT
      device_external_id,
      site_id,
      numeric_value / 1000.0 AS watts,
      observed_at,
      EXTRACT(EPOCH FROM (
        LEAD(observed_at) OVER (PARTITION BY device_external_id ORDER BY observed_at) - observed_at
      )) AS elapsed_seconds
    FROM metric_samples
    WHERE ${POWER_FILTER}
      AND ($4::text IS NULL OR site_id = $4)
  ),
  per_ap AS (
    SELECT
      device_external_id,
      site_id,
      SUM((watts * elapsed_seconds) / 3600000.0)
        FILTER (WHERE elapsed_seconds IS NOT NULL AND elapsed_seconds <= $5) AS kwh,
      AVG(watts) AS avg_watts,
      MAX(watts) AS peak_watts,
      COUNT(*) AS sample_count
    FROM samples
    GROUP BY device_external_id, site_id
  )
`;

export async function fetchOverviewAggregate({ sourceIds, siteId, start, end, maxGapSeconds }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       COUNT(*)::int                       AS ap_with_data_count,
       COALESCE(SUM(kwh), 0)::float8       AS period_kwh,
       COALESCE(AVG(avg_watts), 0)::float8 AS avg_watts,
       COALESCE(SUM(avg_watts), 0)::float8 AS current_watts,
       COALESCE(SUM(peak_watts), 0)::float8 AS peak_watts
     FROM per_ap`,
    [sourceIds, start, end, siteId, maxGapSeconds]
  );
  const r = rows[0];
  return {
    apWithDataCount: r.ap_with_data_count,
    periodKwh: r.period_kwh,
    avgWatts: r.avg_watts,
    currentWatts: r.current_watts,
    peakWatts: r.peak_watts,
  };
}

export async function fetchSiteAggregates({ sourceIds, start, end, maxGapSeconds }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       site_id,
       COUNT(*)::int                 AS ap_with_data_count,
       COALESCE(SUM(kwh), 0)::float8 AS total_kwh,
       COALESCE(AVG(avg_watts), 0)::float8 AS avg_watts_per_ap
     FROM per_ap
     GROUP BY site_id
     ORDER BY total_kwh DESC`,
    [sourceIds, start, end, null, maxGapSeconds]
  );
  return rows.map((r) => ({
    siteId: r.site_id,
    apWithDataCount: r.ap_with_data_count,
    totalKwh: r.total_kwh,
    avgWattsPerAp: r.avg_watts_per_ap,
  }));
}

export async function fetchApAggregates({ sourceIds, siteId, start, end, maxGapSeconds }) {
  const { rows } = await query(
    `${INTEGRATED_CTE}
     SELECT
       device_external_id AS serial,
       site_id,
       COALESCE(avg_watts, 0)::float8  AS avg_watts,
       COALESCE(peak_watts, 0)::float8 AS peak_watts,
       COALESCE(kwh, 0)::float8        AS total_kwh,
       sample_count::int               AS sample_count
     FROM per_ap
     ORDER BY total_kwh DESC`,
    [sourceIds, start, end, siteId, maxGapSeconds]
  );
  return rows.map((r) => ({
    serial: r.serial,
    apName: r.serial, // apName enrichment is a later phase; serial is stable identity
    siteId: r.site_id,
    avgWatts: r.avg_watts,
    peakWatts: r.peak_watts,
    totalKwh: r.total_kwh,
    sampleCount: r.sample_count,
  }));
}

export async function fetchPowerSamples({ sourceIds, siteId, start, end }) {
  const { rows } = await query(
    `SELECT
       device_external_id AS device_external_id,
       site_id,
       numeric_value / 1000.0 AS watts,
       observed_at,
       dimensions->>'band' AS band,
       (dimensions->>'channelUtilization')::float8 AS channel_utilization
     FROM metric_samples
     WHERE ${POWER_FILTER}
       AND ($4::text IS NULL OR site_id = $4)
     ORDER BY device_external_id, observed_at`,
    [sourceIds, start, end, siteId]
  );
  return rows.map((r) => ({
    deviceExternalId: r.device_external_id,
    siteId: r.site_id,
    watts: r.watts,
    observedAt: r.observed_at.toISOString(),
    band: r.band,
    channelUtilization: r.channel_utilization,
  }));
}

export async function getEarliestPowerSampleAt({ sourceIds, siteId }) {
  const { rows } = await query(
    `SELECT MIN(observed_at) AS earliest
     FROM metric_samples
     WHERE metric_family = 'ap_report' AND metric_name = 'power_consumption'
       AND monitored_source_id = ANY($1::uuid[])
       AND ($2::text IS NULL OR site_id = $2)`,
    [sourceIds, siteId]
  );
  return rows[0].earliest ? rows[0].earliest.toISOString() : null;
}

export async function getRatePreferences(sourceId) {
  const { rows } = await query(
    `SELECT currency_code, currency_symbol, rate_per_kwh
     FROM energy_rate_preferences WHERE monitored_source_id = $1`,
    [sourceId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    currencyCode: r.currency_code,
    currencySymbol: r.currency_symbol,
    ratePerKwh: r.rate_per_kwh,
  };
}

export async function upsertRatePreferences({ sourceId, currencyCode, currencySymbol, ratePerKwh }) {
  const { rows } = await query(
    `INSERT INTO energy_rate_preferences
       (monitored_source_id, currency_code, currency_symbol, rate_per_kwh, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (monitored_source_id) DO UPDATE
       SET currency_code = EXCLUDED.currency_code,
           currency_symbol = EXCLUDED.currency_symbol,
           rate_per_kwh = EXCLUDED.rate_per_kwh,
           updated_at = now()
     RETURNING currency_code, currency_symbol, rate_per_kwh`,
    [sourceId, currencyCode, currencySymbol, ratePerKwh]
  );
  const r = rows[0];
  return {
    currencyCode: r.currency_code,
    currencySymbol: r.currency_symbol,
    ratePerKwh: r.rate_per_kwh,
  };
}

export async function insertScenario({ sourceId, name, policy }) {
  const { rows } = await query(
    `INSERT INTO energy_scenarios (monitored_source_id, name, policy)
     VALUES ($1, $2, $3::jsonb) RETURNING id`,
    [sourceId, name, JSON.stringify(policy)]
  );
  return { id: rows[0].id };
}

export async function insertScenarioResult(result) {
  await query(
    `INSERT INTO energy_scenario_results
       (scenario_id, site_id, window_start, window_end, baseline_kwh, simulated_kwh,
        savings_kwh, savings_percent, ap_count, ap_with_data_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      result.scenarioId,
      result.siteId,
      result.windowStart,
      result.windowEnd,
      result.baselineKwh,
      result.simulatedKwh,
      result.savingsKwh,
      result.savingsPercent,
      result.apCount,
      result.apWithDataCount,
    ]
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL=$DATABASE_URL npx vitest run server/energy/energyRepository.db.test.js`
Expected: PASS (integration + prefs round-trip green when DB configured).

- [ ] **Step 5: Commit**

```bash
git add server/energy/energyRepository.js server/energy/energyRepository.db.test.js
git commit -m "feat(energy): add energy repository (LEAD kWh integration, prefs, scenarios)"
```

---

### Task 4: Scenario engine (policy replay)

**Files:**
- Create: `server/energy/scenarioEngine.js`
- Test: `server/energy/scenarioEngine.test.js`

**Interfaces:**
- Consumes: `kwhFromWattSeconds`, `savingsPercent` from `./energyCalculator.js`. Operates on the row shape from `fetchPowerSamples` (`{ deviceExternalId, watts, observedAt, band, channelUtilization }`).
- Produces:
  - `SIX_GHZ_BAND_SHARE = 0.25` (band-ratio model constant; per spec §6, 6 GHz ≈ 25% of AP draw).
  - `simulatedWattsForSample(sample, policy): number` — applies policy rules to one sample's watts, given its hour-of-day and utilization.
  - `replayScenario({ samples, policy, maxGapSeconds }): { baselineKwh, simulatedKwh, savingsKwh, savingsPercent, apWithDataCount }`

- [ ] **Step 1: Write the failing test**

```js
// server/energy/scenarioEngine.test.js
import { describe, it, expect } from 'vitest';
import { simulatedWattsForSample, replayScenario, SIX_GHZ_BAND_SHARE } from './scenarioEngine.js';

const at = (iso, watts, extra = {}) => ({
  deviceExternalId: 'AP-1',
  watts,
  observedAt: iso,
  band: null,
  channelUtilization: null,
  ...extra,
});

describe('simulatedWattsForSample', () => {
  it('is unchanged when no policy rule applies', () => {
    const s = at('2026-08-10T12:00:00Z', 10);
    expect(simulatedWattsForSample(s, {})).toBe(10);
  });

  it('removes the 6 GHz share during disable hours', () => {
    // 02:00 UTC, policy disables 6 GHz for hours 0-5
    const s = at('2026-08-10T02:00:00Z', 10);
    const policy = { disable6GhzHours: [0, 1, 2, 3, 4, 5] };
    expect(simulatedWattsForSample(s, policy)).toBeCloseTo(10 * (1 - SIX_GHZ_BAND_SHARE), 6);
  });

  it('applies after-hours reduction outside business hours', () => {
    // 23:00 UTC is after-hours (start 22, end 6), reduce 20%
    const s = at('2026-08-10T23:00:00Z', 10);
    const policy = { afterHoursStart: 22, afterHoursEnd: 6, reduceTxPower: true, reducePercent: 20 };
    expect(simulatedWattsForSample(s, policy)).toBeCloseTo(8, 6);
  });

  it('does not reduce during business hours', () => {
    const s = at('2026-08-10T12:00:00Z', 10);
    const policy = { afterHoursStart: 22, afterHoursEnd: 6, reduceTxPower: true, reducePercent: 20 };
    expect(simulatedWattsForSample(s, policy)).toBe(10);
  });

  it('zeroes low-utilization radio share below threshold', () => {
    const s = at('2026-08-10T03:00:00Z', 10, { channelUtilization: 2 });
    const policy = { disableLowUtilRadios: true, lowUtilThresholdPercent: 5 };
    // low-util share modeled at SIX_GHZ_BAND_SHARE of draw
    expect(simulatedWattsForSample(s, policy)).toBeCloseTo(10 * (1 - SIX_GHZ_BAND_SHARE), 6);
  });
});

describe('replayScenario', () => {
  it('integrates baseline and simulated and reports savings', () => {
    // Two samples 1h apart, 2W each, disable 6GHz for the hours they fall in.
    const samples = [
      at('2026-08-10T02:00:00Z', 2),
      at('2026-08-10T03:00:00Z', 2),
    ];
    const policy = { disable6GhzHours: [0, 1, 2, 3, 4, 5] };
    const out = replayScenario({ samples, policy, maxGapSeconds: 7200 });
    // baseline: 2W * 3600s = 0.002 kWh; simulated: 1.5W * 3600s = 0.0015 kWh
    expect(out.baselineKwh).toBeCloseTo(0.002, 6);
    expect(out.simulatedKwh).toBeCloseTo(0.0015, 6);
    expect(out.savingsKwh).toBeCloseTo(0.0005, 6);
    expect(out.savingsPercent).toBeCloseTo(25, 6);
    expect(out.apWithDataCount).toBe(1);
  });

  it('excludes gaps larger than maxGapSeconds', () => {
    const samples = [
      at('2026-08-10T00:00:00Z', 2),
      at('2026-08-11T00:00:00Z', 2), // 24h gap
    ];
    const out = replayScenario({ samples, policy: {}, maxGapSeconds: 7200 });
    expect(out.baselineKwh).toBe(0); // the only interval exceeds the clamp
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/energy/scenarioEngine.test.js`
Expected: FAIL — `Failed to resolve import './scenarioEngine.js'`.

- [ ] **Step 3: Implement the scenario engine**

```js
// server/energy/scenarioEngine.js
/**
 * Replays optimization policies against stored power samples. Read-only: it
 * never touches live config. The controller does not expose per-radio power,
 * so radio-level effects use a band-ratio model (6 GHz ~ 25% of AP draw).
 * Results are labeled "modeled estimate" by the UI, not "measured".
 */

import { kwhFromWattSeconds, savingsPercent } from './energyCalculator.js';

/** Modeled share of an AP's draw attributable to a single high-band radio. */
export const SIX_GHZ_BAND_SHARE = 0.25;

function hourOfDayUTC(iso) {
  return new Date(iso).getUTCHours();
}

/** True when `hour` is in the after-hours window [start, end) that wraps midnight. */
function isAfterHours(hour, start, end) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // wraps midnight, e.g. 22..6
}

export function simulatedWattsForSample(sample, policy = {}) {
  let watts = sample.watts;
  if (!Number.isFinite(watts)) return 0;
  const hour = hourOfDayUTC(sample.observedAt);

  if (Array.isArray(policy.disable6GhzHours) && policy.disable6GhzHours.includes(hour)) {
    watts *= 1 - SIX_GHZ_BAND_SHARE;
  }

  if (
    policy.disableLowUtilRadios &&
    Number.isFinite(sample.channelUtilization) &&
    sample.channelUtilization < (policy.lowUtilThresholdPercent ?? 5)
  ) {
    watts *= 1 - SIX_GHZ_BAND_SHARE;
  }

  if (
    policy.reduceTxPower &&
    isAfterHours(hour, policy.afterHoursStart ?? 22, policy.afterHoursEnd ?? 6)
  ) {
    const pct = Number.isFinite(policy.reducePercent) ? policy.reducePercent : 20;
    watts *= 1 - pct / 100;
  }

  return watts;
}

/**
 * Integrate baseline and simulated draw over the samples using the same LEAD
 * gap method as the repository: each sample weighted by the gap to the next
 * sample for the same AP; last-per-AP and gaps > maxGapSeconds excluded.
 */
export function replayScenario({ samples, policy, maxGapSeconds }) {
  const byAp = new Map();
  for (const s of samples) {
    if (!byAp.has(s.deviceExternalId)) byAp.set(s.deviceExternalId, []);
    byAp.get(s.deviceExternalId).push(s);
  }

  let baselineKwh = 0;
  let simulatedKwh = 0;

  for (const rows of byAp.values()) {
    rows.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
    for (let i = 0; i < rows.length - 1; i += 1) {
      const elapsed = (new Date(rows[i + 1].observedAt) - new Date(rows[i].observedAt)) / 1000;
      if (!(elapsed > 0) || elapsed > maxGapSeconds) continue;
      baselineKwh += kwhFromWattSeconds(rows[i].watts, elapsed) ?? 0;
      simulatedKwh += kwhFromWattSeconds(simulatedWattsForSample(rows[i], policy), elapsed) ?? 0;
    }
  }

  const savingsKwh = baselineKwh - simulatedKwh;
  return {
    baselineKwh,
    simulatedKwh,
    savingsKwh,
    savingsPercent: savingsPercent(baselineKwh, simulatedKwh),
    apWithDataCount: byAp.size,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/energy/scenarioEngine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/scenarioEngine.js server/energy/scenarioEngine.test.js
git commit -m "feat(energy): add scenario engine (band-ratio policy replay)"
```

---

### Task 5: Recommendation engine

**Files:**
- Create: `server/energy/recommendationEngine.js`
- Test: `server/energy/recommendationEngine.test.js`

**Interfaces:**
- Consumes: `dataQualityForDays`, `savingsPercent`, `estimateCost`, `projectAnnual`, `projectDaily` from `./energyCalculator.js`; `SIX_GHZ_BAND_SHARE`, `replayScenario` from `./scenarioEngine.js`.
- Produces:
  - `buildRecommendations({ samples, windowDays, ratePerKwh, maxGapSeconds }): Array<Recommendation>` where `Recommendation = { id, type, scope, title, explanation, affectedApCount, baselineKwh, projectedKwh, savingsKwh, savingsPercent, estimatedAnnualSaving, riskLevel, confidenceLevel, supportingData }`.
  - `confidenceForWindow(days): 'high'|'medium'|'low'` (re-exports `dataQualityForDays` semantics).

- [ ] **Step 1: Write the failing test**

```js
// server/energy/recommendationEngine.test.js
import { describe, it, expect } from 'vitest';
import { buildRecommendations } from './recommendationEngine.js';

function overnightSamples(days) {
  // One AP, a sample every hour for `days` days at 10W, low 6GHz utilization.
  const rows = [];
  const startMs = Date.parse('2026-08-10T00:00:00Z');
  for (let h = 0; h < days * 24; h += 1) {
    rows.push({
      deviceExternalId: 'AP-1',
      watts: 10,
      observedAt: new Date(startMs + h * 3600_000).toISOString(),
      band: '6',
      channelUtilization: 1, // consistently < 5%
    });
  }
  return rows;
}

describe('buildRecommendations', () => {
  it('emits a low-utilization 6 GHz recommendation with savings', () => {
    const recs = buildRecommendations({
      samples: overnightSamples(7),
      windowDays: 7,
      ratePerKwh: 0.14,
      maxGapSeconds: 7200,
    });
    const rec = recs.find((r) => r.type === 'low_utilization_6ghz');
    expect(rec).toBeTruthy();
    expect(rec.affectedApCount).toBe(1);
    expect(rec.savingsKwh).toBeGreaterThan(0);
    expect(rec.savingsPercent).toBeCloseTo(25, 0);
    expect(rec.estimatedAnnualSaving).toBeGreaterThan(0);
    expect(rec.confidenceLevel).toBe('high');
    expect(rec.riskLevel).toBe('low');
  });

  it('downgrades confidence on a short window', () => {
    const recs = buildRecommendations({
      samples: overnightSamples(2),
      windowDays: 2,
      ratePerKwh: 0.14,
      maxGapSeconds: 7200,
    });
    for (const rec of recs) expect(rec.confidenceLevel).toBe('low');
  });

  it('returns [] when there is no qualifying signal', () => {
    const busy = overnightSamples(7).map((s) => ({ ...s, channelUtilization: 60 }));
    const recs = buildRecommendations({
      samples: busy,
      windowDays: 7,
      ratePerKwh: 0.14,
      maxGapSeconds: 7200,
    });
    expect(recs.find((r) => r.type === 'low_utilization_6ghz')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/energy/recommendationEngine.test.js`
Expected: FAIL — `Failed to resolve import './recommendationEngine.js'`.

- [ ] **Step 3: Implement the recommendation engine**

```js
// server/energy/recommendationEngine.js
/**
 * Derives energy recommendations on-demand from aggregated patterns in the
 * query window. No background job (Phase 3). Each recommendation states its
 * confidence explicitly; "high" is never claimed on < 3 days of data.
 */

import { randomUUID } from 'node:crypto';

import { dataQualityForDays, estimateCost, projectDaily, projectAnnual } from './energyCalculator.js';
import { replayScenario, SIX_GHZ_BAND_SHARE } from './scenarioEngine.js';

/** Share of samples for an AP whose 6 GHz utilization sits under `threshold`. */
function lowUtilFraction(rows, threshold) {
  const withUtil = rows.filter((r) => Number.isFinite(r.channelUtilization));
  if (withUtil.length === 0) return 0;
  const low = withUtil.filter((r) => r.channelUtilization < threshold).length;
  return low / withUtil.length;
}

function annualize(periodKwh, samples, maxGapSeconds) {
  // Total observed seconds across the window, capped per interval, for projection.
  let seconds = 0;
  const byAp = new Map();
  for (const s of samples) {
    if (!byAp.has(s.deviceExternalId)) byAp.set(s.deviceExternalId, []);
    byAp.get(s.deviceExternalId).push(s);
  }
  for (const rows of byAp.values()) {
    rows.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
    for (let i = 0; i < rows.length - 1; i += 1) {
      const gap = (new Date(rows[i + 1].observedAt) - new Date(rows[i].observedAt)) / 1000;
      if (gap > 0 && gap <= maxGapSeconds) seconds += gap;
    }
  }
  // Divide by AP count so projectDaily sees a single-AP-equivalent duration.
  const perApSeconds = byAp.size > 0 ? seconds / byAp.size : 0;
  const daily = projectDaily(periodKwh, perApSeconds);
  return projectAnnual(daily);
}

export function buildRecommendations({ samples, windowDays, ratePerKwh, maxGapSeconds }) {
  const confidence = dataQualityForDays(windowDays);
  const recommendations = [];

  // --- low_utilization_6ghz ------------------------------------------------
  const byAp = new Map();
  for (const s of samples) {
    if (!byAp.has(s.deviceExternalId)) byAp.set(s.deviceExternalId, []);
    byAp.get(s.deviceExternalId).push(s);
  }

  const lowUtilAps = [...byAp.entries()].filter(
    ([, rows]) => lowUtilFraction(rows, 5) > 0.8
  );

  if (lowUtilAps.length > 0) {
    const affected = lowUtilAps.flatMap(([, rows]) => rows);
    const replay = replayScenario({
      samples: affected,
      policy: { disableLowUtilRadios: true, lowUtilThresholdPercent: 5 },
      maxGapSeconds,
    });
    const annualSaving = annualize(replay.savingsKwh, affected, maxGapSeconds);
    recommendations.push({
      id: randomUUID(),
      type: 'low_utilization_6ghz',
      scope: 'fleet',
      title: 'Disable idle 6 GHz radios',
      explanation: `${lowUtilAps.length} AP(s) reported 6 GHz channel utilization under 5% for more than 80% of samples. Powering the idle high-band radio down during those periods reclaims an estimated ${(SIX_GHZ_BAND_SHARE * 100).toFixed(0)}% of their draw.`,
      affectedApCount: lowUtilAps.length,
      baselineKwh: replay.baselineKwh,
      projectedKwh: replay.simulatedKwh,
      savingsKwh: replay.savingsKwh,
      savingsPercent: replay.savingsPercent,
      estimatedAnnualSaving: estimateCost(annualSaving ?? 0, ratePerKwh),
      riskLevel: 'low',
      confidenceLevel: confidence,
      supportingData: {
        observationDays: windowDays,
        lowUtilApCount: lowUtilAps.length,
      },
    });
  }

  return recommendations;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/energy/recommendationEngine.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/recommendationEngine.js server/energy/recommendationEngine.test.js
git commit -m "feat(energy): add recommendation engine (low-util 6GHz signal)"
```

---

### Task 6: Energy router

**Files:**
- Create: `server/energy/energyRouter.js`
- Test: `server/energy/energyRouter.test.js`

**Interfaces:**
- Consumes: `createRequireControllerScope` from `../monitoring/requireControllerScope.js`; `sanitizeError`, `ERROR_CLASS_LABELS` from `../monitoring/errorSanitizer.js`; all repository fns from `./energyRepository.js`; `replayScenario` from `./scenarioEngine.js`; `buildRecommendations` from `./recommendationEngine.js`; calculator fns.
- Produces: `createEnergyRouter(options): Router`. Options mirror `createMonitoringRouter`: `{ config, scopeMiddleware, ...injectable repo/engine fns, nowFn }`. Router uses `req.monitoringScope.sources` (array of `{ id }`) set by the scope middleware. Routes: `GET /energy/overview`, `GET /energy/sites`, `GET /energy/aps`, `GET /energy/recommendations`, `POST /energy/scenarios`, `GET /energy/preferences`, `PUT /energy/preferences`.

The scope middleware attaches `req.monitoringScope = { sources: [{ id, base_url, ... }] }`. Confirm the exact shape from `server/monitoring/requireControllerScope.js` before wiring (grep `req.monitoringScope`); the router reads `sources.map((s) => s.id)` and treats `sources[0]` as the preference-owning source.

- [ ] **Step 1: Write the failing test (inject fakes, no DB, no real auth)**

```js
// server/energy/energyRouter.test.js
import { describe, it, expect } from 'vitest';
import express from 'express';
import { createEnergyRouter } from './energyRouter.js';

/** Minimal fake scope middleware: authorizes one source. */
function fakeScope(req, _res, next) {
  req.monitoringScope = { sources: [{ id: 'src-1', base_url: 'https://c.local' }] };
  next();
}

function buildApp(overrides = {}) {
  const app = express();
  app.use(
    '/api',
    createEnergyRouter({
      config: { retentionDays: 7, authGraceSeconds: 900, maxGapSeconds: 7200 },
      scopeMiddleware: fakeScope,
      fetchOverviewAggregateFn: async () => ({
        apWithDataCount: 2,
        periodKwh: 10,
        avgWatts: 40,
        currentWatts: 80,
        peakWatts: 100,
      }),
      getEarliestPowerSampleAtFn: async () => '2026-08-10T00:00:00Z',
      getRatePreferencesFn: async () => ({ currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 }),
      upsertRatePreferencesFn: async (p) => ({
        currencyCode: p.currencyCode,
        currencySymbol: p.currencySymbol,
        ratePerKwh: p.ratePerKwh,
      }),
      fetchPowerSamplesFn: async () => [],
      insertScenarioFn: async () => ({ id: 'sc-1' }),
      insertScenarioResultFn: async () => {},
      buildRecommendationsFn: () => [],
      nowFn: () => new Date('2026-08-17T00:00:00Z'),
      ...overrides,
    })
  );
  return app;
}

async function call(app, method, path, body) {
  const { default: request } = await import('supertest');
  const req = request(app)[method](path);
  return body ? req.send(body) : req;
}

describe('GET /api/energy/overview', () => {
  it('returns computed projections and cost', async () => {
    const res = await call(buildApp(), 'get', '/api/energy/overview?start=2026-08-10T00:00:00Z&end=2026-08-17T00:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.apWithDataCount).toBe(2);
    expect(res.body.periodKwh).toBe(10);
    // 10 kWh over 7 days -> ~1.4286 kWh/day
    expect(res.body.dailyKwhProjected).toBeCloseTo(10 / 7, 4);
    expect(res.body.estimatedAnnualCost).toBeCloseTo((10 / 7) * 365 * 0.14, 4);
    expect(res.body.currency).toBe('USD');
  });

  it('rejects an invalid range with 400', async () => {
    const res = await call(buildApp(), 'get', '/api/energy/overview?start=bad&end=also-bad');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/energy/preferences', () => {
  it('validates currency and rate', async () => {
    const res = await call(buildApp(), 'put', '/api/energy/preferences', {
      currencyCode: 'ZZZ',
      ratePerKwh: 0.2,
    });
    expect(res.status).toBe(400);
  });

  it('upserts valid preferences', async () => {
    const res = await call(buildApp(), 'put', '/api/energy/preferences', {
      currencyCode: 'EUR',
      ratePerKwh: 0.31,
    });
    expect(res.status).toBe(200);
    expect(res.body.currencyCode).toBe('EUR');
    expect(res.body.currencySymbol).toBe('€');
  });
});

describe('POST /api/energy/scenarios', () => {
  it('replays a policy and returns savings', async () => {
    const app = buildApp({
      fetchPowerSamplesFn: async () => [
        { deviceExternalId: 'AP-1', watts: 2, observedAt: '2026-08-10T02:00:00Z', band: null, channelUtilization: null },
        { deviceExternalId: 'AP-1', watts: 2, observedAt: '2026-08-10T03:00:00Z', band: null, channelUtilization: null },
      ],
    });
    const res = await call(app, 'post', '/api/energy/scenarios', {
      name: 'overnight 6ghz',
      policy: { disable6GhzHours: [0, 1, 2, 3, 4, 5] },
    });
    expect(res.status).toBe(200);
    expect(res.body.scenarioId).toBe('sc-1');
    expect(res.body.savings.percent).toBeCloseTo(25, 4);
  });
});
```

> Note: `supertest` — verify it is a devDependency (`grep supertest package.json`); if absent, add it with `npm i -D supertest` as the task's first action and include that in the commit.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/energy/energyRouter.test.js`
Expected: FAIL — `Failed to resolve import './energyRouter.js'`.

- [ ] **Step 3: Implement the router**

```js
// server/energy/energyRouter.js
/**
 * /api/energy/* — read/analysis API over stored AP power telemetry.
 *
 * Auth reuses requireControllerScope: the authorized source set is
 * req.monitoringScope.sources, derived from the caller's validated token. Query
 * params filter within that scope, they are never the trust boundary. This
 * router mutates no controller config — scenarios are simulation only.
 */

import { Router, json as expressJson } from 'express';

import { createRequireControllerScope } from '../monitoring/requireControllerScope.js';
import { sanitizeError, ERROR_CLASS_LABELS } from '../monitoring/errorSanitizer.js';
import {
  fetchOverviewAggregate,
  fetchSiteAggregates,
  fetchApAggregates,
  fetchPowerSamples,
  getEarliestPowerSampleAt,
  getRatePreferences,
  upsertRatePreferences,
  insertScenario,
  insertScenarioResult,
} from './energyRepository.js';
import { replayScenario } from './scenarioEngine.js';
import { buildRecommendations } from './recommendationEngine.js';
import {
  projectDaily,
  projectMonthly,
  projectAnnual,
  estimateCost,
  windowDays,
} from './energyCalculator.js';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
const DEFAULT_MAX_GAP_SECONDS = 2 * 60 * 60;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function createEnergyRouter(options = {}) {
  const {
    config = { retentionDays: 7, authGraceSeconds: 900, maxGapSeconds: DEFAULT_MAX_GAP_SECONDS },
    scopeMiddleware = createRequireControllerScope({
      graceMs: (config.authGraceSeconds ?? 900) * 1000,
    }),
    fetchOverviewAggregateFn = fetchOverviewAggregate,
    fetchSiteAggregatesFn = fetchSiteAggregates,
    fetchApAggregatesFn = fetchApAggregates,
    fetchPowerSamplesFn = fetchPowerSamples,
    getEarliestPowerSampleAtFn = getEarliestPowerSampleAt,
    getRatePreferencesFn = getRatePreferences,
    upsertRatePreferencesFn = upsertRatePreferences,
    insertScenarioFn = insertScenario,
    insertScenarioResultFn = insertScenarioResult,
    buildRecommendationsFn = buildRecommendations,
    nowFn = () => new Date(),
  } = options;

  const maxGapSeconds = config.maxGapSeconds ?? DEFAULT_MAX_GAP_SECONDS;
  const router = Router();
  const jsonBody = expressJson({ limit: '32kb' });

  router.use('/energy', scopeMiddleware);

  function fail(res, error, status = 500) {
    const { errorClass } = sanitizeError(error);
    return res.status(status).json({
      error: ERROR_CLASS_LABELS[errorClass] ?? 'Request failed',
      errorClass,
    });
  }

  function sourceIdsOf(req) {
    return (req.monitoringScope?.sources ?? []).map((s) => s.id);
  }

  /** Resolve the [start,end) window, defaulting to the retention window ending now. */
  function resolveWindow(req) {
    const now = nowFn();
    const end = parseDate(req.query.end) ?? now;
    const defaultStart = new Date(end.getTime() - config.retentionDays * 86_400_000);
    const start = parseDate(req.query.start) ?? defaultStart;
    if (start >= end) return null;
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async function resolvePrefs(sourceId) {
    const prefs = await getRatePreferencesFn(sourceId);
    return prefs ?? { currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 };
  }

  // ---- Overview -----------------------------------------------------------
  router.get('/energy/overview', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const siteId = req.query.siteId ?? null;

      const agg = await fetchOverviewAggregateFn({
        sourceIds,
        siteId,
        start: win.start,
        end: win.end,
        maxGapSeconds,
      });
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;
      const dailyKwh = projectDaily(agg.periodKwh, seconds);
      const days = windowDays(win.start, win.end);
      const earliest = await getEarliestPowerSampleAtFn({ sourceIds, siteId });

      res.json({
        apWithDataCount: agg.apWithDataCount,
        currentWatts: agg.currentWatts,
        avgWatts: agg.avgWatts,
        peakWatts: agg.peakWatts,
        periodKwh: agg.periodKwh,
        dailyKwhProjected: dailyKwh,
        monthlyKwhProjected: projectMonthly(dailyKwh),
        annualKwhProjected: projectAnnual(dailyKwh),
        estimatedAnnualCost: estimateCost(projectAnnual(dailyKwh) ?? 0, prefs.ratePerKwh),
        currency: prefs.currencyCode,
        currencySymbol: prefs.currencySymbol,
        ratePerKwh: prefs.ratePerKwh,
        meta: {
          dataWindowDays: days,
          earliestSampleAt: earliest,
          limitationsNotes:
            days !== null && days < 3 ? ['Limited data — projections are an extrapolation.'] : [],
        },
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Sites --------------------------------------------------------------
  router.get('/energy/sites', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;

      const rows = await fetchSiteAggregatesFn({
        sourceIds,
        start: win.start,
        end: win.end,
        maxGapSeconds,
      });
      const sites = rows.map((r) => {
        const daily = projectDaily(r.totalKwh, seconds);
        return {
          siteId: r.siteId,
          siteName: r.siteId,
          apWithDataCount: r.apWithDataCount,
          totalKwh: r.totalKwh,
          avgWattsPerAp: r.avgWattsPerAp,
          estimatedAnnualCost: estimateCost(projectAnnual(daily) ?? 0, prefs.ratePerKwh),
        };
      });
      res.json({ sites, meta: { currency: prefs.currencyCode } });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- APs ----------------------------------------------------------------
  router.get('/energy/aps', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;

      const rows = await fetchApAggregatesFn({
        sourceIds,
        siteId: req.query.siteId ?? null,
        start: win.start,
        end: win.end,
        maxGapSeconds,
      });
      const aps = rows.map((r) => {
        const daily = projectDaily(r.totalKwh, seconds);
        return {
          ...r,
          estimatedAnnualCost: estimateCost(projectAnnual(daily) ?? 0, prefs.ratePerKwh),
          dataQuality: r.sampleCount >= 5 ? 'ok' : 'sparse',
        };
      });
      res.json({ aps, meta: { currency: prefs.currencyCode } });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Recommendations ----------------------------------------------------
  router.get('/energy/recommendations', async (req, res) => {
    try {
      const win = resolveWindow(req);
      if (!win) return fail(res, new Error('invalid range'), 400);
      const sourceIds = sourceIdsOf(req);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      const samples = await fetchPowerSamplesFn({
        sourceIds,
        siteId: req.query.siteId ?? null,
        start: win.start,
        end: win.end,
      });
      const recommendations = buildRecommendationsFn({
        samples,
        windowDays: windowDays(win.start, win.end),
        ratePerKwh: prefs.ratePerKwh,
        maxGapSeconds,
      });
      res.json({ recommendations, meta: { currency: prefs.currencyCode } });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Scenarios ----------------------------------------------------------
  router.post('/energy/scenarios', jsonBody, async (req, res) => {
    try {
      const { name, policy, siteId, windowStart, windowEnd } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        return fail(res, new Error('name required'), 400);
      }
      if (policy === null || typeof policy !== 'object') {
        return fail(res, new Error('policy object required'), 400);
      }
      const sourceIds = sourceIdsOf(req);
      const win = resolveWindow({
        query: { start: windowStart, end: windowEnd },
      });
      if (!win) return fail(res, new Error('invalid range'), 400);
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);

      const samples = await fetchPowerSamplesFn({
        sourceIds,
        siteId: siteId ?? null,
        start: win.start,
        end: win.end,
      });
      const replay = replayScenario({ samples, policy, maxGapSeconds });
      const seconds = (new Date(win.end) - new Date(win.start)) / 1000;

      const projectBlock = (kwh) => {
        const daily = projectDaily(kwh, seconds);
        return {
          kwh,
          dailyProjected: daily,
          monthlyProjected: projectMonthly(daily),
          annualProjected: projectAnnual(daily),
          estimatedAnnualCost: estimateCost(projectAnnual(daily) ?? 0, prefs.ratePerKwh),
        };
      };
      const savingsDaily = projectDaily(replay.savingsKwh, seconds);

      const { id: scenarioId } = await insertScenarioFn({
        sourceId: req.monitoringScope.sources[0]?.id,
        name: name.trim(),
        policy,
      });
      await insertScenarioResultFn({
        scenarioId,
        siteId: siteId ?? null,
        windowStart: win.start,
        windowEnd: win.end,
        baselineKwh: replay.baselineKwh,
        simulatedKwh: replay.simulatedKwh,
        savingsKwh: replay.savingsKwh,
        savingsPercent: replay.savingsPercent ?? 0,
        apCount: replay.apWithDataCount,
        apWithDataCount: replay.apWithDataCount,
      });

      res.json({
        scenarioId,
        baseline: projectBlock(replay.baselineKwh),
        simulated: projectBlock(replay.simulatedKwh),
        savings: {
          kwh: replay.savingsKwh,
          percent: replay.savingsPercent,
          dailyKwh: savingsDaily,
          monthlyKwh: projectMonthly(savingsDaily),
          annualKwh: projectAnnual(savingsDaily),
          annualCost: estimateCost(projectAnnual(savingsDaily) ?? 0, prefs.ratePerKwh),
        },
        apCount: replay.apWithDataCount,
        apWithDataCount: replay.apWithDataCount,
        computedAt: nowFn().toISOString(),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---- Preferences --------------------------------------------------------
  router.get('/energy/preferences', async (req, res) => {
    try {
      const prefs = await resolvePrefs(req.monitoringScope.sources[0]?.id);
      res.json(prefs);
    } catch (error) {
      fail(res, error);
    }
  });

  router.put('/energy/preferences', jsonBody, async (req, res) => {
    try {
      const { currencyCode, ratePerKwh } = req.body ?? {};
      if (!CURRENCY_SYMBOLS[currencyCode]) {
        return fail(res, new Error('unsupported currency'), 400);
      }
      if (!Number.isFinite(ratePerKwh) || ratePerKwh <= 0) {
        return fail(res, new Error('rate must be positive'), 400);
      }
      const saved = await upsertRatePreferencesFn({
        sourceId: req.monitoringScope.sources[0]?.id,
        currencyCode,
        currencySymbol: CURRENCY_SYMBOLS[currencyCode],
        ratePerKwh,
      });
      res.json(saved);
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/energy/energyRouter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/energy/energyRouter.js server/energy/energyRouter.test.js package.json package-lock.json
git commit -m "feat(energy): add /api/energy router (overview, sites, aps, scenarios, recs, prefs)"
```

---

### Task 7: Mount the router in server.js

**Files:**
- Modify: `server.js` (import near the other monitoring imports ~line 28; mount near `createMonitoringRouter` ~line 2100)

**Interfaces:**
- Consumes: `createEnergyRouter` from `./server/energy/energyRouter.js`; existing `monitoringConfig`.
- Produces: `/api/energy/*` live when `monitoringConfig` is present (DB configured), matching how `/api/monitoring` is gated.

- [ ] **Step 1: Add the import**

Add beside the monitoring router import (after `server.js:28`):

```js
import { createEnergyRouter } from './server/energy/energyRouter.js';
```

- [ ] **Step 2: Mount the router under the same guard as monitoring**

Find the existing mount (around `server.js:2100`):

```js
  app.use('/api', createMonitoringRouter({ config: monitoringConfig }));
```

Add immediately after it, inside the same `if (monitoringConfig)` block:

```js
  app.use(
    '/api',
    createEnergyRouter({
      config: {
        retentionDays: monitoringConfig.retentionDays,
        authGraceSeconds: monitoringConfig.authGraceSeconds,
        maxGapSeconds: 2 * 60 * 60,
      },
    })
  );
```

> Verify the enclosing block: `grep -n "createMonitoringRouter" server.js` and read the 5 lines around it to confirm it sits under the `monitoringConfig` guard. If it is not wrapped, wrap both mounts together in `if (monitoringConfig) { ... }`.

- [ ] **Step 3: Verify the server boots and routes resolve**

Run:
```bash
npm run lint -- server.js server/energy
node --check server.js
```
Expected: lint clean; `node --check` prints nothing (syntax OK).

- [ ] **Step 4: Full backend suite**

Run: `npx vitest run server/energy`
Expected: PASS (calculator, scenario, recommendation, router green; db tests skip without `DATABASE_URL`).

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(energy): mount /api/energy router behind monitoring config guard"
```

---

## Self-Review Notes (author verification)

- **Spec §3 schema** → Task 2 (all three tables + index, verbatim DDL). ✓
- **Spec §4 API** → Task 6 (all seven route handlers). ✓
- **Spec §5 calc methodology** → Task 1 (pure math) + Task 3 (LEAD SQL). ✓
- **Spec §6 scenario engine** → Task 4 (band-ratio model, `SIX_GHZ_BAND_SHARE`, gap clamp). ✓
- **Spec §7 recommendations + confidence** → Task 5 (`dataQualityForDays` reused; `low_utilization_6ghz` implemented; add remaining types — `overnight_radio_disable`, `high_power_per_client`, `force_poe_plus_unnecessary` — as follow-on named functions in the same file, tracked as Phase 3.1). Note: only one recommendation type is shipped here to keep the first cut testable; the engine is structured so each new type is an isolated function. ✓ (partial by design)
- **Spec §9 non-destructive** → no controller-config calls anywhere in `server/energy/`. ✓
- **Type consistency:** `replayScenario` returns `{ baselineKwh, simulatedKwh, savingsKwh, savingsPercent, apWithDataCount }` — consumed identically in Task 5 and Task 6. `fetchPowerSamples` row shape (`deviceExternalId, watts, observedAt, band, channelUtilization`) — produced in Task 3, consumed in Tasks 4/5/6. ✓
- **Known follow-ups (not blockers):** `apName`/`siteName` are currently the serial/siteId; enrichment via a join to a device/site dimension table is a Phase 3.1 item. Confirm `req.monitoringScope.sources[].id` shape against `requireControllerScope.js` during Task 6.
