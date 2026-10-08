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
  EnvironmentalReport,
  EnvironmentalReportRequest,
  LightAwareSummary,
  LightAwareApRow,
  LightAwarePolicy,
  LightAwareObserved,
} from '../types/energy';

const BASE = '/api/energy';

/**
 * Which collector an energy figure came from. `measured_ap_state` is the AP's
 * measured PoE draw from the AP inventory (primary); `ap_report` is the per-AP
 * report timeseries, used only where no measured sample exists.
 */
export type PowerSource = 'measured_ap_state' | 'ap_report';

export interface PowerProvenance {
  source?: PowerSource | null;
}

export interface EnergyOverviewWithSource extends EnergyOverview, PowerProvenance {
  sourceDetail?: {
    mixed: boolean;
    measuredApCount: number | null;
    apReportOnlyApCount: number | null;
    measuredSampleCount: number | null;
    apReportSampleCount: number | null;
  };
}

export type EnergySiteWithSource = EnergySite & PowerProvenance;

export interface EnergyApWithSource extends EnergyAp, PowerProvenance {
  model?: string | null;
  siteName?: string | null;
}

export interface UnevaluatedRule {
  type: string;
  reason: string;
}

export interface EnergyRecommendationsResponse {
  recommendations: EnergyRecommendation[];
  meta?: {
    currency?: string;
    source?: PowerSource | null;
    unevaluatedRules?: UnevaluatedRule[];
  };
}

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
): Promise<EnergyOverviewWithSource> {
  const { start, end } = windowParams(params.timeRange);
  return request<EnergyOverviewWithSource>(
    `/overview${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function getEnergySites(
  params: { timeRange: string },
  signal?: AbortSignal
): Promise<{ sites: EnergySiteWithSource[] }> {
  const { start, end } = windowParams(params.timeRange);
  return request<{ sites: EnergySiteWithSource[] }>(`/sites${buildQuery({ start, end })}`, { signal });
}

export function getEnergyAps(
  params: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<{ aps: EnergyApWithSource[] }> {
  const { start, end } = windowParams(params.timeRange);
  return request<{ aps: EnergyApWithSource[] }>(
    `/aps${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function getEnergyRecommendations(
  params: { site: string; timeRange: string },
  signal?: AbortSignal
): Promise<EnergyRecommendationsResponse> {
  const { start, end } = windowParams(params.timeRange);
  return request<EnergyRecommendationsResponse>(
    `/recommendations${buildQuery({ start, end, siteId: params.site })}`,
    { signal }
  );
}

export function postEnergyScenario(
  body: {
    name: string;
    policy: EnergyScenarioPolicy;
    siteId?: string;
    /** The page's selected window; the server defaults to retention when omitted. */
    windowStart?: string;
    windowEnd?: string;
    /** IANA zone the policy hours are wall-clock hours in. */
    timeZone?: string;
  },
  signal?: AbortSignal
): Promise<EnergyScenarioResult & { timeZone?: string }> {
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
  body: {
    currencyCode: string;
    ratePerKwh: number;
    emissionsFactorKgPerKwh?: number | null;
    emissionsFactorSource?: string | null;
    emissionsFactorRegion?: string | null;
    emissionsFactorYear?: number | null;
  },
  signal?: AbortSignal
): Promise<EnergyPreferences> {
  return request<EnergyPreferences>('/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function createEnvironmentalReport(
  body: EnvironmentalReportRequest,
  signal?: AbortSignal
): Promise<EnvironmentalReport> {
  return request<EnvironmentalReport>('/environmental-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function getLatestEnvironmentalReport(
  siteId?: string,
  signal?: AbortSignal
): Promise<EnvironmentalReport> {
  return request<EnvironmentalReport>(
    `/environmental-reports/latest${buildQuery({ siteId })}`,
    { signal }
  );
}

export function getEnvironmentalReport(
  reportId: string,
  signal?: AbortSignal
): Promise<EnvironmentalReport> {
  return request<EnvironmentalReport>(`/environmental-reports/${encodeURIComponent(reportId)}`, {
    signal,
  });
}

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
