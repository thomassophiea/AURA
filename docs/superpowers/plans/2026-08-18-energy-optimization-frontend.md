# Energy Optimization — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Depends on:** `2026-08-18-energy-optimization-backend.md` (the `/api/energy/*` API). This plan mocks that API in tests and consumes it live in the browser-validation step.

**Goal:** Ship the `energy-optimization` page — a first-class lazy-routed nav item that renders fleet/site/AP energy intelligence, a what-if scenario builder, recommendations, and a rate/currency preferences panel, all driven by `/api/energy/*` and the app's global site/time filters.

**Architecture:** A typed API client (`energyService.ts`) wraps the same auth headers and time-range resolution the monitoring client uses. Pure math lives in `src/lib/energyCalc.ts` (null-safe, unit-tested). Data-fetching hooks (`useEnergy*`) own loading/error/success state. Presentational components under `src/components/energy/` render with existing `Card`/`Badge`/`Skeleton` primitives and Recharts, wired to `useGlobalFilters()`.

**Tech Stack:** React 19, TypeScript 5.7 strict, Vite 7, Tailwind, Radix UI, Recharts, Lucide, Vitest + React Testing Library + jsdom.

## Global Constraints

- Path alias `@/*` → `src/*`. Components: PascalCase files, ≤ ~300 lines, props via TS interfaces (no inline prop types), `React.memo` for expensive renders, Radix primitives for interactive elements, Tailwind utilities only (no inline styles / CSS modules).
- No `any` without a justification comment. Interfaces PascalCase. Optional fields use `?`.
- Every new route uses `React.lazy()` + `Suspense` with `PageSkeleton` fallback (App.tsx already wraps page content in Suspense — just register the lazy import + switch case).
- Auth + controller headers: reuse `buildMonitoringHeaders()` from `src/services/monitoringHistory.ts` (token + `X-Controller-URL`). Do not hand-roll auth.
- Time: resolve the global `timeRange` token via `resolveTimeRange(token)` from `src/lib/timeRange.ts` → `{ startIso, endIso }`. Site: `useGlobalFilters().site` ('all' means no site filter → omit `siteId`).
- Null-safe rendering: any `null`/`undefined` numeric from the API renders as `—`, never `NaN`/`Infinity`/`$NaN`.
- Data availability (spec §10): `apWithDataCount === 0` → `EnergyEmptyState`; window < 3 days → show "Limited data" note from `meta.limitationsNotes`; no rate → cost shows `—` with a "Configure rate" affordance.
- ESLint + Prettier: 2-space indent, single quotes, 100-char width, trailing comma es5. Conventional commits.
- Tests colocate as `*.test.ts(x)` beside the unit. Do not add browser/E2E here — those live in AURA-Pipeline (spec §11 "Browser validation" is a manual post-deploy step, listed last).

---

### Task 1: Energy types

**Files:**
- Create: `src/types/energy.ts`

**Interfaces:**
- Produces the response types every hook/component imports. Field names mirror the backend JSON exactly (spec §4).

- [ ] **Step 1: Write the types**

```ts
// src/types/energy.ts
/** Response and view types for the Energy Optimization API (`/api/energy/*`). */

export interface EnergyOverviewMeta {
  dataWindowDays: number | null;
  earliestSampleAt: string | null;
  limitationsNotes: string[];
}

export interface EnergyOverview {
  apWithDataCount: number;
  currentWatts: number;
  avgWatts: number;
  peakWatts: number;
  periodKwh: number;
  dailyKwhProjected: number | null;
  monthlyKwhProjected: number | null;
  annualKwhProjected: number | null;
  estimatedAnnualCost: number | null;
  currency: string;
  currencySymbol: string;
  ratePerKwh: number;
  meta: EnergyOverviewMeta;
}

export interface EnergySite {
  siteId: string;
  siteName: string;
  apWithDataCount: number;
  totalKwh: number;
  avgWattsPerAp: number;
  estimatedAnnualCost: number | null;
}

export interface EnergyAp {
  serial: string;
  apName: string;
  siteId: string | null;
  avgWatts: number;
  peakWatts: number;
  totalKwh: number;
  estimatedAnnualCost: number | null;
  sampleCount: number;
  dataQuality: 'ok' | 'sparse';
}

export type EnergyRiskLevel = 'low' | 'balanced' | 'high';
export type EnergyConfidence = 'high' | 'medium' | 'low';

export interface EnergyRecommendation {
  id: string;
  type: string;
  scope: string;
  title: string;
  explanation: string;
  affectedApCount: number;
  baselineKwh: number;
  projectedKwh: number;
  savingsKwh: number;
  savingsPercent: number | null;
  estimatedAnnualSaving: number | null;
  riskLevel: EnergyRiskLevel;
  confidenceLevel: EnergyConfidence;
  supportingData: Record<string, unknown>;
}

export interface EnergyScenarioPolicy {
  disable6GhzHours?: number[];
  disableLowUtilRadios?: boolean;
  lowUtilThresholdPercent?: number;
  afterHoursStart?: number;
  afterHoursEnd?: number;
  reduceTxPower?: boolean;
  reducePercent?: number;
}

export interface EnergyProjectionBlock {
  kwh: number;
  dailyProjected: number | null;
  monthlyProjected: number | null;
  annualProjected: number | null;
  estimatedAnnualCost: number | null;
}

export interface EnergyScenarioResult {
  scenarioId: string;
  baseline: EnergyProjectionBlock;
  simulated: EnergyProjectionBlock;
  savings: {
    kwh: number;
    percent: number | null;
    dailyKwh: number | null;
    monthlyKwh: number | null;
    annualKwh: number | null;
    annualCost: number | null;
  };
  apCount: number;
  apWithDataCount: number;
  computedAt: string;
}

