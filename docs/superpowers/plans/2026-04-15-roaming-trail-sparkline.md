# Roaming Trail Sparkline View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Sparkline View toggle to Roaming Trail that renders a ComposedChart (stacked bars for good/failed event counts + a line for avg dataRate per time bucket) alongside the unchanged standard trail view.

**Architecture:** Three-file change. A pure transformation utility (`roamingSparklineData.ts`) converts the already-filtered `RoamingEvent[]` into time buckets. A renderer component (`RoamingSparkline.tsx`) accepts `SparklineBucket[]` and renders a Recharts `ComposedChart`. `RoamingTrail.tsx` gains a `viewMode` state, a memoized bucket computation, a view toggle in the header, and a conditional render in the main content area.

**Tech Stack:** React 19, TypeScript (strict), Recharts (`ComposedChart`, `Bar`, `Line`, `ResponsiveContainer`, `Tooltip`), Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/roamingSparklineData.ts` | Create | Pure bucket transformation, types |
| `src/lib/roamingSparklineData.test.ts` | Create | Unit tests for transformation logic |
| `src/components/RoamingSparkline.tsx` | Create | Chart renderer (pure, receives `SparklineBucket[]`) |
| `src/components/RoamingTrail.tsx` | Modify | viewMode state, sparklineData memo, toggle, conditional render |

---

## Task 1: Data transformation utility + tests

**Files:**
- Create: `src/lib/roamingSparklineData.ts`
- Create: `src/lib/roamingSparklineData.test.ts`

- [ ] **Step 1.1: Create the transformation utility**

Create `src/lib/roamingSparklineData.ts` with the exact content below:

```ts
/** Minimal shape of a roaming event needed for sparkline bucketing. */
export interface RoamingEventForSparkline {
  timestamp: number;
  isFailedRoam?: boolean;
  dataRate?: number;
}

export interface SparklineBucket {
  label: string;
  timeMs: number;
  total: number;
  good: number;
  failed: number;
  avgDataRate: number | null;
}

function getBucketSizeMs(spanMs: number): number {
  if (spanMs < 2 * 3_600_000) return 5 * 60_000;         // < 2h  → 5 min
  if (spanMs < 24 * 3_600_000) return 30 * 60_000;        // < 24h → 30 min
  if (spanMs < 7 * 24 * 3_600_000) return 4 * 3_600_000;  // < 7d  → 4 h
  return 24 * 3_600_000;                                    // ≥ 7d  → 1 day
}

function formatBucketLabel(timeMs: number, bucketSizeMs: number): string {
  const d = new Date(timeMs);
  if (bucketSizeMs >= 24 * 3_600_000) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildSparklineBuckets(
  events: RoamingEventForSparkline[]
): SparklineBucket[] {
  if (events.length === 0) return [];

  const timestamps = events.map((e) => e.timestamp);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const spanMs = maxTime - minTime || 1;
  const bucketSizeMs = getBucketSizeMs(spanMs);

  const bucketStart = Math.floor(minTime / bucketSizeMs) * bucketSizeMs;
  const bucketCount = Math.ceil((maxTime - bucketStart) / bucketSizeMs) + 1;

  const buckets: SparklineBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    label: formatBucketLabel(bucketStart + i * bucketSizeMs, bucketSizeMs),
    timeMs: bucketStart + i * bucketSizeMs,
    total: 0,
    good: 0,
    failed: 0,
    avgDataRate: null,
  }));

  const rateSums = new Array<number>(bucketCount).fill(0);
  const rateCounts = new Array<number>(bucketCount).fill(0);

  for (const event of events) {
    const idx = Math.floor((event.timestamp - bucketStart) / bucketSizeMs);
    if (idx < 0 || idx >= buckets.length) continue;
    buckets[idx].total++;
    if (event.isFailedRoam) {
      buckets[idx].failed++;
    } else {
      buckets[idx].good++;
    }
    if (event.dataRate != null) {
      rateSums[idx] += event.dataRate;
      rateCounts[idx]++;
    }
  }

  for (let i = 0; i < buckets.length; i++) {
    if (rateCounts[i] > 0) {
      buckets[i].avgDataRate = rateSums[i] / rateCounts[i];
    }
  }

  return buckets;
}
```

- [ ] **Step 1.2: Write the test file**

Create `src/lib/roamingSparklineData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSparklineBuckets } from './roamingSparklineData';
import type { RoamingEventForSparkline } from './roamingSparklineData';

// Fixed base timestamp: a known point in time to make bucket math deterministic
const BASE = 1_700_000_000_000; // Nov 14 2023 22:13:20 UTC

