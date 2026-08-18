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
