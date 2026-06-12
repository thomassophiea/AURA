/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ SLE Provider
 *
 * Loads XIQ-native Service Levels for an XIQ-backed site (or the whole account).
 * Pulls three XIQ dashboard grids through the /xiq/api proxy and computes the
 * same 7 wireless SLEs the OS-ONE page shows (see xiqSleEngine), scoped to the
 * selected XIQ site by name. Output is the shared SLEPageModel so the page
 * renders identically.
 */

import { xiqService, type XIQStoredToken } from '../xiqService';
import { computeXiqWirelessSLEs } from './xiqSleEngine';
import { attachXiqHistory } from './xiqSleHistory';
import {
  normalizeXiqClientRow,
  normalizeXiqDeviceRow,
  normalizeXiqCapacityRow,
} from '../../types/xiqGrid';
import type { SLESiteContext } from '../../types/sleContext';
import {
  emptySLEPageModel,
  type SLELoadOptions,
  type SLEPageModel,
  type SLEProvider,
} from '../../types/slePageModel';

const GRIDS = {
  client: '/dashboard/wireless/client-health/grid',
  device: '/dashboard/wireless/device-health/grid',
  capacity: '/dashboard/wireless/usage-capacity/grid',
} as const;

async function xiqPostPaged(
  token: XIQStoredToken,
  path: string,
  query: string
): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  const MAX_PAGES = 30;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`/xiq/api${path}?page=${page}&limit=100&${query}`, {
      method: 'POST',
      headers: {
        'X-XIQ-Token': token.access_token,
        'X-XIQ-Region': token.region,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) break;
    const data: any = await res.json();
    const items: any[] = Array.isArray(data) ? data : (data.data ?? data.items ?? data.results ?? []);
    if (items.length === 0) break;
    out.push(...items);
    const totalPages = Number(data?.total_pages ?? data?.totalPages ?? 1);
    if (page >= totalPages || items.length < 100) break;
  }
  return out;
}

/** Paginated GET through the proxy (for /clients/active health scores). */
async function xiqGetPaged(token: XIQStoredToken, path: string, query = ''): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  for (let page = 1; page <= 30; page++) {
    const res = await fetch(`/xiq/api${path}?page=${page}&limit=100${query ? `&${query}` : ''}`, {
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
    const items: any[] = Array.isArray(data) ? data : (data.data ?? data.items ?? data.results ?? []);
    if (items.length === 0) break;
    out.push(...items);
    const totalPages = Number(data?.total_pages ?? data?.totalPages ?? 1);
    if (page >= totalPages || items.length < 100) break;
  }
  return out;
}

const macKey = (m: unknown) => String(m ?? '').replace(/[:-]/g, '').toUpperCase();

/** Keep only rows belonging to the selected site (by name). */
function scopeToSite(rows: Record<string, any>[], siteName: string | null): Record<string, any>[] {
  if (!siteName) return rows;
  return rows.filter(
    (r) => r.site === siteName || r.building === siteName || r.floor === siteName
  );
}

async function loadXiqData(
  context: SLESiteContext,
  _options: SLELoadOptions
): Promise<SLEPageModel> {
  const siteGroupId = context.siteGroupId;
  const token = siteGroupId ? xiqService.getToken(siteGroupId) : null;

  if (!token) {
    return emptySLEPageModel('xiq', context, [
      'This site group is XIQ-backed but not connected. Connect XIQ to load Service Levels.',
    ]);
  }

  let clientRows: Record<string, any>[] = [];
  let deviceRows: Record<string, any>[] = [];
  let capacityRows: Record<string, any>[] = [];
  const warnings: string[] = [];

  let healthRows: Record<string, any>[] = [];
  try {
    [clientRows, deviceRows, capacityRows, healthRows] = await Promise.all([
      xiqPostPaged(token, GRIDS.client, 'sortField=CLIENT_TYPE&sortOrder=ASC&includeUnassigned=false'),
      xiqPostPaged(token, GRIDS.device, 'sortOrder=ASC&includeUnassigned=false'),
      xiqPostPaged(token, GRIDS.capacity, 'sortOrder=ASC&includeUnassigned=false'),
      // XIQ native per-client assurance scores (radio/client health).
      xiqGetPaged(token, '/clients/active', 'views=FULL').catch(() => []),
    ]);
  } catch (err) {
    return emptySLEPageModel('xiq', context, [
      `Failed to load XIQ data: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }

  // Merge native health scores into the client-health rows by MAC.
  const healthByMac = new Map<string, any>();
  for (const h of healthRows) healthByMac.set(macKey(h.mac_address ?? h.macAddress), h);
  for (const r of clientRows) {
    const h = healthByMac.get(macKey(r.client_mac));
    if (h) {
      r.radio_health = h.radio_health;
      r.client_health = h.client_health;
    }
  }

  // Scope to the selected XIQ site (when a specific site is chosen).
  const siteName = context.xiqLocationId ? context.siteName : null;
  const clients = scopeToSite(clientRows, siteName);
  const devices = scopeToSite(deviceRows, siteName);
  const capacity = scopeToSite(capacityRows, siteName);

  const computed = computeXiqWirelessSLEs(
    clients.map(normalizeXiqClientRow),
    devices.map(normalizeXiqDeviceRow),
    capacity.map(normalizeXiqCapacityRow)
  );

  // Trend sparklines: snapshot scores per site context and replay history.
  const contextKey = `${siteGroupId}:${context.xiqLocationId ?? 'all'}`;
  const sles = attachXiqHistory(contextKey, computed, Date.now());

  // Merge usage-capacity fields into the device rows by id so the XIQ
  // root-cause drill-down resolves both AP-health and capacity classifiers.
  const capById = new Map(
    capacity.map((r) => [String(r.device_id ?? r.mac_address ?? r.hostname ?? ''), r])
  );
  const mergedAps = devices.map((d) => ({
    ...(capById.get(String(d.device_id ?? d.hostname ?? '')) ?? {}),
    ...d,
  }));

  if (clients.length === 0 && devices.length === 0) {
    warnings.push(
      siteName
        ? `No XIQ wireless data for "${siteName}".`
        : 'No XIQ wireless data returned for this account.'
    );
  }

  return {
    source: 'xiq',
    context,
    sles,
    // Raw grid rows back the honeycomb drill-down / client click-through.
    stations: clients,
    aps: mergedAps,
    generatedAt: Date.now(),
    unavailableMetrics: [],
    warnings,
  };
}

export const xiqSleProvider: SLEProvider = {
  source: 'xiq',
  load: loadXiqData,
};