describe('buildSparklineBuckets', () => {
  it('returns empty array for empty input', () => {
    expect(buildSparklineBuckets([])).toEqual([]);
  });

  it('produces a single bucket for a single event', () => {
    const events: RoamingEventForSparkline[] = [{ timestamp: BASE }];
    const buckets = buildSparklineBuckets(events);
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.some((b) => b.total === 1)).toBe(true);
  });

  it('places two events within 5 min into the same bucket (< 2h span)', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 2 * 60_000 }, // +2 min
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].total).toBe(2);
  });

  it('places events 6 min apart into different buckets (< 2h span → 5 min buckets)', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 6 * 60_000 }, // +6 min → next 5-min bucket
    ];
    const buckets = buildSparklineBuckets(events);
    const filled = buckets.filter((b) => b.total > 0);
    expect(filled.length).toBe(2);
  });

  it('counts good and failed correctly', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE, isFailedRoam: false },
      { timestamp: BASE + 1_000, isFailedRoam: true },
      { timestamp: BASE + 2_000, isFailedRoam: true },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].total).toBe(3);
    expect(buckets[0].good).toBe(1);
    expect(buckets[0].failed).toBe(2);
  });

  it('avgDataRate is null when no events have dataRate', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 1_000 },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].avgDataRate).toBeNull();
  });

  it('computes avgDataRate correctly', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE, dataRate: 100 },
      { timestamp: BASE + 1_000, dataRate: 200 },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].avgDataRate).toBe(150);
  });

  it('omits null dataRate events from the average', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE, dataRate: 300 },
      { timestamp: BASE + 1_000 }, // no dataRate
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets[0].avgDataRate).toBe(300);
  });

  it('uses 30-min buckets for spans between 2h and 24h', () => {
    // 3h span → 30 min buckets → expect ~7 buckets
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 3 * 3_600_000 },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets.length).toBeGreaterThanOrEqual(6);
    expect(buckets.length).toBeLessThanOrEqual(10);
  });

  it('uses 4-hour buckets for spans between 24h and 7d', () => {
    // 48h span → 4h buckets → expect ~13 buckets
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },
      { timestamp: BASE + 48 * 3_600_000 },
    ];
    const buckets = buildSparklineBuckets(events);
    expect(buckets.length).toBeGreaterThanOrEqual(12);
    expect(buckets.length).toBeLessThanOrEqual(15);
  });

  it('good = total - failed (no undefined state)', () => {
    const events: RoamingEventForSparkline[] = [
      { timestamp: BASE },                           // no isFailedRoam → good
      { timestamp: BASE + 500, isFailedRoam: true }, // failed
    ];
    const buckets = buildSparklineBuckets(events);
    const b = buckets[0];
    expect(b.good + b.failed).toBe(b.total);
  });
});
```

- [ ] **Step 1.3: Run tests and confirm they pass**

```bash
npm run test -- roamingSparklineData --reporter=verbose
```

Expected: all 11 tests pass.

- [ ] **Step 1.4: Commit**

```bash
git add src/lib/roamingSparklineData.ts src/lib/roamingSparklineData.test.ts
git commit -m "feat(sparkline): add roaming event bucket transformation utility"
```

---

## Task 2: RoamingSparkline renderer component

**Files:**
- Create: `src/components/RoamingSparkline.tsx`

- [ ] **Step 2.1: Create the component**

Create `src/components/RoamingSparkline.tsx` with the exact content below:

```tsx
import { Radio } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { SparklineBucket } from '../lib/roamingSparklineData';

interface RoamingSparklineProps {
  data: SparklineBucket[];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SparklineBucket }>;
}

function SparklineTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '6px',
        padding: '8px 10px',
        fontSize: '11px',
        color: '#fff',
        backdropFilter: 'blur(8px)',
        lineHeight: '1.6',
      }}
    >
      <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
        {bucket.label}
      </div>
      <div>
        Events: <strong>{bucket.total}</strong>{' '}
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>
          ({bucket.good} good, {bucket.failed} failed)
        </span>
      </div>
      <div>
        Avg rate:{' '}
        <strong>
          {bucket.avgDataRate != null ? `${bucket.avgDataRate.toFixed(0)} Mbps` : '—'}
        </strong>
      </div>
    </div>
  );
}

