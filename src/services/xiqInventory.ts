/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ inventory adapters for the Access Points and Clients pages.
 *
 * Fetches XIQ data and maps it into the controller "AccessPoint" / "Station"
 * row shapes the existing AG-Grid tables already consume, so an XIQ site can be
 * shown in those tables with only minor column gaps (XIQ exposes a slightly
 * different field set than the on-prem controller).
 *
 *   Clients     <- /dashboard/wireless/client-health/grid  (rssi, ssid, AP, issues)
 *   AccessPoints <- /devices (identity) merged with
 *                   /dashboard/wireless/device-health/grid (cpu/mem/health, site)
 */

import { xiqService, type XIQStoredToken } from './xiqService';
import { ensureXiqSession } from './sle/xiqSites';

async function xiqGet(token: XIQStoredToken, path: string): Promise<any> {
  const res = await fetch(`/xiq/api${path}`, {
    method: 'GET',
    headers: {
      'X-XIQ-Token': token.access_token,
      'X-XIQ-Region': token.region,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`XIQ ${path} failed (${res.status})`);
  return res.json();
}

async function xiqGetPaged(token: XIQStoredToken, path: string, extra = ''): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 30; page++) {
    const data = await xiqGet(token, `${path}?page=${page}&limit=100${extra ? `&${extra}` : ''}`);
    const items: any[] = Array.isArray(data) ? data : (data.data ?? data.items ?? data.results ?? []);
    if (!items.length) break;
    out.push(...items);
    const totalPages = Number(data?.total_pages ?? data?.totalPages ?? 1);
    if (page >= totalPages || items.length < 100) break;
  }
  return out;
}

async function xiqPostPaged(token: XIQStoredToken, path: string, query: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 30; page++) {
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
    if (!items.length) break;
    out.push(...items);
    const totalPages = Number(data?.total_pages ?? data?.totalPages ?? 1);
    if (page >= totalPages || items.length < 100) break;
  }
  return out;
}

function inSite(row: any, siteName: string | null): boolean {
  if (!siteName) return true;
  return row.site === siteName || row.building === siteName || row.floor === siteName;
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/** Resolve a session token for a site group, auto-connecting if needed. */
async function tokenFor(siteGroupId: string): Promise<XIQStoredToken | null> {
  await ensureXiqSession(siteGroupId);
  return xiqService.getToken(siteGroupId);
}

/** Map an XIQ client-health row into the controller Station row shape. */
function clientToStation(r: any): any {
  return {
    macAddress: String(r.client_mac ?? ''),
    hostName: r.client_hostname ?? r.alias ?? r.client_mac ?? '',
    ipAddress: r.client_ip ?? r.ipv4 ?? '',
    ipv6Address: r.ipv6 ?? '',
    status: r.connectionStatus === 'CONNECTED' ? 'connected' : (r.connectionStatus ?? 'connected'),
    siteName: r.site ?? r.building ?? r.floor ?? '',
    ssid: r.ssid ?? '',
    network: r.ssid ?? '',
    apName: r.connected_device_hostname ?? '',
    apSerial: r.connected_device_mac ?? '',
    apSerialNumber: r.connected_device_mac ?? '',
    rss: num(r.rssi),
    signalStrength: num(r.rssi),
    snr: num(r.snr),
    protocol: r.frequency ?? '',
    deviceType: r.client_type ?? '',
    osType: r.operating_system ?? '',
    manufacturer: r.operating_system ?? '',
    username: r.username ?? '',
    vlan: r.vlan,
    _source: 'xiq',
    _xiq: r,
  };
}

/** Map XIQ device (+ health) data into the controller AccessPoint row shape. */
function deviceToAccessPoint(dev: any, health?: any): any {
  const connected = dev.connected === true || String(dev.connected).toLowerCase() === 'true';
  return {
    serialNumber: String(dev.serial_number ?? dev.device_id ?? ''),
    apName: dev.hostname ?? dev.device_name ?? '',
    displayName: dev.hostname ?? dev.device_name ?? '',
    name: dev.hostname ?? dev.device_name ?? '',
    hostname: dev.hostname ?? '',
    model: dev.product_type ?? dev.model ?? '',
    hardwareType: dev.product_type ?? '',
    ipAddress: dev.ip_address ?? health?.device_ip ?? '',
    macAddress: dev.mac_address ?? '',
    // 'online'/'offline' — NOT 'connected'/'disconnected' (the latter trips
    // substring checks like "disconnected".includes("connected") === true).
    status: connected ? 'online' : 'offline',
    hostSite: health?.site ?? (Array.isArray(dev.locations) ? dev.locations[dev.locations.length - 1]?.name : '') ?? '',
    siteName: health?.site ?? '',
    clientCount: num(dev.active_clients),
    cpuUsage: num(health?.cpu_usage_percentage),
    memoryUsage: num(health?.memory_usage_percentage),
    softwareVersion: dev.os_version ?? dev.software_version ?? '',
    _source: 'xiq',
    _xiq: dev,
  };
}

/**
 * Fetch per-client traffic (bytes) over a time window via /clients/usage.
 * Keyed by client_device_id (== the usage API's client_id). Chunked to keep
 * the query string bounded. Returns a Map id -> usage bytes.
 */
async function fetchXiqClientUsage(
  token: XIQStoredToken,
  ids: string[],
  startTime: number,
  endTime: number
): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50).join(',');
    try {
      const res = await xiqGet(
        token,
        `/clients/usage?clientIds=${chunk}&startTime=${startTime}&endTime=${endTime}`
      );
      const items: any[] = Array.isArray(res) ? res : (res?.data ?? []);
      for (const it of items) {
        if (it?.client_id != null) usage.set(String(it.client_id), Number(it.usage) || 0);
      }
    } catch {
      /* usage is best-effort; leave those clients without a byte total */
    }
  }
  return usage;
}

