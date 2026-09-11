/**
 * Typed client for the North-vs-South energy experiment API.
 *
 * Reuses the monitoring auth headers so every call is scoped to the controller
 * currently in view. The browser reads and commands; it never talks to the
 * controller and never computes a saving.
 */

import { buildMonitoringHeaders } from './monitoringHistory';
import type {
  DiscoveryResponse,
  ExperimentApRow,
  ExperimentConfig,
  ExperimentSeriesResponse,
  ExperimentStateResponse,
  ExperimentSummaryRow,
  ReadinessResponse,
  TriggerView,
  DemoOverrideState,
} from '../types/energyExperiment';

const BASE = '/api/energy/experiment';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...buildMonitoringHeaders(), ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // An unmatched /api/* path is proxied to the controller, which answers with
    // a Jetty HTML page. Never let that render as data.
    throw new Error(`Unexpected response from ${path}`);
  }
  // 207 is a real, meaningful outcome here (a partial restore), not a failure.
  if (!response.ok && response.status !== 207) {
    const message =
      (body as { error?: string } | null)?.error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

function post<T>(path: string, payload?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
}

export const energyExperimentService = {
  getDiscovery: () => request<DiscoveryResponse>('/discovery'),
  getReadiness: () => request<ReadinessResponse>('/readiness'),
  getConfig: () => request<ExperimentConfig | null>('/config'),
  saveConfig: (patch: Partial<Record<string, unknown>>) =>
    request<ExperimentConfig>('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  getState: (experimentId?: string) =>
    request<ExperimentStateResponse>(
      `/state${experimentId ? `?experimentId=${encodeURIComponent(experimentId)}` : ''}`
    ),
  getHistory: () => request<{ experiments: ExperimentSummaryRow[] }>('/history'),
  getSeries: (range: string, experimentId?: string) =>
    request<ExperimentSeriesResponse>(
      `/series?range=${encodeURIComponent(range)}` +
        (experimentId ? `&experimentId=${encodeURIComponent(experimentId)}` : '')
    ),
  getAps: () => request<{ aps: ExperimentApRow[] }>('/aps'),
  getTrigger: () => request<TriggerView>('/trigger'),

  start: (name?: string) => post<{ ok: boolean; experiment: unknown }>('/start', { name }),
  closeBaseline: () => post<{ ok: boolean }>('/baseline/close'),
  activate: (applyWrites = true) => post<{ ok: boolean }>('/activate', { applyWrites }),
  restore: (experimentId?: string, reason?: string) =>
    post<{ ok: boolean; restored: string[]; unverified: Array<{ serial: string; error: string }> }>(
      '/restore',
      { experimentId, reason }
    ),
  restoreAll: () =>
    post<{ ok: boolean; experiments: number; restored: string[]; unverified: Array<{ serial: string; error: string }> }>(
      '/restore-all'
    ),
  demo: (mode: 'lights_off' | 'lights_on' | 'sensor_failure' | 'reset') =>
    post<{ demoOverride: DemoOverrideState; emitted?: number; raw?: number; persistenceSeconds?: number }>(
      '/demo',
      { mode }
    ),
};
