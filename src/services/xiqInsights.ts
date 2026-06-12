/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ adapters for the App Insights and Audit Logs pages.
 *
 *   App Insights <- POST /applications/usage/summary  (per-app usage/clients)
 *   Audit Logs   <- GET  /logs/audit                  (account admin/config audit)
 *
 * Output shapes mirror what those pages already consume (controller side) so an
 * XIQ site can render through the same UI.
 */

import { xiqService, type XIQStoredToken } from './xiqService';
import { ensureXiqSession } from './sle/xiqSites';

async function tokenFor(siteGroupId: string): Promise<XIQStoredToken | null> {
  await ensureXiqSession(siteGroupId);
  return xiqService.getToken(siteGroupId);
}

async function xiqGetPaged(token: XIQStoredToken, path: string, extra = ''): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`/xiq/api${path}?page=${page}&limit=100${extra ? `&${extra}` : ''}`, {
      method: 'GET',
      headers: {
        'X-XIQ-Token': token.access_token,
        'X-XIQ-Region': token.region,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) break;
    const data: any = await res.json();
    const items: any[] = Array.isArray(data)
      ? data
      : (data.data ?? data.items ?? data.results ?? data.audit_logs ?? data.logs ?? []);
    if (!items.length) break;
    out.push(...items);
    const totalPages = Number(data?.total_pages ?? data?.totalPages ?? 1);
    if (page >= totalPages || items.length < 100) break;
  }
  return out;
}

async function xiqPostPaged(
  token: XIQStoredToken,
  path: string,
  body: any,
  query = ''
): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`/xiq/api${path}?page=${page}&limit=100${query ? `&${query}` : ''}`, {
      method: 'POST',
      headers: {
        'X-XIQ-Token': token.access_token,
        'X-XIQ-Region': token.region,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) break;
    const data: any = await res.json();
    const items: any[] = Array.isArray(data) ? data : (data.data ?? data.items ?? data.results ?? []);
    if (!items.length) break;
    out.push(...items);
    const totalPages = Number(data?.total_pages ?? data?.totalPages ?? 1);
    if (page >= totalPages || items.length < 100) break;
  }
  return out;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

// ── Audit logs ───────────────────────────────────────────────────────────────

/** Normalized audit row consumed by the Audit Logs page (both sources). */
export interface NormalizedAuditLog {
  id: string;
  timestamp: number;
  user: string;
  action: string;
  category: string;
  description: string;
  source: 'OS-ONE' | 'XIQ';
}

/**
 * XIQ account audit logs over a time window. XIQ audit is account/admin-level
 * (not per-site), so the selected XIQ site doesn't scope it further.
 */
export async function loadXiqAuditLogs(
  siteGroupId: string,
  startMs: number,
  endMs: number
): Promise<NormalizedAuditLog[]> {
  const token = await tokenFor(siteGroupId);
  if (!token) return [];
  const rows = await xiqGetPaged(token, '/logs/audit', `startTime=${startMs}&endTime=${endMs}`);
  return rows.map((r, i) => ({
    id: String(r.id ?? `${r.timestamp ?? i}-${i}`),
    timestamp: num(r.timestamp),
    user: String(r.username ?? r.user_id ?? ''),
    action: String(r.category ?? r.code ?? ''),
    category: String(r.category ?? ''),
    description: String(r.description ?? ''),
    source: 'XIQ' as const,
  }));
}

/** Normalize a controller audit-log row into the same shape. */
export function normalizeControllerAuditLog(r: any, i: number): NormalizedAuditLog {
  return {
    id: String(r.id ?? r.transactionId ?? `${r.timestamp ?? r.time ?? i}-${i}`),
    timestamp: num(r.timestamp ?? r.time),
    user: String(r.user ?? r.username ?? r.userId ?? ''),
    action: String(r.action ?? r.actionType ?? r.eventType ?? ''),
    category: String(r.resourceType ?? r.resource ?? r.context ?? r.actionType ?? ''),
    description: String(r.description ?? r.message ?? ''),
    source: 'OS-ONE' as const,
  };
}

// ── App insights ──────────────────────────────────────────────────────────────

export interface XiqAppStat {
  id: string;
  name: string;
  value: number;
}
export interface XiqAppReport {
  reportName: string;
  reportType: string;
  unit: string;
  fromTimeInMillis: number;
  toTimeInMillis: number;
  distributionStats: XiqAppStat[];
}
export interface XiqAppInsightsData {
  topAppGroupsByUsage: XiqAppReport[];
  topAppGroupsByClientCountReport: XiqAppReport[];
  topAppGroupsByThroughputReport: XiqAppReport[];
  worstAppGroupsByUsage: XiqAppReport[];
  worstAppGroupsByClientCountReport: XiqAppReport[];
  worstAppGroupsByThroughputReport: XiqAppReport[];
}

function report(
  name: string,
  unit: string,
  stats: XiqAppStat[],
  start: number,
  end: number
): XiqAppReport[] {
  return [
    {
      reportName: name,
      reportType: name,
      unit,
      fromTimeInMillis: start,
      toTimeInMillis: end,
      distributionStats: stats,
    },
  ];
}

/**
 * XIQ application insights, grouped by category (the "app group" analogue).
 * XIQ's usage summary has no throughput (bps), so those reports are empty.
 */
export async function loadXiqAppInsights(
  siteGroupId: string,
  startMs: number,
  endMs: number
): Promise<XiqAppInsightsData> {
  const token = await tokenFor(siteGroupId);
  const empty: XiqAppInsightsData = {
    topAppGroupsByUsage: [],
    topAppGroupsByClientCountReport: [],
    topAppGroupsByThroughputReport: [],
    worstAppGroupsByUsage: [],
    worstAppGroupsByClientCountReport: [],
    worstAppGroupsByThroughputReport: [],
  };
  if (!token) return empty;

  const rows = await xiqPostPaged(token, '/applications/usage/summary', {
    start_time: startMs,
    end_time: endMs,
  });

  // Group per category_name (falls back to application_name).
  const byCat = new Map<string, { usage: number; clients: number }>();
  for (const r of rows) {
    const key = String(r.category_name || r.application_name || 'Other');
    const agg = byCat.get(key) ?? { usage: 0, clients: 0 };
    agg.usage += num(r.usage);
    agg.clients += num(r.clients);
    byCat.set(key, agg);
  }
  const stats = Array.from(byCat.entries()).map(([name, v]) => ({ ...v, name }));
  const usageStats = stats
    .map((s) => ({ id: s.name, name: s.name, value: s.usage }))
    .sort((a, b) => b.value - a.value);
  const clientStats = stats
    .map((s) => ({ id: s.name, name: s.name, value: s.clients }))
    .sort((a, b) => b.value - a.value);

  return {
    topAppGroupsByUsage: report('Top App Groups by Usage', 'bytes', usageStats, startMs, endMs),
    worstAppGroupsByUsage: report(
      'Bottom App Groups by Usage',
      'bytes',
      [...usageStats].reverse(),
      startMs,
      endMs
    ),
    topAppGroupsByClientCountReport: report(
      'Top App Groups by Clients',
      'clients',
      clientStats,
      startMs,
      endMs
    ),
    worstAppGroupsByClientCountReport: report(
      'Bottom App Groups by Clients',
      'clients',
      [...clientStats].reverse(),
      startMs,
      endMs
    ),
    topAppGroupsByThroughputReport: [],
    worstAppGroupsByThroughputReport: [],
  };
}
