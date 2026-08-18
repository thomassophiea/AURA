# Energy Optimization — Design Spec

**Date:** 2026-08-17  
**Internal project:** Green AP Phase 3  
**Customer-facing name:** Energy Optimization / Energy Insights  
**Target environment:** AURA Integration (https://integration.up.railway.app/)  
**Do NOT deploy to:** Production Demo  

---

## 1. Problem

AURA already collects real AP power telemetry (`apPowerConsumptionTimeseries`, stored in `metric_samples` as `metric_family='ap_report'`, `metric_name='power_consumption'`, unit=`mW`). That data is unused beyond the single-AP PowerChart in AP Insights. This feature turns it into fleet-level, site-level, and financial intelligence: how much energy the wireless infrastructure consumes, where it goes, and what changing it would save.

---

## 2. Architecture

### Option chosen: Hybrid (C)

- **New `server/energy/` module** handles fleet/site aggregated endpoints — one SQL query per dashboard view, not one per AP.
- **Existing `/api/monitoring/history`** serves per-AP timeseries charts inside energy drill-down views (no duplication).
- **New Postgres tables** for rate preferences, scenario configs, and cached simulation results only — power readings stay in `metric_samples`.

### System diagram

```
Browser
  EnergyOptimization.tsx (lazy route, first-class nav page)
    EnergyOverviewCards   → GET /api/energy/overview
    EnergySiteRankings    → GET /api/energy/sites
    EnergyApTable         → GET /api/energy/aps (drill-down)
    EnergyTrendsChart     → GET /api/monitoring/history (existing, ap_report family)
    EnergyScenarioBuilder → POST /api/energy/scenarios
    EnergyRecommendations → GET /api/energy/recommendations
    EnergyPreferencesPanel→ GET/PUT /api/energy/preferences

  src/hooks/
    useEnergyOverview.ts
    useEnergySites.ts
    useEnergyAps.ts
    useEnergyRecommendations.ts
    useEnergyScenario.ts
    useEnergyPreferences.ts

  src/services/energyService.ts   (typed API client)
  src/lib/energyCalc.ts           (pure math functions)

Server
  server/energy/energyRouter.js       Express router, /api/energy/*
  server/energy/energyRepository.js   SQL against metric_samples + new tables
  server/energy/energyCalculator.js   kWh/cost/savings math
  server/energy/scenarioEngine.js     replay optimization rules against history
  server/energy/recommendationEngine.js  derive recommendations from aggregated patterns

Postgres
  0004_energy.sql  (3 new tables, detailed below)
```

---

## 3. Database Schema

Migration: `server/db/migrations/0004_energy.sql`

Power readings are NOT duplicated — they stay in `metric_samples`. Only new tables are added.

### energy_rate_preferences

One row per monitored source. Upserted by `PUT /api/energy/preferences`.

```sql
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
```

### energy_scenarios

Named what-if policy documents. The `policy` jsonb carries the scenario controls.

```sql
CREATE TABLE IF NOT EXISTS energy_scenarios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitored_source_id  uuid NOT NULL REFERENCES monitored_sources(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  policy               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

Policy shape:
```json
{
  "disable6GhzHours": [0,1,2,3,4,5],
  "disable24GhzWhenOtherBandsPresent": false,
  "disableLowUtilRadios": true,
  "lowUtilThresholdPercent": 5,
  "afterHoursStart": 22,
  "afterHoursEnd": 6,
  "reduceTxPower": false
}
```

### energy_scenario_results

Cached replay results. Invalidated by deleting the row; computed fresh on POST /api/energy/scenarios.

```sql
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

---

## 4. API

All routes at `/api/energy/*`. Protected by `requireControllerScope` middleware (same as `/api/monitoring/*`). Auth handled by existing scope system — no new auth concept.

### GET /api/energy/overview

Query params: `siteId`, `siteGroupId`, `start`, `end`

Response:
```json
{
  "apCount": 87,
  "apWithDataCount": 82,
  "currentWatts": 1847.3,
  "avgWatts": 1792.1,
  "peakWatts": 2104.8,
  "periodKwh": 301.4,
  "dailyKwhProjected": 43.1,
  "monthlyKwhProjected": 1292.3,
  "annualKwhProjected": 15734.2,
  "estimatedAnnualCost": 2202.79,
  "previousPeriodKwh": 318.7,
  "trendPercent": -5.4,
  "currency": "USD",
  "currencySymbol": "$",
  "ratePerKwh": 0.14,
  "meta": {
    "dataWindowDays": 7,
    "earliestSampleAt": "2026-08-10T00:00:00Z",
    "limitationsNotes": ["5 APs have no power data in this window"]
  }
}
```

### GET /api/energy/sites

Query params: `siteGroupId`, `start`, `end`, `sortBy` (totalKwh | costPerAp | savingsOpportunity)

Response: `{ sites: [...], meta }`

Each site: `{ siteId, siteName, apCount, apWithDataCount, totalKwh, avgWattsPerAp, estimatedAnnualCost, savingsOpportunityPercent, confidenceLevel }`

### GET /api/energy/aps

Query params: `siteId`, `start`, `end`, `sortBy`

Each AP: `{ serial, apName, siteId, avgWatts, peakWatts, totalKwh, estimatedAnnualCost, sampleCount, dataQuality }`

### GET /api/energy/recommendations

Query params: `siteId`, `start`, `end`

Each recommendation:
```json
{
  "id": "uuid",
  "type": "disable_overnight_radios",
  "scope": "fleet",
  "title": "Disable low-utilization radios overnight",
  "explanation": "173 APs averaged fewer than 0.1 associated clients between 00:00–05:00...",
  "affectedApCount": 173,
  "baselineKwh": 7820.0,
  "projectedKwh": 6358.0,
  "savingsKwh": 1462.0,
  "savingsPercent": 18.7,
  "estimatedAnnualSaving": 2527.40,
  "riskLevel": "low",
  "confidenceLevel": "high",
  "supportingData": { "observationDays": 7, "avgClientsOvernight": 0.08 }
}
```

### POST /api/energy/scenarios

Body: `{ name, policy, siteId?, windowStart?, windowEnd? }`

Returns: `{ scenarioId, baseline, simulated, savings, apCount, apWithDataCount, computedAt }`

`baseline` and `simulated` each carry: `{ kwh, dailyProjected, monthlyProjected, annualProjected, estimatedAnnualCost }`

`savings`: `{ kwh, percent, dailyKwh, monthlyKwh, annualKwh, annualCost }`

### GET/PUT /api/energy/preferences

GET returns `{ currencyCode, currencySymbol, ratePerKwh }`.

PUT body: `{ currencyCode, ratePerKwh }`. Returns same shape.

---

## 5. Calculation Methodology

### kWh integration

Power samples arrive at irregular intervals (the controller's cadence is not guaranteed). Assuming fixed intervals would over- or under-count when the collector pauses.

Correct approach using SQL LEAD():
```sql
SELECT
  device_external_id,
  site_id,
  numeric_value / 1000.0 AS watts,
  EXTRACT(EPOCH FROM (
    LEAD(observed_at) OVER (PARTITION BY device_external_id ORDER BY observed_at)
    - observed_at
  )) AS elapsed_seconds
FROM metric_samples
WHERE metric_family = 'ap_report'
  AND metric_name = 'power_consumption'
  AND ...
```

Then: `kWh = SUM(watts * elapsed_seconds / 3600)` — the last sample in each window has `elapsed_seconds = NULL` and is excluded.

### Projections

```
dailyKwh    = periodKwh / (windowSeconds / 86400)
monthlyKwh  = dailyKwh * 30
annualKwh   = dailyKwh * 365
```

All projections labeled as estimates when the observation window < 7 days.

### Cost

```
cost = kwh * ratePerKwh
```

### Savings

```
savingsKwh     = baselineKwh - simulatedKwh
savingsPercent = savingsKwh / baselineKwh * 100
```

### Zero-denominator handling

- Division by zero: always return `null`, never `Infinity` or `NaN`
- Zero clients: watts-per-client metric is omitted, not computed as infinity
- Partial period: tag with `quality: 'partial'`

---

## 6. Scenario Engine

The scenario engine replays optimization policy rules against raw `metric_samples` rows. It does not touch live network configuration — simulation only.

### Supported scenarios (Phase 3)

| Policy control | Simulation method |
|---|---|
| Disable 6 GHz during hours H1–H2 | Zero power contribution of 6 GHz share for those hours (estimated at 25% of AP draw based on band ratio model) |
| Disable radios when utilization < N% | Apply to samples where `channelUtilization < N`; estimate radio power as % of total |
| After-hours reduced power | Apply scalar reduction (configurable %) to samples outside business hours |
| Disable 2.4 GHz when other bands present | Zero 2.4 GHz contribution for APs with multi-band config |

Model limitation: the controller does not expose per-radio power telemetry, so radio-level estimates use the band-ratio model from `powerAnalysis.ts`. Results are labeled "modeled estimate" in the UI, not "measured."

### Historical replay

Replay runs the scenario policy against stored samples in the selected window:

1. Fetch all `ap_report / power_consumption` samples in window, grouped by AP and timestamp
2. For each sample, apply the policy rules given the sample's hour-of-day and available utilization data
3. Compute simulated watts at each timestamp
4. Integrate both baselines using the LEAD() time-gap method
5. Compare and return savings

If the window is < 3 days, the result is labeled "Limited data — annualization is an extrapolation."

---

## 7. Recommendations Engine

Recommendations are computed on-demand from aggregated patterns in the query window. No background job for Phase 3.

### Recommendation types

| Type | Signal | Risk level |
|---|---|---|
| `overnight_radio_disable` | Avg clients 00:00–05:00 < 0.1 per AP over ≥3 days | Low |
| `low_utilization_6ghz` | 6 GHz channel utilization < 5% for > 80% of samples | Low |
| `high_power_per_client` | Watts/active-client > 2× fleet median for a site | Balanced |
| `ambient_correlated_idle` | Light sensor dark + zero clients for predictable period | Low |
| `force_poe_plus_unnecessary` | forcePoEPlus=true but AP draw consistently below PoE threshold | Low |

### Confidence classification

| Level | Criteria |
|---|---|
| High | ≥7 days observation, ≥5 samples/AP/day, pattern consistent across 80%+ of days |
| Medium | 3–6 days, or pattern present but variable |
| Low | < 3 days, or < 3 samples/AP/day |

Confidence is always stated. "High confidence" is never claimed on < 3 days of data.

---

## 8. Frontend

### Navigation

`energy-optimization` added to `monitoringItems` in `Sidebar.tsx` with `Zap` icon (Lucide). Lazy-routed in `App.tsx` same as all other pages.

### Component tree (`src/components/energy/`)

```
EnergyOptimization.tsx          page shell, filter wiring
├── EnergyOverviewCards.tsx     6-card strip: kWh, cost, trend, APs, savings opp, confidence
├── EnergyTrendsChart.tsx       watts/kWh over time — Recharts AreaChart
├── EnergySiteRankings.tsx      sortable table (TanStack Table pattern)
├── EnergyApTable.tsx           per-AP breakdown, lazy-loaded on drill-down
├── EnergyScenarioBuilder.tsx   scenario controls + side-by-side comparison
│   └── ScenarioResultCard.tsx  current vs optimized vs savings columns
├── EnergyRecommendations.tsx   recommendation cards
│   └── RecommendationDetail.tsx slideout with full supporting data
├── EnergyPreferencesPanel.tsx  currency picker + rate input
└── EnergyEmptyState.tsx        shown when apWithDataCount === 0
```

### Design system conformance

- Cards: `<Card>/<CardHeader>/<CardContent>` — existing primitives
- Badges: `<Badge>` — risk (green/yellow/red), confidence (muted/yellow/green)
- Tables: TanStack Table pattern from AccessPoints.tsx
- Charts: Recharts `AreaChart`/`BarChart`, same `COMPACT_TOOLTIP_STYLE` as APInsights.tsx
- Filters: `useGlobalFilters()` for site/time; `<UnifiedFilterBar>` in page header
- Loading: `<PageSkeleton>` on Suspense; skeleton cards within panels
- Empty/error: inline `<AlertTriangle>` pattern
- Colors: Tailwind CSS utilities only — no inline styles
- Responsive: existing grid patterns; charts `<ResponsiveContainer>`

### Pure math (`src/lib/energyCalc.ts`)

```ts
kwhFromWattsAndSeconds(watts, seconds): number
projectDaily(periodKwh, periodSeconds): number
projectMonthly(dailyKwh): number
projectAnnual(dailyKwh): number
estimateCost(kwh, ratePerKwh): number
savingsPercent(baseline, simulated): number | null
formatCurrency(value, symbol): string  // null-safe
```

All functions return `null` on bad inputs rather than `NaN`/`Infinity`.

---

## 9. Non-Destructive Guarantee

The Energy Optimization feature does NOT modify live network configuration.

- Scenario simulation is read-only analysis of historical telemetry
- No calls to controller configuration APIs
- No radio disable/enable calls
- No PSK or SSID modification
- Any future "Apply Optimization" workflow will be a separate, explicitly gated action not present in Phase 3

---

## 10. Data Availability Handling

| Condition | UI behavior |
|---|---|
| `MONITORING_AP_REPORTS_ENABLED=false` | EnergyEmptyState with explanation: "AP power data collection is not enabled. Contact your administrator to enable MONITORING_AP_REPORTS_ENABLED." |
| Some APs missing power data | Summary cards show "X of Y APs reporting power data"; calculations use available APs only |
| Window < 3 days | Projections labeled "Limited data — estimate based on N days" |
| No electricity rate set | Cost fields show "—" with "Configure rate" link to preferences |
| Zero clients | watts-per-client omitted, not shown as infinity |

---

## 11. Testing Requirements

### Backend (Vitest / Node)
- `energyCalculator.js`: kWh formula, projection math, zero/null handling, irregular intervals
- `scenarioEngine.js`: policy application, savings math, partial data
- `recommendationEngine.js`: each recommendation type, confidence classification
- `energyRouter.js`: all endpoints, auth guard, invalid params, empty data

### Frontend (Vitest + RTL)
- `energyCalc.ts`: all pure functions including edge cases
- `useEnergyOverview`: loading/error/success states
- `EnergyOverviewCards`: renders correct values, null handling
- `EnergyScenarioBuilder`: scenario submission, result display
- Currency formatting for USD and EUR

### Browser validation (post-deploy)
- Load Energy Optimization page in Integration
- Exercise all filters (site, time range)
- Run a scenario and verify numbers
- Verify no console errors
- Verify regression: Dashboard, AP Insights, Clients, Sites still work

---

## 12. Extension Points for Future Phases

- `energy_scenarios.policy` jsonb: add new controls without schema change
- `energy_rate_preferences.currency_code` CHECK constraint: add currency codes in one line
- `energy_scenario_results`: cache layer ready for scheduled pre-computation
- `recommendationEngine.js`: add recommendation types as new named functions
- Ambient light: `lightSensorStates` Map exists in server.js; persist to metric_samples in Phase 4 for correlation
- Closed-loop: future "Apply" action would POST to controller config APIs — architecture is isolated from simulation path so it can be added without touching Phase 3 code

---

## 13. Assumptions

1. `MONITORING_AP_REPORTS_ENABLED=true` is set in Integration Railway environment (or will be set before demo)
2. AP power data is reported in mW by the controller (verified against XCC 10.18.1.0-011R)
3. The controller does not expose per-radio power telemetry (verified — no per-radio breakdown possible)
4. 7-day retention window is the current baseline; longer windows improve recommendation quality automatically
5. Scenario savings estimates use a band-ratio model (not measured per-radio) and are explicitly labeled as modeled