export interface EnergyPreferences {
  currencyCode: string;
  currencySymbol: string;
  ratePerKwh: number;
}
```

- [ ] **Step 2: Type-check compiles**

Run: `npm run type-check`
Expected: no new errors (a types-only file has no runtime test).

- [ ] **Step 3: Commit**

```bash
git add src/types/energy.ts
git commit -m "feat(energy): add frontend energy response types"
```

---

### Task 2: Pure calc helpers (`energyCalc.ts`)

**Files:**
- Create: `src/lib/energyCalc.ts`
- Test: `src/lib/energyCalc.test.ts`

**Interfaces:**
- Produces:
  - `formatKwh(value: number | null | undefined, digits?: number): string` — `'—'` on nullish.
  - `formatWatts(value: number | null | undefined): string`
  - `formatCurrency(value: number | null | undefined, symbol: string): string` — `'—'` on nullish, never `$NaN`.
  - `formatPercent(value: number | null | undefined, digits?: number): string`
  - `trendDirection(percent: number | null): 'down' | 'up' | 'flat'`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/energyCalc.test.ts
import { describe, it, expect } from 'vitest';
import {
  formatKwh,
  formatWatts,
  formatCurrency,
  formatPercent,
  trendDirection,
} from './energyCalc';

describe('formatKwh', () => {
  it('formats with a unit', () => {
    expect(formatKwh(12.345)).toBe('12.3 kWh');
  });
  it('returns a dash for nullish', () => {
    expect(formatKwh(null)).toBe('—');
    expect(formatKwh(undefined)).toBe('—');
  });
});

describe('formatWatts', () => {
  it('formats watts', () => {
    expect(formatWatts(1847.3)).toBe('1,847 W');
  });
  it('dashes nullish', () => {
    expect(formatWatts(null)).toBe('—');
  });
});

describe('formatCurrency', () => {
  it('prefixes the symbol and groups thousands', () => {
    expect(formatCurrency(2202.79, '$')).toBe('$2,202.79');
    expect(formatCurrency(31, '€')).toBe('€31.00');
  });
  it('never renders NaN — dashes nullish', () => {
    expect(formatCurrency(null, '$')).toBe('—');
    expect(formatCurrency(undefined, '$')).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats with sign-free magnitude', () => {
    expect(formatPercent(-5.4)).toBe('-5.4%');
    expect(formatPercent(18.7)).toBe('18.7%');
  });
  it('dashes nullish', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('trendDirection', () => {
  it('maps sign to direction', () => {
    expect(trendDirection(-5)).toBe('down');
    expect(trendDirection(5)).toBe('up');
    expect(trendDirection(0)).toBe('flat');
    expect(trendDirection(null)).toBe('flat');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/energyCalc.test.ts`
Expected: FAIL — cannot resolve `./energyCalc`.

- [ ] **Step 3: Implement**

```ts
// src/lib/energyCalc.ts
/**
 * Display formatters for the Energy Optimization UI. Every formatter renders a
 * dash for nullish input so a missing measurement can never surface as "NaN"
 * or "$NaN" — the API deliberately sends null rather than a fabricated number.
 */

const DASH = '—';

function nullish(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || !Number.isFinite(value);
}

export function formatKwh(value: number | null | undefined, digits = 1): string {
  if (nullish(value)) return DASH;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })} kWh`;
}

export function formatWatts(value: number | null | undefined): string {
  if (nullish(value)) return DASH;
  return `${Math.round(value).toLocaleString('en-US')} W`;
}

export function formatCurrency(value: number | null | undefined, symbol: string): string {
  if (nullish(value)) return DASH;
  return `${symbol}${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (nullish(value)) return DASH;
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function trendDirection(percent: number | null): 'down' | 'up' | 'flat' {
  if (percent === null || !Number.isFinite(percent) || percent === 0) return 'flat';
  return percent < 0 ? 'down' : 'up';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/energyCalc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/energyCalc.ts src/lib/energyCalc.test.ts
git commit -m "feat(energy): add null-safe energy display formatters"
```

---

### Task 3: Energy API client (`energyService.ts`)

**Files:**
- Create: `src/services/energyService.ts`
- Test: `src/services/energyService.test.ts`

**Interfaces:**
- Consumes: `buildMonitoringHeaders` from `./monitoringHistory`; `resolveTimeRange` from `../lib/timeRange`; types from `../types/energy`.
- Produces (all accept an optional `AbortSignal`):
  - `getEnergyOverview(params: { site: string; timeRange: string }, signal?): Promise<EnergyOverview>`
  - `getEnergySites(params: { timeRange: string }, signal?): Promise<{ sites: EnergySite[] }>`
  - `getEnergyAps(params: { site: string; timeRange: string }, signal?): Promise<{ aps: EnergyAp[] }>`
  - `getEnergyRecommendations(params: { site: string; timeRange: string }, signal?): Promise<{ recommendations: EnergyRecommendation[] }>`
  - `postEnergyScenario(body: { name: string; policy: EnergyScenarioPolicy; siteId?: string }, signal?): Promise<EnergyScenarioResult>`
  - `getEnergyPreferences(signal?): Promise<EnergyPreferences>`
  - `putEnergyPreferences(body: { currencyCode: string; ratePerKwh: number }, signal?): Promise<EnergyPreferences>`

- [ ] **Step 1: Write the failing test (mock fetch)**

```ts
// src/services/energyService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnergyOverview, putEnergyPreferences } from './energyService';

vi.mock('./monitoringHistory', () => ({
  buildMonitoringHeaders: () => ({ Authorization: 'Bearer t', Accept: 'application/json' }),
}));

describe('energyService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('GET overview builds a start/end query from the time-range token and omits site=all', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ apWithDataCount: 3 }),
    });
    const res = await getEnergyOverview({ site: 'all', timeRange: '24h' });
    expect(res.apWithDataCount).toBe(3);
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/api/energy/overview?');
    expect(url).toContain('start=');
    expect(url).toContain('end=');
    expect(url).not.toContain('siteId=all');
  });

  it('includes siteId when a concrete site is selected', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await getEnergyOverview({ site: 'site-42', timeRange: '24h' });
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('siteId=site-42');
  });

  it('throws on a non-ok response', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad range' }),
    });
    await expect(getEnergyOverview({ site: 'all', timeRange: '24h' })).rejects.toThrow();
  });

  it('PUT preferences posts a JSON body', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ currencyCode: 'EUR', currencySymbol: '€', ratePerKwh: 0.31 }),
    });
    const res = await putEnergyPreferences({ currencyCode: 'EUR', ratePerKwh: 0.31 });
    expect(res.currencySymbol).toBe('€');
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ currencyCode: 'EUR', ratePerKwh: 0.31 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/services/energyService.test.ts`
Expected: FAIL — cannot resolve `./energyService`.

- [ ] **Step 3: Implement**

```ts
// src/services/energyService.ts
/**
 * Typed client for AURA's energy API (`/api/energy/*`). Reuses the monitoring
 * auth headers (controller token + X-Controller-URL) and resolves the global
 * time-range token to concrete start/end instants, exactly like the monitoring
 * history client, so responses are scoped to the controller in view.
 */

import { buildMonitoringHeaders } from './monitoringHistory';
import { resolveTimeRange } from '../lib/timeRange';
import type {
  EnergyOverview,
  EnergySite,
  EnergyAp,
  EnergyRecommendation,
  EnergyScenarioPolicy,
  EnergyScenarioResult,
  EnergyPreferences,
} from '../types/energy';

const BASE = '/api/energy';

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === 'all') continue;
    search.set(key, value);
  }
  const q = search.toString();
  return q ? `?${q}` : '';
}