/** Load XIQ clients (optionally scoped to a site name) as Station rows. */
export async function loadXiqClients(siteGroupId: string, siteName: string | null): Promise<any[]> {
  const token = await tokenFor(siteGroupId);
  if (!token) return [];
  const rows = (
    await xiqPostPaged(
      token,
      '/dashboard/wireless/client-health/grid',
      'sortField=CLIENT_TYPE&sortOrder=ASC&includeUnassigned=false'
    )
  ).filter((r) => inSite(r, siteName));

  // Attach per-client traffic (last 24h) so the Total Traffic card + Traffic
  // column populate for XIQ (the health grid carries no byte counts).
  const end = Date.now();
  const start = end - 86_400_000;
  const usage = await fetchXiqClientUsage(
    token,
    rows.map((r) => String(r.client_device_id ?? '')),
    start,
    end
  );

  return rows.map((r) => {
    const station = clientToStation(r);
    const bytes = usage.get(String(r.client_device_id ?? ''));
    if (bytes != null) {
      station.clientBandwidthBytes = bytes;
      station.inBytes = bytes;
    }
    return station;
  });
}

/** Load XIQ access points (optionally scoped to a site name) as AccessPoint rows. */
export async function loadXiqAccessPoints(
  siteGroupId: string,
  siteName: string | null
): Promise<any[]> {
  const token = await tokenFor(siteGroupId);
  if (!token) return [];
  const [devices, health] = await Promise.all([
    xiqGetPaged(token, '/devices', 'views=FULL'),
    xiqPostPaged(token, '/dashboard/wireless/device-health/grid', 'sortOrder=ASC&includeUnassigned=false'),
  ]);
  // Index health rows by hostname for cpu/mem/site enrichment.
  const healthByName = new Map<string, any>();
  for (const h of health) if (h.hostname) healthByName.set(String(h.hostname), h);

  const aps = devices
    .filter((d) => String(d.device_function ?? '').toUpperCase() === 'AP' || String(d.product_type ?? '').toUpperCase().startsWith('AP'))
    .map((d) => deviceToAccessPoint(d, healthByName.get(String(d.hostname ?? ''))));

  return aps.filter((ap) => inSite({ site: ap.siteName, building: ap.hostSite }, siteName));
}
