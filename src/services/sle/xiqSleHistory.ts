/**
 * XIQ SLE history.
 *
 * XIQ has no reachable time-series API through our proxy, so we build trend
 * sparklines the same way OS-ONE does — by snapshotting each computed SLE score
 * over time. Snapshots are kept per site context in localStorage and replayed
 * into each metric's `timeSeries`. The series fills in as the page refreshes.
 */

import type { SLEMetric, SLETimeSeriesPoint } from '../../types/sle';

const PREFIX = 'xiq_sle_hist_';
const MAX_POINTS = 120; // ~2h at the 60s refresh cadence
const DEDUP_WINDOW_MS = 30_000; // collapse points captured within this window

interface MetricSnap {
  s: number; // successRate
  tot: number; // totalUserMinutes
  aff: number; // affectedUserMinutes
}
interface Snapshot {
  t: number;
  m: Record<string, MetricSnap>;
}

function storageKey(contextKey: string): string {
  return `${PREFIX}${contextKey}`;
}

function read(contextKey: string): Snapshot[] {
  try {
    const raw = localStorage.getItem(storageKey(contextKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(contextKey: string, snaps: Snapshot[]): void {
  try {
    localStorage.setItem(storageKey(contextKey), JSON.stringify(snaps.slice(-MAX_POINTS)));
  } catch {
    /* ignore quota errors */
  }
}

function buildSeries(snaps: Snapshot[], metricId: string): SLETimeSeriesPoint[] {
  return snaps
    .filter((snap) => snap.m[metricId])
    .map((snap) => ({
      timestamp: snap.t,
      time: new Date(snap.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      successRate: snap.m[metricId].s,
      totalClients: snap.m[metricId].tot,
      affectedClients: snap.m[metricId].aff,
    }));
}

/**
 * Record the current SLE scores for a site context and return the metrics with
 * their `timeSeries` populated from accumulated history.
 */
export function attachXiqHistory(contextKey: string, sles: SLEMetric[], now: number): SLEMetric[] {
  const snap: Snapshot = { t: now, m: {} };
  for (const s of sles) {
    snap.m[s.id] = { s: s.successRate, tot: s.totalUserMinutes, aff: s.affectedUserMinutes };
  }

  const snaps = read(contextKey);
  const last = snaps[snaps.length - 1];
  if (last && now - last.t < DEDUP_WINDOW_MS) {
    snaps[snaps.length - 1] = snap; // collapse rapid re-loads into one point
  } else {
    snaps.push(snap);
  }
  write(contextKey, snaps);

  return sles.map((s) => ({ ...s, timeSeries: buildSeries(snaps, s.id) }));
}