export function RoamingSparkline({ data }: RoamingSparklineProps) {
  const hasEvents = data.some((b) => b.total > 0);

  if (!hasEvents) {
    return (
      <div
        role="img"
        aria-label="Roaming activity sparkline — no data"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '160px',
          gap: '8px',
        }}
      >
        <Radio style={{ width: 32, height: 32, opacity: 0.3 }} />
        <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
          No roaming activity in selected time range
        </p>
      </div>
    );
  }

  // Compute right-axis domain so dataRate line doesn't dwarf the bars
  const maxRate = Math.max(...data.map((b) => b.avgDataRate ?? 0));

  return (
    <div
      role="img"
      aria-label="Roaming activity sparkline showing event density and average data rate over time"
      style={{ width: '100%', padding: '16px 24px' }}
    >
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '8px',
          fontSize: '11px',
          color: 'var(--muted-foreground)',
          alignItems: 'center',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'rgba(34,197,94,0.75)',
            }}
          />
          Good events
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'rgba(239,68,68,0.75)',
            }}
          />
          Failed events
        </span>
        {maxRate > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 2,
                background: 'rgba(99,102,241,0.8)',
              }}
            />
            Avg PHY rate
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="timeMs" hide />
          <YAxis yAxisId="left" hide />
          <YAxis
            yAxisId="right"
            orientation="right"
            hide
            domain={[0, maxRate > 0 ? maxRate * 1.2 : 1]}
          />
          <Tooltip content={<SparklineTooltip />} />
          <Bar
            yAxisId="left"
            dataKey="good"
            stackId="events"
            fill="rgba(34,197,94,0.75)"
            isAnimationActive={false}
          />
          <Bar
            yAxisId="left"
            dataKey="failed"
            stackId="events"
            fill="rgba(239,68,68,0.75)"
            isAnimationActive={false}
          />
          {maxRate > 0 && (
            <Line
              yAxisId="right"
              dataKey="avgDataRate"
              type="monotone"
              stroke="rgba(99,102,241,0.85)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2.2: Verify TypeScript accepts the file**

```bash
npm run type-check 2>&1 | grep -i "RoamingSparkline\|roamingSparkline"
```

Expected: no output (no errors in these files).

- [ ] **Step 2.3: Commit**

```bash
git add src/components/RoamingSparkline.tsx
git commit -m "feat(sparkline): add RoamingSparkline chart renderer"
```

---

## Task 3: Wire Sparkline View into RoamingTrail

**Files:**
- Modify: `src/components/RoamingTrail.tsx`

There are four edits, each independent. Apply them in order.

- [ ] **Step 3.1: Add import at the top of RoamingTrail.tsx**

Find the existing import block at the top of the file. The last import line currently reads:
```ts
import { formatCompactNumber } from '../lib/units';
```

Add these two lines immediately after it:
```ts
import { RoamingSparkline } from './RoamingSparkline';
import { buildSparklineBuckets } from '../lib/roamingSparklineData';
import type { SparklineBucket } from '../lib/roamingSparklineData';
```

- [ ] **Step 3.2: Add viewMode state**

Find this block in the component (around line 151):
```ts
  const [hoveredEventKey, setHoveredEventKey] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  // Event correlation toggles
  const [showAPEvents, setShowAPEvents] = useState(true);
```

Add `viewMode` state on the line immediately after `hoverPos`:
```ts
  const [hoveredEventKey, setHoveredEventKey] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<'trail' | 'sparkline'>('trail');
  // Event correlation toggles
  const [showAPEvents, setShowAPEvents] = useState(true);
```

- [ ] **Step 3.3: Add memoized sparkline data**

Find this existing useMemo (around line 548):
```ts
  // Get unique APs and time range (includes correlation events)
  const { uniqueAPs, timeRange } = useMemo(() => {
```

Add the `sparklineData` memo immediately before it:
```ts
  const sparklineData: SparklineBucket[] = useMemo(
    () => buildSparklineBuckets(roamingEvents),
    [roamingEvents]
  );

  // Get unique APs and time range (includes correlation events)
  const { uniqueAPs, timeRange } = useMemo(() => {
```

- [ ] **Step 3.4: Add the view toggle to the header**

Find this exact block in the header (around line 784):
```tsx
          <div className="flex items-center gap-2">
            {/* Section toggles */}
            <div className="flex gap-1 bg-muted rounded p-0.5">
              <button
                onClick={() => setShowStats(!showStats)}
```

Replace it with:
```tsx
          <div className="flex items-center gap-2">
            {/* Section toggles */}
            <div className="flex gap-1 bg-muted rounded p-0.5">
              <button
                onClick={() => setShowStats(!showStats)}
```
But add the view toggle group **between** the section toggles group and the filter controls group. The filter controls group starts with:
```tsx
            {/* Filter controls */}
            <div className="flex gap-1 bg-muted rounded p-0.5">
```

Insert the following block immediately before `{/* Filter controls */}`:
```tsx
            {/* View mode toggle */}
            <div className="flex gap-1 bg-muted rounded p-0.5" role="group" aria-label="View mode">
              <button
                onClick={() => setViewMode('trail')}
                aria-pressed={viewMode === 'trail'}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'trail'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Standard roaming trail view"
              >
                Trail
              </button>
              <button
                onClick={() => setViewMode('sparkline')}
                aria-pressed={viewMode === 'sparkline'}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === 'sparkline'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Sparkline trend view"
              >
                Sparkline
              </button>
            </div>
```

- [ ] **Step 3.5: Replace the main content area with conditional render**

Find this exact line (around line 1097):
```tsx
      {/* Main timeline view */}
      <div className="flex-1 flex min-h-0">
```

Replace only this opening comment + div tag (not the contents):
```tsx
      {/* Main content: trail or sparkline */}
      <div className="flex-1 flex min-h-0">
        {viewMode === 'sparkline' ? (
          <div className="flex-1 overflow-auto">
            <RoamingSparkline data={sparklineData} />
          </div>
        ) : (
          <>
```

Then find the closing of the main timeline div. It currently closes at line 2330 as:
```tsx
      </div>

      {/* Attribution */}
```

Change that closing `</div>` to close the conditional correctly:
```tsx
          </>
        )}
      </div>

      {/* Attribution */}
```

- [ ] **Step 3.6: Run type-check to confirm no errors**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3.7: Run lint**

```bash
npm run lint
```

Expected: no new errors. If formatting errors appear, run `npm run format` then re-check.

- [ ] **Step 3.8: Commit**

```bash
git add src/components/RoamingTrail.tsx
git commit -m "feat(sparkline): wire Sparkline View toggle into Roaming Trail"
```

---

## Task 4: Smoke test in browser

- [ ] **Step 4.1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 4.2: Navigate to a client with roaming history**

Open a client detail page that has roaming events. Go to the Roaming Trail tab.

- [ ] **Step 4.3: Verify the Trail | Sparkline toggle is visible in the header**

The toggle should appear between the Stats/Alerts/Legend group and the 1H/24H/7D/All filter group.

- [ ] **Step 4.4: Click Sparkline — verify chart appears**

- Stacked bars should be visible (green for good, red for failed)
- If any events had dataRate data, a blue line should overlay the bars
- Hovering a bar should show the tooltip with label, event counts, and avg rate

- [ ] **Step 4.5: Click Trail — verify original view is completely unchanged**

The AP sidebar, timeline canvas, events, and all interactions must be identical to before.

- [ ] **Step 4.6: Toggle Stats/Alerts/Legend while in Sparkline view**

These panels should still show and hide correctly — they sit above the main content area and are unaffected by viewMode.

- [ ] **Step 4.7: Change time filter (1H / 24H / 7D) while in Sparkline view**

The sparkline must recompute and re-render for the new filtered event set.

- [ ] **Step 4.8: Final commit and push**

```bash
git add -A
git commit -m "feat(sparkline): complete Roaming Trail Sparkline View"
git push
```

---

## Self-Review Notes

**Spec coverage check:**
- [x] View toggle in header — Task 3.4
- [x] Trail view unchanged — Task 3.5 (trail renders inside `<>...</>`, no modifications)
- [x] Real data only — `buildSparklineBuckets` accepts the existing `roamingEvents` array, no fabrication
- [x] Stacked good/failed bars — Task 2, `Bar` with `stackId="events"`
- [x] dataRate line — Task 2, `Line` on right Y-axis, hidden if `maxRate === 0`
- [x] Tooltip — Task 2, `SparklineTooltip` custom component
- [x] Empty state — Task 2, `hasEvents` guard with Radio icon + message
- [x] Memoization — Task 3.3, `sparklineData` useMemo keyed to `roamingEvents`
- [x] Filters respected — sparkline consumes `roamingEvents` which already applies all filters
- [x] Accessibility — `aria-pressed`, `role="group"`, `role="img"`, `aria-label` — Tasks 2 and 3.4
- [x] No mock data — transformation is pure, no hardcoded values
- [x] Performance — `isAnimationActive={false}` on all chart elements, memoized input

**Type consistency check:**
- `SparklineBucket` defined in Task 1, imported in Tasks 2 and 3 — consistent
- `buildSparklineBuckets(events: RoamingEventForSparkline[])` — `RoamingEvent` in `RoamingTrail.tsx` has `timestamp: number`, `isFailedRoam?: boolean`, `dataRate?: number` — structurally satisfies `RoamingEventForSparkline` ✓
- `RoamingSparkline` accepts `data: SparklineBucket[]` — parent passes `sparklineData: SparklineBucket[]` ✓