function windowParams(timeRange: string): { start: string; end: string } {
  const { startIso, endIso } = resolveTimeRange(timeRange);
  return { start: startIso, end: endIso };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...buildMonitoringHeaders(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) detail = body.error;
    } catch {
      // non-JSON error body; keep the status-based message
    }
    throw new Error(`Energy request failed: ${detail}`);
  }
  return (await response.json()) as T;
}

export function getEnergyOverview(
  params: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<EnergyOverview> {
  const { start, end } = windowParams(params.timeRange);
  return request<EnergyOverview>(
    `/overview${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function getEnergySites(
  params: { timeRange: string },
  signal?: AbortSignal
): Promise<{ sites: EnergySite[] }> {
  const { start, end } = windowParams(params.timeRange);
  return request<{ sites: EnergySite[] }>(`/sites${buildQuery({ start, end })}`, { signal });
}

export function getEnergyAps(
  params: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<{ aps: EnergyAp[] }> {
  const { start, end } = windowParams(params.timeRange);
  return request<{ aps: EnergyAp[] }>(
    `/aps${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function getEnergyRecommendations(
  params: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<{ recommendations: EnergyRecommendation[] }> {
  const { start, end } = windowParams(params.timeRange);
  return request<{ recommendations: EnergyRecommendation[] }>(
    `/recommendations${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function postEnergyScenario(
  body: { name: string; policy: EnergyScenarioPolicy; siteId?: string },
  signal?: AbortSignal
): Promise<EnergyScenarioResult> {
  return request<EnergyScenarioResult>('/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function getEnergyPreferences(signal?: AbortSignal): Promise<EnergyPreferences> {
  return request<EnergyPreferences>('/preferences', { signal });
}

export function putEnergyPreferences(
  body: { currencyCode: string; ratePerKwh: number },
  signal?: AbortSignal
): Promise<EnergyPreferences> {
  return request<EnergyPreferences>('/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/services/energyService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/energyService.ts src/services/energyService.test.ts
git commit -m "feat(energy): add typed energyService API client"
```

---

### Task 4: Data hooks (`useEnergyOverview`, `useEnergySites`, `useEnergyAps`, `useEnergyRecommendations`)

**Files:**
- Create: `src/hooks/useEnergyData.ts` (one file exporting the four read hooks — they share an identical fetch/abort/state pattern; DRY)
- Test: `src/hooks/useEnergyData.test.tsx`

**Interfaces:**
- Consumes: `useGlobalFilters` from `./useGlobalFilters`; the four getters from `../services/energyService`.
- Produces each hook returning `{ data: T | null; loading: boolean; error: string | null; refetch: () => void }`:
  - `useEnergyOverview(): { data: EnergyOverview | null; loading; error; refetch }`
  - `useEnergySites(): { data: EnergySite[] | null; loading; error; refetch }`
  - `useEnergyAps(enabled: boolean): { data: EnergyAp[] | null; loading; error; refetch }` — `enabled=false` skips fetch (drill-down is lazy).
  - `useEnergyRecommendations(): { data: EnergyRecommendation[] | null; loading; error; refetch }`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/useEnergyData.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEnergyOverview, useEnergyAps } from './useEnergyData';

vi.mock('./useGlobalFilters', () => ({
  useGlobalFilters: () => ({ site: 'all', timeRange: '24h', environment: 'all' }),
}));

const getEnergyOverview = vi.fn();
const getEnergyAps = vi.fn();
vi.mock('../services/energyService', () => ({
  getEnergyOverview: (...args: unknown[]) => getEnergyOverview(...args),
  getEnergyAps: (...args: unknown[]) => getEnergyAps(...args),
  getEnergySites: vi.fn(),
  getEnergyRecommendations: vi.fn(),
}));

describe('useEnergyOverview', () => {
  beforeEach(() => {
    getEnergyOverview.mockReset();
    getEnergyAps.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('loads and exposes data', async () => {
    getEnergyOverview.mockResolvedValue({ apWithDataCount: 5 });
    const { result } = renderHook(() => useEnergyOverview());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ apWithDataCount: 5 });
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error message on rejection', async () => {
    getEnergyOverview.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEnergyOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
    expect(result.current.data).toBeNull();
  });
});

describe('useEnergyAps', () => {
  it('does not fetch when disabled', async () => {
    const { result } = renderHook(() => useEnergyAps(false));
    expect(result.current.loading).toBe(false);
    expect(getEnergyAps).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/hooks/useEnergyData.test.tsx`
Expected: FAIL — cannot resolve `./useEnergyData`.

- [ ] **Step 3: Implement**

```tsx
// src/hooks/useEnergyData.ts
/**
 * Read hooks for the Energy Optimization page. Each owns loading/error/success
 * for one API view, re-fetches when the global site or time-range filter
 * changes, and aborts the in-flight request on unmount or filter change so a
 * slow response cannot overwrite a newer one.
 */

import { useCallback, useEffect, useState } from 'react';

import { useGlobalFilters } from './useGlobalFilters';
import {
  getEnergyOverview,
  getEnergySites,
  getEnergyAps,
  getEnergyRecommendations,
} from '../services/energyService';
import type {
  EnergyOverview,
  EnergySite,
  EnergyAp,
  EnergyRecommendation,
} from '../types/energy';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

/** Shared fetch/abort/state machine. `fetcher` receives the current filters + signal. */
function useEnergyResource<T>(
  fetcher: (
    filters: { site: string; timeRange: string },
    signal: AbortSignal
  ) => Promise<T>,
  deps: unknown[],
  enabled = true
): AsyncState<T> {
  const { site, timeRange } = useGlobalFilters();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetcher({ site, timeRange }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(messageOf(err));
        setData(null);
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, timeRange, nonce, enabled, ...deps]);

  return { data, loading, error, refetch };
}

export function useEnergyOverview(): AsyncState<EnergyOverview> {
  return useEnergyResource(
    (filters, signal) => getEnergyOverview(filters, signal),
    []
  );
}

export function useEnergySites(): AsyncState<EnergySite[]> {
  return useEnergyResource(
    async (filters, signal) => (await getEnergySites(filters, signal)).sites,
    []
  );
}

export function useEnergyAps(enabled: boolean): AsyncState<EnergyAp[]> {
  return useEnergyResource(
    async (filters, signal) => (await getEnergyAps(filters, signal)).aps,
    [],
    enabled
  );
}

export function useEnergyRecommendations(): AsyncState<EnergyRecommendation[]> {
  return useEnergyResource(
    async (filters, signal) => (await getEnergyRecommendations(filters, signal)).recommendations,
    []
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/hooks/useEnergyData.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEnergyData.ts src/hooks/useEnergyData.test.tsx
git commit -m "feat(energy): add energy data hooks (overview, sites, aps, recommendations)"
```

---

### Task 5: Overview cards + empty state

**Files:**
- Create: `src/components/energy/EnergyOverviewCards.tsx`
- Create: `src/components/energy/EnergyEmptyState.tsx`
- Test: `src/components/energy/EnergyOverviewCards.test.tsx`

**Interfaces:**
- Consumes: `Card`/`CardHeader`/`CardContent` from `@/components/ui/card`; `Badge` from `@/components/ui/badge`; `Skeleton` from `@/components/ui/skeleton`; formatters from `@/lib/energyCalc`; `EnergyOverview` type; Lucide `Zap`, `DollarSign`, `TrendingDown`, `TrendingUp`, `Wifi`, `AlertTriangle`.
- Produces:
  - `EnergyOverviewCards({ overview, loading }: { overview: EnergyOverview | null; loading: boolean })`
  - `EnergyEmptyState({ reason }: { reason: 'no-collection' | 'no-data' })`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/energy/EnergyOverviewCards.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyOverviewCards } from './EnergyOverviewCards';
import type { EnergyOverview } from '@/types/energy';

const overview: EnergyOverview = {
  apWithDataCount: 82,
  currentWatts: 1847.3,
  avgWatts: 1792.1,
  peakWatts: 2104.8,
  periodKwh: 301.4,
  dailyKwhProjected: 43.1,
  monthlyKwhProjected: 1292.3,
  annualKwhProjected: 15734.2,
  estimatedAnnualCost: 2202.79,
  currency: 'USD',
  currencySymbol: '$',
  ratePerKwh: 0.14,
  meta: { dataWindowDays: 7, earliestSampleAt: null, limitationsNotes: [] },
};

describe('EnergyOverviewCards', () => {
  it('renders formatted kWh and cost', () => {
    render(<EnergyOverviewCards overview={overview} loading={false} />);
    expect(screen.getByText('301.4 kWh')).toBeInTheDocument();
    expect(screen.getByText('$2,202.79')).toBeInTheDocument();
    expect(screen.getByText(/82/)).toBeInTheDocument();
  });

  it('renders a dash instead of $NaN when cost is null', () => {
    render(
      <EnergyOverviewCards overview={{ ...overview, estimatedAnnualCost: null }} loading={false} />
    );
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows skeletons while loading', () => {
    const { container } = render(<EnergyOverviewCards overview={null} loading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});
```

> If the skeleton primitive does not expose `data-slot="skeleton"`, `grep -n "data-slot\|role=" src/components/ui/skeleton.tsx` and assert on the actual attribute/class it renders.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/energy/EnergyOverviewCards.test.tsx`
Expected: FAIL — cannot resolve `./EnergyOverviewCards`.

- [ ] **Step 3: Implement both components**

```tsx
// src/components/energy/EnergyEmptyState.tsx
import { AlertTriangle } from 'lucide-react';

interface EnergyEmptyStateProps {
  reason: 'no-collection' | 'no-data';
}

const COPY: Record<EnergyEmptyStateProps['reason'], { title: string; body: string }> = {
  'no-collection': {
    title: 'AP power data collection is not enabled',
    body: 'Contact your administrator to enable MONITORING_AP_REPORTS_ENABLED so energy telemetry can be collected.',
  },
  'no-data': {
    title: 'No power data in this window',
    body: 'No access points reported power telemetry for the selected site and time range. Try widening the time range.',
  },
};

export function EnergyEmptyState({ reason }: EnergyEmptyStateProps) {
  const { title, body } = COPY[reason];
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
```

```tsx
// src/components/energy/EnergyOverviewCards.tsx
import { memo } from 'react';
import { Zap, DollarSign, TrendingDown, TrendingUp, Wifi, Gauge } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatWatts, formatCurrency } from '@/lib/energyCalc';
import type { EnergyOverview } from '@/types/energy';

interface EnergyOverviewCardsProps {
  overview: EnergyOverview | null;
  loading: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function EnergyOverviewCardsComponent({ overview, loading }: EnergyOverviewCardsProps) {
  if (loading || !overview) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const TrendIcon = TrendingDown;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        icon={Zap}
        label="Energy this period"
        value={formatKwh(overview.periodKwh)}
        sub={`${formatKwh(overview.annualKwhProjected)} projected annually`}
      />
      <StatCard
        icon={DollarSign}
        label="Estimated annual cost"
        value={formatCurrency(overview.estimatedAnnualCost, overview.currencySymbol)}
        sub={`at ${overview.currencySymbol}${overview.ratePerKwh}/kWh`}
      />
      <StatCard
        icon={Gauge}
        label="Current draw"
        value={formatWatts(overview.currentWatts)}
        sub={`peak ${formatWatts(overview.peakWatts)}`}
      />
      <StatCard
        icon={TrendIcon}
        label="Average draw"
        value={formatWatts(overview.avgWatts)}
      />
      <StatCard
        icon={Wifi}
        label="APs reporting"
        value={`${overview.apWithDataCount}`}
        sub="with power telemetry"
      />
      <StatCard
        icon={TrendingUp}
        label="Daily projection"
        value={formatKwh(overview.dailyKwhProjected)}
      />
    </div>
  );
}

export const EnergyOverviewCards = memo(EnergyOverviewCardsComponent);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/energy/EnergyOverviewCards.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/energy/EnergyOverviewCards.tsx src/components/energy/EnergyEmptyState.tsx src/components/energy/EnergyOverviewCards.test.tsx
git commit -m "feat(energy): add overview cards and empty-state components"
```

---

### Task 6: Site rankings + AP drill-down tables

**Files:**
- Create: `src/components/energy/EnergySiteRankings.tsx`
- Create: `src/components/energy/EnergyApTable.tsx`
- Test: `src/components/energy/EnergySiteRankings.test.tsx`

**Interfaces:**
- Consumes: `Card`/`CardHeader`/`CardContent`; `Badge`; formatters; `EnergySite`/`EnergyAp` types; `useEnergyAps` hook (AP table fetches its own data lazily when expanded).
- Produces:
  - `EnergySiteRankings({ sites, loading, onSelectSite }: { sites: EnergySite[] | null; loading: boolean; onSelectSite: (siteId: string) => void })`
  - `EnergyApTable({ enabled }: { enabled: boolean })` — renders the AP breakdown for the current filters; fetches only when `enabled`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/energy/EnergySiteRankings.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnergySiteRankings } from './EnergySiteRankings';
import type { EnergySite } from '@/types/energy';

const sites: EnergySite[] = [
  { siteId: 's1', siteName: 'HQ', apWithDataCount: 40, totalKwh: 210.5, avgWattsPerAp: 12.4, estimatedAnnualCost: 1200.5 },
  { siteId: 's2', siteName: 'Branch', apWithDataCount: 10, totalKwh: 55.1, avgWattsPerAp: 11.1, estimatedAnnualCost: 300.25 },
];

describe('EnergySiteRankings', () => {
  it('renders one row per site with formatted values', () => {
    render(<EnergySiteRankings sites={sites} loading={false} onSelectSite={() => {}} />);
    expect(screen.getByText('HQ')).toBeInTheDocument();
    expect(screen.getByText('210.5 kWh')).toBeInTheDocument();
    expect(screen.getByText('$1,200.50')).toBeInTheDocument();
  });

  it('invokes onSelectSite when a row is clicked', () => {
    const onSelectSite = vi.fn();
    render(<EnergySiteRankings sites={sites} loading={false} onSelectSite={onSelectSite} />);
    fireEvent.click(screen.getByText('Branch'));
    expect(onSelectSite).toHaveBeenCalledWith('s2');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/energy/EnergySiteRankings.test.tsx`
Expected: FAIL — cannot resolve `./EnergySiteRankings`.

- [ ] **Step 3: Implement both tables**

```tsx
// src/components/energy/EnergySiteRankings.tsx
import { memo } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatWatts, formatCurrency } from '@/lib/energyCalc';
import type { EnergySite } from '@/types/energy';

interface EnergySiteRankingsProps {
  sites: EnergySite[] | null;
  loading: boolean;
  onSelectSite: (siteId: string) => void;
}

function EnergySiteRankingsComponent({ sites, loading, onSelectSite }: EnergySiteRankingsProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-foreground">Sites by energy use</h3>
      </CardHeader>
      <CardContent>
        {loading || !sites ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No site data in range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Site</th>
                <th className="py-2 font-medium">APs</th>
                <th className="py-2 font-medium">Energy</th>
                <th className="py-2 font-medium">Avg/AP</th>
                <th className="py-2 font-medium">Annual cost</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr
                  key={site.siteId}
                  className="cursor-pointer border-b border-border/50 hover:bg-muted/50"
                  onClick={() => onSelectSite(site.siteId)}
                >
                  <td className="py-2 font-medium text-foreground">{site.siteName}</td>
                  <td className="py-2 text-muted-foreground">{site.apWithDataCount}</td>
                  <td className="py-2 text-foreground">{formatKwh(site.totalKwh)}</td>
                  <td className="py-2 text-muted-foreground">{formatWatts(site.avgWattsPerAp)}</td>
                  <td className="py-2 text-foreground">
                    {formatCurrency(site.estimatedAnnualCost, '$')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export const EnergySiteRankings = memo(EnergySiteRankingsComponent);
```

```tsx
// src/components/energy/EnergyApTable.tsx
import { memo } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatWatts, formatCurrency } from '@/lib/energyCalc';
import { useEnergyAps } from '@/hooks/useEnergyData';

interface EnergyApTableProps {
  enabled: boolean;
}

function EnergyApTableComponent({ enabled }: EnergyApTableProps) {
  const { data: aps, loading, error } = useEnergyAps(enabled);

  if (!enabled) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-foreground">Access points</h3>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : loading || !aps ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : aps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No AP data in range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">AP</th>
                <th className="py-2 font-medium">Avg</th>
                <th className="py-2 font-medium">Peak</th>
                <th className="py-2 font-medium">Energy</th>
                <th className="py-2 font-medium">Annual cost</th>
                <th className="py-2 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {aps.map((ap) => (
                <tr key={ap.serial} className="border-b border-border/50">
                  <td className="py-2 font-medium text-foreground">{ap.apName}</td>
                  <td className="py-2 text-muted-foreground">{formatWatts(ap.avgWatts)}</td>
                  <td className="py-2 text-muted-foreground">{formatWatts(ap.peakWatts)}</td>
                  <td className="py-2 text-foreground">{formatKwh(ap.totalKwh)}</td>
                  <td className="py-2 text-foreground">
                    {formatCurrency(ap.estimatedAnnualCost, '$')}
                  </td>
                  <td className="py-2">
                    <Badge variant={ap.dataQuality === 'ok' ? 'secondary' : 'outline'}>
                      {ap.dataQuality === 'ok' ? 'OK' : 'Sparse'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export const EnergyApTable = memo(EnergyApTableComponent);
```

> Verify `Badge` variant names against `src/components/ui/badge.tsx` (`grep -n "variant" src/components/ui/badge.tsx`) and swap to real ones if `secondary`/`outline` don't exist.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/energy/EnergySiteRankings.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/energy/EnergySiteRankings.tsx src/components/energy/EnergyApTable.tsx src/components/energy/EnergySiteRankings.test.tsx
git commit -m "feat(energy): add site rankings and AP drill-down tables"
```

---

### Task 7: Scenario builder + recommendations + preferences

**Files:**
- Create: `src/components/energy/EnergyScenarioBuilder.tsx`
- Create: `src/components/energy/EnergyRecommendations.tsx`
- Create: `src/components/energy/EnergyPreferencesPanel.tsx`
- Test: `src/components/energy/EnergyScenarioBuilder.test.tsx`

**Interfaces:**
- Consumes: `postEnergyScenario`, `putEnergyPreferences`, `getEnergyPreferences` from `@/services/energyService`; `useEnergyRecommendations` hook; `Card`/`Badge`/`Skeleton`; formatters; types; `useGlobalFilters` for `site`.
- Produces:
  - `EnergyScenarioBuilder()` — toggle controls → `postEnergyScenario` → side-by-side baseline/simulated/savings; shows a "modeled estimate" caveat.
  - `EnergyRecommendations({ recommendations, loading }: { recommendations: EnergyRecommendation[] | null; loading: boolean })`
  - `EnergyPreferencesPanel({ onSaved }: { onSaved: (prefs: EnergyPreferences) => void })`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/energy/EnergyScenarioBuilder.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnergyScenarioBuilder } from './EnergyScenarioBuilder';

vi.mock('@/hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ site: 'all', timeRange: '24h', environment: 'all' }),
}));

const postEnergyScenario = vi.fn();
vi.mock('@/services/energyService', () => ({
  postEnergyScenario: (...a: unknown[]) => postEnergyScenario(...a),
}));

describe('EnergyScenarioBuilder', () => {
  beforeEach(() => postEnergyScenario.mockReset());

  it('runs a scenario and displays savings', async () => {
    postEnergyScenario.mockResolvedValue({
      scenarioId: 'sc-1',
      baseline: { kwh: 100, dailyProjected: 14, monthlyProjected: 420, annualProjected: 5110, estimatedAnnualCost: 715.4 },
      simulated: { kwh: 80, dailyProjected: 11.2, monthlyProjected: 336, annualProjected: 4088, estimatedAnnualCost: 572.3 },
      savings: { kwh: 20, percent: 20, dailyKwh: 2.8, monthlyKwh: 84, annualKwh: 1022, annualCost: 143.1 },
      apCount: 5,
      apWithDataCount: 5,
      computedAt: '2026-08-18T00:00:00Z',
    });
    render(<EnergyScenarioBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    await waitFor(() => expect(screen.getByText('20.0%')).toBeInTheDocument());
    expect(postEnergyScenario).toHaveBeenCalledTimes(1);
  });

  it('shows an error if the scenario fails', async () => {
    postEnergyScenario.mockRejectedValue(new Error('nope'));
    render(<EnergyScenarioBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    await waitFor(() => expect(screen.getByText(/nope/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/energy/EnergyScenarioBuilder.test.tsx`
Expected: FAIL — cannot resolve `./EnergyScenarioBuilder`.

- [ ] **Step 3: Implement the three components**

```tsx
// src/components/energy/EnergyScenarioBuilder.tsx
import { useState } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatKwh, formatPercent, formatCurrency } from '@/lib/energyCalc';
import { postEnergyScenario } from '@/services/energyService';
import { useGlobalFilters } from '@/hooks/useGlobalFilters';
import type { EnergyScenarioPolicy, EnergyScenarioResult } from '@/types/energy';

const OVERNIGHT_HOURS = [0, 1, 2, 3, 4, 5];

export function EnergyScenarioBuilder() {
  const { site } = useGlobalFilters();
  const [disable6Ghz, setDisable6Ghz] = useState(true);
  const [disableLowUtil, setDisableLowUtil] = useState(false);
  const [reduceTxPower, setReduceTxPower] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnergyScenarioResult | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    const policy: EnergyScenarioPolicy = {};
    if (disable6Ghz) policy.disable6GhzHours = OVERNIGHT_HOURS;
    if (disableLowUtil) {
      policy.disableLowUtilRadios = true;
      policy.lowUtilThresholdPercent = 5;
    }
    if (reduceTxPower) {
      policy.reduceTxPower = true;
      policy.afterHoursStart = 22;
      policy.afterHoursEnd = 6;
      policy.reducePercent = 20;
    }
    try {
      const res = await postEnergyScenario({
        name: 'Interactive scenario',
        policy,
        siteId: site === 'all' ? undefined : site,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scenario failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">What-if scenario</h3>
          <Badge variant="outline">Modeled estimate</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={disable6Ghz} onChange={(e) => setDisable6Ghz(e.target.checked)} />
            Disable 6 GHz radios overnight (00:00–06:00)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={disableLowUtil} onChange={(e) => setDisableLowUtil(e.target.checked)} />
            Disable radios under 5% utilization
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={reduceTxPower} onChange={(e) => setReduceTxPower(e.target.checked)} />
            Reduce Tx power 20% after hours (22:00–06:00)
          </label>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run scenario'}
        </button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {result ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="text-lg font-semibold">{formatKwh(result.baseline.annualProjected)}/yr</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(result.baseline.estimatedAnnualCost, '$')}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Optimized</p>
              <p className="text-lg font-semibold">{formatKwh(result.simulated.annualProjected)}/yr</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(result.simulated.estimatedAnnualCost, '$')}
              </p>
            </div>
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="text-xs text-muted-foreground">Savings</p>
              <p className="text-lg font-semibold text-emerald-600">
                {formatPercent(result.savings.percent)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(result.savings.annualCost, '$')}/yr
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/energy/EnergyRecommendations.tsx
import { memo } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatPercent, formatCurrency } from '@/lib/energyCalc';
import type { EnergyRecommendation, EnergyConfidence } from '@/types/energy';

const CONFIDENCE_VARIANT: Record<EnergyConfidence, 'secondary' | 'outline'> = {
  high: 'secondary',
  medium: 'outline',
  low: 'outline',
};

interface EnergyRecommendationsProps {
  recommendations: EnergyRecommendation[] | null;
  loading: boolean;
}

function EnergyRecommendationsComponent({ recommendations, loading }: EnergyRecommendationsProps) {
  if (loading || !recommendations) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No recommendations for this window — the fleet is already efficient, or there is not
          enough data yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {recommendations.map((rec) => (
        <Card key={rec.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground">{rec.title}</h4>
              <div className="flex gap-2">
                <Badge variant={rec.riskLevel === 'low' ? 'secondary' : 'outline'}>
                  {rec.riskLevel} risk
                </Badge>
                <Badge variant={CONFIDENCE_VARIANT[rec.confidenceLevel]}>
                  {rec.confidenceLevel} confidence
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{rec.explanation}</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>Affects <strong>{rec.affectedApCount}</strong> APs</span>
              <span>Saves <strong>{formatKwh(rec.savingsKwh)}</strong> ({formatPercent(rec.savingsPercent)})</span>
              <span><strong>{formatCurrency(rec.estimatedAnnualSaving, '$')}</strong>/yr</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const EnergyRecommendations = memo(EnergyRecommendationsComponent);
```

```tsx
// src/components/energy/EnergyPreferencesPanel.tsx
import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getEnergyPreferences, putEnergyPreferences } from '@/services/energyService';
import type { EnergyPreferences } from '@/types/energy';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

interface EnergyPreferencesPanelProps {
  onSaved: (prefs: EnergyPreferences) => void;
}

export function EnergyPreferencesPanel({ onSaved }: EnergyPreferencesPanelProps) {
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [rate, setRate] = useState('0.14');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getEnergyPreferences(controller.signal)
      .then((p) => {
        setCurrencyCode(p.currencyCode);
        setRate(String(p.ratePerKwh));
      })
      .catch(() => {
        /* defaults stand if prefs cannot be loaded */
      });
    return () => controller.abort();
  }, []);

  async function save() {
    const ratePerKwh = Number(rate);
    if (!Number.isFinite(ratePerKwh) || ratePerKwh <= 0) {
      setError('Enter a positive rate.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await putEnergyPreferences({ currencyCode, ratePerKwh });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-foreground">Electricity rate</h3>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Currency</span>
          <select
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Rate per kWh</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/energy/EnergyScenarioBuilder.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/energy/EnergyScenarioBuilder.tsx src/components/energy/EnergyRecommendations.tsx src/components/energy/EnergyPreferencesPanel.tsx src/components/energy/EnergyScenarioBuilder.test.tsx
git commit -m "feat(energy): add scenario builder, recommendations, preferences panel"
```

---

### Task 8: Page shell (`EnergyOptimization.tsx`)

**Files:**
- Create: `src/components/energy/EnergyOptimization.tsx`
- Test: `src/components/energy/EnergyOptimization.test.tsx`

**Interfaces:**
- Consumes: all hooks and components from Tasks 4–7; `EnergyEmptyState`.
- Produces: `EnergyOptimization()` default-and-named export — the page composition. Renders overview cards, then a two-column layout: site rankings + AP table on the left, scenario builder + recommendations + preferences on the right. Shows `EnergyEmptyState reason="no-data"` when `overview.apWithDataCount === 0`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/energy/EnergyOptimization.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyOptimization } from './EnergyOptimization';

vi.mock('@/hooks/useEnergyData', () => ({
  useEnergyOverview: () => ({
    data: {
      apWithDataCount: 0,
      currentWatts: 0, avgWatts: 0, peakWatts: 0, periodKwh: 0,
      dailyKwhProjected: null, monthlyKwhProjected: null, annualKwhProjected: null,
      estimatedAnnualCost: null, currency: 'USD', currencySymbol: '$', ratePerKwh: 0.14,
      meta: { dataWindowDays: 0, earliestSampleAt: null, limitationsNotes: [] },
    },
    loading: false, error: null, refetch: () => {},
  }),
  useEnergySites: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useEnergyAps: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useEnergyRecommendations: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
}));

describe('EnergyOptimization', () => {
  it('renders the empty state when no APs report power', () => {
    render(<EnergyOptimization />);
    expect(screen.getByText(/No power data in this window/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/energy/EnergyOptimization.test.tsx`
Expected: FAIL — cannot resolve `./EnergyOptimization`.

- [ ] **Step 3: Implement the page shell**

```tsx
// src/components/energy/EnergyOptimization.tsx
import { useState } from 'react';

import {
  useEnergyOverview,
  useEnergySites,
  useEnergyRecommendations,
} from '@/hooks/useEnergyData';
import { EnergyOverviewCards } from './EnergyOverviewCards';
import { EnergyEmptyState } from './EnergyEmptyState';
import { EnergySiteRankings } from './EnergySiteRankings';
import { EnergyApTable } from './EnergyApTable';
import { EnergyScenarioBuilder } from './EnergyScenarioBuilder';
import { EnergyRecommendations } from './EnergyRecommendations';
import { EnergyPreferencesPanel } from './EnergyPreferencesPanel';
import { useGlobalFilters } from '@/hooks/useGlobalFilters';

export function EnergyOptimization() {
  const { updateFilter } = useGlobalFilters();
  const overview = useEnergyOverview();
  const sites = useEnergySites();
  const recommendations = useEnergyRecommendations();
  const [apTableEnabled, setApTableEnabled] = useState(false);

  const noData = overview.data !== null && overview.data.apWithDataCount === 0;

  return (
    <div className="space-y-6 p-6">
      {overview.data?.meta.limitationsNotes.map((note) => (
        <div
          key={note}
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          {note}
        </div>
      ))}

      <EnergyOverviewCards overview={overview.data} loading={overview.loading} />

      {noData ? (
        <EnergyEmptyState reason="no-data" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <EnergySiteRankings
              sites={sites.data}
              loading={sites.loading}
              onSelectSite={(siteId) => {
                updateFilter('site', siteId);
                setApTableEnabled(true);
              }}
            />
            <EnergyApTable enabled={apTableEnabled} />
          </div>
          <div className="space-y-6">
            <EnergyScenarioBuilder />
            <EnergyRecommendations
              recommendations={recommendations.data}
              loading={recommendations.loading}
            />
            <EnergyPreferencesPanel onSaved={() => overview.refetch()} />
          </div>
        </div>
      )}
    </div>
  );
}

export default EnergyOptimization;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/energy/EnergyOptimization.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/energy/EnergyOptimization.tsx src/components/energy/EnergyOptimization.test.tsx
git commit -m "feat(energy): add EnergyOptimization page shell"
```

---

### Task 9: Wire navigation and routing

**Files:**
- Modify: `src/components/Sidebar.tsx` (add to `monitoringItems`, ~line 66-73)
- Modify: `src/App.tsx` (lazy import ~line 111; page-meta map ~line 199; render switch ~line 1199)

**Interfaces:**
- Consumes: `EnergyOptimization` default export.
- Produces: nav item `energy-optimization` visible under Monitoring; `currentPage === 'energy-optimization'` renders the lazy page inside the existing Suspense/PageSkeleton wrapper.

- [ ] **Step 1: Add the sidebar nav item**

In `src/components/Sidebar.tsx`, add to the `monitoringItems` array (after the `connected-clients` entry, ~line 70). `Zap` is already imported (line 16):

```tsx
  { id: 'energy-optimization', label: 'Energy', icon: Zap },
```

- [ ] **Step 2: Add the lazy import in App.tsx**

Beside the other monitoring-page lazy imports (near `src/App.tsx:111`):

```tsx
const EnergyOptimization = lazy(() =>
  import('./components/energy/EnergyOptimization').then((m) => ({ default: m.EnergyOptimization }))
);
```

- [ ] **Step 3: Add the page-meta entry**

In the page-meta map (near `src/App.tsx:199`, beside `'app-insights'`):

```tsx
  'energy-optimization': {
    title: 'Energy Optimization',
    description: 'Fleet energy use, cost, and savings scenarios from AP power telemetry',
  },
```

- [ ] **Step 4: Add the render switch case**

In the `renderContent`/`switch (currentPage)` block (near `src/App.tsx:1199`, beside `case 'app-insights'`):

```tsx
      case 'energy-optimization':
        return <EnergyOptimization />;
```

- [ ] **Step 5: Verify type-check, lint, and the page renders in-app**

Run:
```bash
npm run type-check
npm run lint -- src/components/energy src/App.tsx src/components/Sidebar.tsx
npx vitest run src/components/energy src/hooks/useEnergyData.test.tsx src/services/energyService.test.ts src/lib/energyCalc.test.ts
```
Expected: type-check clean; lint clean; all energy tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx
git commit -m "feat(energy): add Energy Optimization to nav and routing"
```

---

### Task 10: Manual browser validation (Integration only)

**Files:** none (verification step; spec §11 "Browser validation").

**This task has no code.** It gates the feature as demo-ready. Do not deploy to Production Demo.

- [ ] **Step 1: Build to confirm the bundle compiles**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 2: Deploy to Integration and load the page**

Use the ArchAngel/AURA deploy path for Integration (`https://integration.up.railway.app/`). Confirm `MONITORING_AP_REPORTS_ENABLED=true` is set there; if power data is absent, the page must show `EnergyEmptyState reason="no-data"` (not a crash).

- [ ] **Step 3: Exercise and record results in the plan**

Verify and note pass/fail with evidence:
- Overview cards populate; no `NaN`/`$NaN` anywhere.
- Site rankings render; clicking a site sets the global site filter and reveals the AP table.
- Time-range switch re-fetches all panels.
- Run a scenario; savings numbers are internally consistent (savings = baseline − simulated).
- Save a EUR rate; costs re-render with `€` and the new rate.
- Browser console has no errors.
- Regression: Dashboard, AP Insights, Clients, Sites still load.

- [ ] **Step 4: Record the audit artifact**

Per global instructions, write findings to `audit/energy-optimization-<date>.md` (screenshots to `screenshots/`), then report completion.

---

## Self-Review Notes (author verification)

- **Spec §8 component tree** → Tasks 5–8 create every named component: overview cards, trends note (limitations banner surfaces the trend/limitation copy; a full `EnergyTrendsChart` using the existing `/api/monitoring/history` is a fast-follow — flagged below), site rankings, AP table, scenario builder, recommendations, preferences, empty state. ✓ (trends chart deferred)
- **Spec §8 pure math** → Task 2 covers the display formatters; the numeric projections/cost math lives server-side (backend plan Task 1), so the frontend `energyCalc` is presentation-only by design. ✓
- **Spec §10 data availability** → Task 5 (empty state), Task 8 (limitations banner, `apWithDataCount===0` → empty state), formatters render `—` for null cost/rate. ✓
- **Spec §11 frontend tests** → `energyCalc` (Task 2), `useEnergyOverview` states (Task 4), `EnergyOverviewCards` values + null (Task 5), scenario submission (Task 7), currency USD/EUR (Task 2 + Task 3). ✓
- **Type consistency:** hook return shape `{ data, loading, error, refetch }` is uniform across Task 4 and consumed identically in Tasks 5–8. `EnergyScenarioResult.savings.percent` (Task 1) is what Task 7 formats. Service getter signatures in Task 3 match the calls in Task 4. ✓
- **Known fast-follow (not blockers):**
  - `EnergyTrendsChart` (Recharts area over `/api/monitoring/history`, `ap_report` family) — spec §8; add as Task 11 once the core page is verified.
  - `RecommendationDetail` slideout and `ScenarioResultCard` extraction — spec names them; folded into `EnergyRecommendations`/`EnergyScenarioBuilder` for the first cut, split if either file approaches ~300 lines.
  - Confirm `Badge` variant names and `Skeleton` test attribute against the real primitives during implementation (noted inline in Tasks 5–6).
