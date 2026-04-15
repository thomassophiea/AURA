# Roaming Trail — Sparkline View

**Date:** 2026-04-15
**Status:** Approved
**Scope:** Additive view mode for the existing Roaming Trail component

---

## Overview

Add an optional **Sparkline View** to the Roaming Trail that lets users quickly assess roaming behavior at a glance — density, failure rate, and PHY rate trend — without leaving the workflow. The standard trail view is unchanged. No new API calls. No mock data.

---

## Goals

Answer three questions visually in one compact chart:

1. Is roaming stable, bursty, or spiking? (event density)
2. Are there failures? (failed roam proportion)
3. What was the connection quality? (average dataRate per bucket)

---

## Files

| File | Change |
|---|---|
| `src/components/RoamingTrail.tsx` | Add `viewMode` state + view toggle button + conditional render |
| `src/components/RoamingSparkline.tsx` | New — chart component |
| `src/lib/roamingSparklineData.ts` | New — pure data transformation utility |

---

## Data Transformation (`src/lib/roamingSparklineData.ts`)

### Input

`RoamingEvent[]` — the already-filtered, already-processed array from `RoamingTrail`'s existing `roamingEvents` useMemo. No re-fetching.

### Output

```ts
export interface SparklineBucket {
  label: string;           // Tooltip display: "Apr 14, 10:30"
  timeMs: number;          // Bucket start timestamp (ms)
  total: number;           // All events in bucket
  good: number;            // total - failed
  failed: number;          // isFailedRoam === true
  avgDataRate: number | null; // Average Mbps for events that have dataRate; null if none do
}
```

### Bucket sizing

Adapts to the time span of the filtered events (not the selected filter — the actual data span):

| Span | Bucket size |
|---|---|
| < 2 hours | 5 minutes |
| < 24 hours | 30 minutes |
| < 7 days | 4 hours |
| ≥ 7 days | 1 day |

### Edge cases

- **Single event:** Produces one bucket. Renders as a single bar.
- **No dataRate on any event:** All `avgDataRate` values are `null`. The dataRate line is absent from the chart — no error, no fallback.
- **All events failed:** Chart shows solid red bars. Valid and meaningful.
- **Sparse events:** Low bars render correctly. The chart does not fabricate density.

### Export

```ts
export function buildSparklineBuckets(events: RoamingEvent[]): SparklineBucket[]
```

Pure function — no side effects, no state. Callers memoize the result.

---

## Sparkline Component (`src/components/RoamingSparkline.tsx`)

### Props

```ts
interface RoamingSparklineProps {
  data: SparklineBucket[];  // pre-bucketed, memoized by parent
}
```

The parent is responsible for calling `buildSparklineBuckets` and memoizing the result. The component is a pure renderer — it receives ready-to-render data only.

### Chart

Recharts `ComposedChart` inside `ResponsiveContainer`. Height: 160px. `isAnimationActive={false}` throughout.

**Layers (bottom to top):**

1. **Stacked `Bar` — `good`** — emerald/green fill, partial opacity
2. **Stacked `Bar` — `failed`** — red/destructive fill, partial opacity
3. **`Line` — `avgDataRate`** — muted blue, right Y-axis, `connectNulls={false}`, dot={false}

**Axes:**

- Left Y (event count): hidden
- Right Y (dataRate): hidden
- X (time): hidden

No axis chrome. Time range is already shown in the RoamingTrail header.

**Tooltip (custom):**

```
Apr 14, 10:30 – 11:00
Events:    12  (8 good, 4 failed)
Avg rate:  234 Mbps
```

Styled to match `SLETimeline` tooltip — dark background, blur, 11px font.

If `avgDataRate` is null for a bucket, that row shows "—".

**Empty state:**

When `data.length === 0` or all buckets have `total === 0`, render:
```
[Radio icon]
No roaming activity in selected time range
```

Centered, muted, consistent with the existing empty state in RoamingTrail.

**Accessibility:**

- Outer wrapper: `role="img"` + `aria-label="Roaming activity sparkline"`
- Empty state: plain text, screen-reader visible

---

## View Toggle (`src/components/RoamingTrail.tsx`)

### State

```ts
const [viewMode, setViewMode] = useState<'trail' | 'sparkline'>('trail');
```

Persists within the session (component lifetime). Resets to `'trail'` on unmount — intentional, no need to persist across navigations.

### Placement

Added to the existing right-side controls row in the header, to the left of the filter controls:

```
[ Stats ] [ Alerts ] [ Legend ]   [ Trail | Sparkline ]   [ 1H 24H 7D All ]  [⬛]
```

Styled identically to the existing Stats/Alerts/Legend segmented buttons — same `bg-muted rounded p-0.5` wrapper, same active/inactive class logic.

Both buttons get `aria-pressed` reflecting current state.

### Render logic

- `viewMode === 'trail'` → existing timeline (AP sidebar + SVG canvas). No change.
- `viewMode === 'sparkline'` → hide AP sidebar + SVG canvas, render `<RoamingSparkline data={sparklineData} />` in the main content area with appropriate padding.

The following panels are **preserved in both modes** — they don't depend on the view:
- Stats panel (if `showStats`)
- Alerts bar (if `showAlerts`)
- Legend (if `showLegend`)
- Details panel (if `showDetails`)
- Filter controls (time/count)
- Event correlation toggles (AP Events / RRM Events)

The sparkline respects all active filters because it consumes `roamingEvents` — the already-filtered output.

---

## Memoization

In `RoamingTrail.tsx`:

```ts
const sparklineData = useMemo(
  () => buildSparklineBuckets(roamingEvents),
  [roamingEvents]
);
```

Recomputes only when `roamingEvents` changes (i.e., when filter/time selection changes). Does not run at all when `viewMode === 'trail'` — React skips the subtree.

---

## What Does Not Change

- All existing Roaming Trail behavior, logic, and state
- No existing component is refactored
- No API endpoints added or modified
- No mock or hardcoded data

---

## Future Extension Points

- Additional layers (RSSI trend, band distribution) can be added as new `Bar` or `Line` entries in the same `ComposedChart`
- Bucket size could be made user-selectable via a control (not in scope now)
- Sparkline could be embedded as a widget in Dashboard (component is already self-contained)
