/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ SLE Provider
 *
 * Loads SLE data for an XIQ-backed site group. Fetches active clients + devices
 * from ExtremeCloud IQ through the existing `/xiq/api/*` proxy (same path the
 * migration tool uses), adapts them into the controller station/AP shape, then
 * runs the shared `computeAllWirelessSLEs` engine so the page renders identically.
 *
 * Metrics with no direct XIQ equivalent (time-to-connect, successful-connects,
 * roaming) are still computed from the active-client snapshot but are flagged as
 * limited-fidelity so the UI can communicate that gracefully.
 */

import { xiqService, type XIQStoredToken } from '../xiqService';
import { computeAllWirelessSLEs, setActiveThresholds } from '../sleCalculationEngine';
import { adaptXiqData, clientHasRateData } from './xiqSleAdapter';
import type { SLESiteContext } from '../../types/sleContext';
import {
  emptySLEPageModel,
  type SLELoadOptions,
  type SLEPageModel,
  type SLEProvider,
} from '../../types/slePageModel';

// SLEs whose fidelity is limited when sourced from the XIQ active-client snapshot
// (XIQ's public API does not expose per-attempt connect/roam failure data here).
const XIQ_LIMITED_METRICS = ['time_to_connect', 'successful_connects', 'roaming'];

async function xiqGet(token: XIQStoredToken, path: string): Promise<unknown> {
  const res = await fetch(`/xiq/api${path}`, {
    method: 'GET',
    headers: {
      'X-XIQ-Token': token.access_token,
      'X-XIQ-Region': token.region,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    let msg = `XIQ ${path} failed (${res.status})`;
    try {
      const b = (await res.json()) as Record<string, string>;
      if (b.error || b.message) msg = b.error || b.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

async function xiqGetPaginated(
  token: XIQStoredToken,
  endpoint: string,
  extraQuery = ''
): Promise<Record<string, any>[]> {
  const all: Record<string, any>[] = [];
  let page = 1;
  // Hard cap so a misbehaving upstream can't loop forever.
  const MAX_PAGES = 50;
  const suffix = extraQuery ? `&${extraQuery}` : '';
  while (page <= MAX_PAGES) {
    const result = await xiqGet(token, `${endpoint}?page=${page}&limit=100${suffix}`);
    let items: Record<string, any>[] = [];
    if (Array.isArray(result)) {
      items = result as Record<string, any>[];
    } else if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      items = (r.data ?? r.items ?? r.results ?? []) as Record<string, any>[];
    }
    if (items.length === 0) break;
    all.push(...items);
    const totalPages =
      result && typeof result === 'object'
        ? Number(
            (result as Record<string, unknown>).total_pages ??
              (result as Record<string, unknown>).totalPages ??
              1
          )
        : 1;
    if (page >= totalPages || items.length < 100) break;
    page++;
  }
  return all;
}

async function loadXiqData(
  context: SLESiteContext,
  options: SLELoadOptions
): Promise<SLEPageModel> {
  const siteGroupId = context.siteGroupId;
  const token = siteGroupId ? xiqService.getToken(siteGroupId) : null;

  if (!token) {
    return emptySLEPageModel('xiq', context, [
      'This site group is XIQ-backed but not connected. Connect XIQ to load Service Levels.',
    ]);
  }

  let clients: Record<string, any>[] = [];
  let devices: Record<string, any>[] = [];
  const warnings: string[] = [];

  try {
    [clients, devices] = await Promise.all([
      // views=FULL is required for rssi/snr/channel/health + AP linkage fields.
      xiqGetPaginated(token, '/clients/active', 'views=FULL'),
      xiqGetPaginated(token, '/devices'),
    ]);
  } catch (err) {
    return emptySLEPageModel('xiq', context, [
      `Failed to load XIQ data: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }

  const { stations, aps } = adaptXiqData(clients, devices);

  setActiveThresholds(options.thresholds);
  // XIQ does not feed the controller historical-collection service, so the
  // timeseries sparklines start empty and fill once collection covers XIQ.
  let sles = computeAllWirelessSLEs(stations, aps, []);

  const unavailableMetrics: string[] = [];

  // Throughput needs PHY-rate data. When the tenant exposes none, drop the
  // metric rather than report a misleading 100% from all-zero rates.
  const hasRateData = clients.some(clientHasRateData);
  if (!hasRateData && stations.length > 0) {
    sles = sles.filter((s) => s.id !== 'throughput');
    unavailableMetrics.push('throughput');
    warnings.push('Throughput is unavailable from this XIQ account (no PHY-rate data).');
  }

  if (stations.length === 0 && aps.length === 0) {
    warnings.push('No active clients or devices returned from XIQ for this account.');
  }

  return {
    source: 'xiq',
    context,
    sles,
    stations,
    aps,
    generatedAt: Date.now(),
    unavailableMetrics,
    warnings,
  };
}

export const xiqSleProvider: SLEProvider = {
  source: 'xiq',
  load: loadXiqData,
};

export { XIQ_LIMITED_METRICS };
