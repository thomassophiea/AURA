# Energy page demo polish — Light-Aware What-If + real site names

Date: 2026-08-20
Scope: **front-end only.** No server/collector change.

## Problem

1. The Light-Aware panel shows a dead empty state ("No sensor-capable APs in
   range") because AP model isn't in the light-aware data, so `sensorCapableCount`
   is always 0 — even though the fleet has AP4020/4060/5020 families that
   genuinely have ambient-light sensors. Needs to become a demo-ready what-if.
2. The "Sites by energy use" table shows raw site UUIDs instead of names and
   renders an "Unassigned (legacy)" row. Names must show (PrimarySite, AFC LAB,
   CLONE…) and the untagged/null-site row must be hidden.

## Ground truth (verified live on Integration)

- `/v3/sites` ids exactly match energy `site_id`s: `84b3642f…`=PrimarySite,
  `f85c4ebb…`=AFC LAB, `d11b471a…`=CLONE.
- `energy/sites` returns `siteName` = the id (server has no names) → names must
  be resolved client-side. `siteNameById` from `useSourceSites` is empty in the
  Energy page context, which is why UUIDs leak through.
- `supportsLightSensor` already keys on `['AP4020','AP4060','AP5020']`; only the
  live ambient-light STATE feed is genuinely missing.

## A. Light-Aware What-If panel

**Real sensor detection (client-side, no wait for a collection cycle):**
- New `src/lib/lightSensor.ts`: `SENSOR_MODELS = ['AP4020','AP4060','AP5020']`
  and `supportsLightSensor(model)` (substring, case-insensitive) — mirrors the
  server source of truth. Covers 4020/4020X/4020FX/4060/4060X/5020.
- Widget cross-references light-aware `/aps` rows (real `serial` + `currentWatts`)
  against the AP inventory (`serial → model`) to count sensor-capable APs for
  real.

**Projection (pure, tested):**
- `src/lib/lightSensor.ts` also exports
  `projectLightAwareSavings(aps, { darkHours, dimHours, darkFactor, dimFactor, ratePerKwh })`
  → `{ kwh, cost }`, computed as
  `Σ watts × (darkHours×darkFactor + dimHours×dimFactor) × 365 / 1000`, cost =
  `kwh × ratePerKwh`. Modeled reduction factors: `darkFactor = 0.35`,
  `dimFactor = 0.15` (from policy defaults: dark disables 6 GHz + cuts Tx, dim
  cuts Tx). Factors surfaced in the UI as visible assumptions.

**Component `src/components/energy/LightAwareWhatIf.tsx`:**
- Header: `N sensor-capable APs` (+ family names tooltip) and a
  **"Modeled · live telemetry pending"** badge.
- Two sliders — modeled **dark hours/day** (0–14, default 10) and **dim
  hours/day** (0–8, default 4) — live-updating projected annual **$ and kWh**.
- Note naming the seam: "Projected from modeled ambient-light hours. Live sensor
  telemetry will replace these assumptions when available."

**Wiring in `LightAwareOptimization.tsx`:**
- Compute sensor-capable APs client-side. If `> 0` → render `<LightAwareWhatIf>`;
  if `=== 0` → keep the existing empty state (softened copy).
- Uses `ratePerKwh` / `currencySymbol` already returned by `useLightAwareSummary`.
- Seam for the real API: when ambient-light telemetry lands,
  `/observed.avgDarkHoursPerDay` becomes the slider default and observed
  distribution replaces the modeled hours.

**AP inventory source:** a hook exposing model-by-serial for the current
controller (reuse `apiService.getSites`/AP inventory path already used elsewhere;
confirm during implementation).

## B. Real site names + hide Unassigned

- New `src/hooks/useSiteNames.ts`: calls `apiService.getSites()` once, returns
  `{ nameById: Map<string,string>, loading }` (id → `name`/`siteName`). Resilient
  to failure (empty map).
- `EnergyOptimization.tsx`: merge `useSiteNames().nameById` into `siteNameById`
  (union with existing os1Sites map, new source wins for missing ids). Filter the
  sites passed to the rankings to those with a truthy `siteId` (hides the
  null/"Unassigned" row).
- `EnergySiteRankings.tsx`: `siteLabel` already prefers the map; no change needed
  beyond the parent no longer passing null-site rows. Drop the now-unreachable
  "Unassigned (legacy)" fallback if it simplifies.

## Testing (TDD)

- `lightSensor.ts`: `supportsLightSensor` family match/non-match;
  `projectLightAwareSavings` math (zero hours, multi-AP, rate).
- `useSiteNames.ts`: builds map from getSites; empty map on failure.
- `LightAwareWhatIf.tsx`: renders sliders, savings update on change, modeled
  badge, count reflects cross-ref.
- `EnergyOptimization` / `EnergySiteRankings`: names resolved from map, null-site
  row not rendered. Mock hooks in the existing test style.

## Out of scope (YAGNI)

Server collector persisting model; the real ambient-light state feed. Both are
the later "wire the API" work; this design leaves clean seams for both.
