/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ Sites for the Service Levels selector.
 *
 * Loads the XIQ location list (type === 'Site') for a site group that has a
 * stored XIQ token, so the SLE site selector can offer XIQ sites alongside
 * gateway (OS-ONE) sites.
 *
 * Includes a clearly-marked DEMO auto-connect: when a site group has no XIQ
 * token yet, we log in with lab credentials so XIQ sites appear without the
 * separate connect flow. This is lab/demo only — see DEMO_XIQ below.
 */

import { xiqService, type XIQRegion } from '../xiqService';

export interface XiqSite {
  /** XIQ location id (numeric, stringified). */
  id: string;
  name: string;
  /** Owning site group id (the XIQ token is keyed by this). */
  siteGroupId: string;
}

/**
 * DEMO ONLY — lab XIQ credentials used to auto-connect when no token exists.
 * Do NOT use in production; replace with the inline "Connect XIQ" flow.
 * Toggle off by setting enabled: false.
 */
const DEMO_XIQ: { enabled: boolean; email: string; password: string; region: XIQRegion } = {
  enabled: true,
  email: 'mblack+1@extremenetworks.com',
  password: 'FNSchj182!',
  region: 'global',
};

/** Ensure a site group has an XIQ session, auto-connecting demo creds if needed. */
export async function ensureXiqSession(siteGroupId: string): Promise<boolean> {
  if (xiqService.getToken(siteGroupId)) return true;
  if (!DEMO_XIQ.enabled) return false;
  try {
    // eslint-disable-next-line no-console
    console.warn('[SLE] Auto-connecting XIQ with DEMO credentials for site group', siteGroupId);
    await xiqService.login(DEMO_XIQ.email, DEMO_XIQ.password, DEMO_XIQ.region, siteGroupId);
    return true;
  } catch (err) {
    console.warn('[SLE] XIQ demo auto-connect failed:', err);
    return false;
  }
}

/** Fetch XIQ sites (locations of type 'Site') for a site group via the proxy. */
export async function loadXiqSites(siteGroupId: string): Promise<XiqSite[]> {
  const connected = await ensureXiqSession(siteGroupId);
  if (!connected) return [];
  const token = xiqService.getToken(siteGroupId);
  if (!token) return [];

  const out: XiqSite[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`/xiq/api/locations/site?page=${page}&limit=100`, {
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
    for (const loc of items) {
      if (String(loc.type ?? '').toLowerCase() === 'site' && loc.id != null) {
        out.push({ id: String(loc.id), name: String(loc.name ?? loc.unique_name ?? loc.id), siteGroupId });
      }
    }
    const totalPages = Number(data?.total_pages ?? data?.totalPages ?? 1);
    if (page >= totalPages || items.length < 100) break;
  }
  return out;
}
