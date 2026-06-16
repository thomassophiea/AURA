/**
 * Sentinel Service — frontend client for the Sentinel infrastructure monitoring API.
 * Routes are served by server/sentinel/sentinelRouter.js on the Express backend.
 */

import { apiService, getDynamicControllerUrl } from './api';

// ── Types ──

export interface SentinelCheckStatus {
  status: 'idle' | 'running' | 'ok' | 'error';
  lastRunAt: string | null;
  error: string | null;
  alertCount?: number;
}

export interface SentinelStatus {
  configured: boolean;
  polling: boolean;
  lastPollAt: string | null;
  authExpired: boolean;
  activeAlerts: number;
  checks: Record<string, SentinelCheckStatus>;
}

export interface SentinelAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  checkName: string;
  message: string;
  target: string;
  context: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  occurrences: number;
}

export interface SentinelAlertFilters {
  severity?: string;
  check?: string;
}

// ── Helpers ──

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = apiService.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

async function sentinelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: { ...buildHeaders(), ...(init?.headers as Record<string, string>) },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Operational Insights API error ${resp.status}: ${msg}`);
  }

  return resp.json() as Promise<T>;
}

// ── API Methods ──

export async function getStatus(): Promise<SentinelStatus> {
  return sentinelFetch('/api/sentinel/status');
}

export async function getAlerts(
  filters?: SentinelAlertFilters
): Promise<{ alerts: SentinelAlert[] }> {
  const params = new URLSearchParams();
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.check) params.set('check', filters.check);
  const qs = params.toString();
  return sentinelFetch(`/api/sentinel/alerts${qs ? `?${qs}` : ''}`);
}

export async function getAllAlerts(
  filters?: SentinelAlertFilters
): Promise<{ alerts: SentinelAlert[] }> {
  const params = new URLSearchParams();
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.check) params.set('check', filters.check);
  const qs = params.toString();
  return sentinelFetch(`/api/sentinel/alerts/all${qs ? `?${qs}` : ''}`);
}

export async function configure(opts: { intervalMs?: number; siteId?: string }): Promise<{ ok: boolean; status: SentinelStatus }> {
  return sentinelFetch('/api/sentinel/configure', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function triggerPoll(siteId?: string): Promise<{ results: Record<string, unknown>; status: SentinelStatus }> {
  return sentinelFetch('/api/sentinel/poll', {
    method: 'POST',
    body: JSON.stringify(siteId ? { siteId } : {}),
  });
}

export async function stop(): Promise<{ ok: boolean; status: SentinelStatus }> {
  return sentinelFetch('/api/sentinel/stop', { method: 'POST' });
}

export async function clearAlerts(): Promise<{ cleared: boolean }> {
  return sentinelFetch('/api/sentinel/alerts', { method: 'DELETE' });
}

// ── Trends ──

export interface TrendEntry {
  ts: string;
  alertCount: number;
  status: 'ok' | 'error';
}

export async function getTrends(): Promise<{ trends: Record<string, TrendEntry[]> }> {
  return sentinelFetch('/api/sentinel/trends');
}

// ── Evidence ──

export interface CheckEvidence {
  summary: string;
  collectedAt: string;
  [key: string]: unknown;
}

export async function getEvidence(checkId: string): Promise<{ evidence: CheckEvidence | null }> {
  return sentinelFetch(`/api/sentinel/evidence/${encodeURIComponent(checkId)}`);
}

export async function getAllEvidence(): Promise<{ evidence: Record<string, CheckEvidence> }> {
  return sentinelFetch('/api/sentinel/evidence');
}
