/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * XIQ Sites for the Service Levels selector.
 *
 * Loads the XIQ location list (type === 'Site') for a site group that has a
 * stored XIQ token, so the SLE site selector can offer XIQ sites alongside
 * gateway (OS-ONE) sites.
 *
 * Lab/demo auto-connect: when a site group has no XIQ token yet, we attempt a
 * credential-less login. The server (/xiq/login) supplies lab credentials from
 * env (XIQ_DEMO_EMAIL / XIQ_DEMO_PASSWORD) when configured, so no credentials
 * live in the frontend bundle or the repo. With no env configured the login
 * 400s and we simply surface no XIQ sites. Region defaults to 'global'.
 */

import { xiqService } from '../xiqService';

export interface XiqSite {
  /** XIQ location id (numeric, stringified). */
  id: string;
  name: string;
  /** Owning site group id (the XIQ token is keyed by this). */
  siteGroupId: string;
}

/**
 * Ensure a site group has an XIQ session. Uses an existing token if present,
 * otherwise attempts the server-mediated lab/demo auto-connect (no client-side
 * credentials). Returns false when no session can be established.
 */
export async function ensureXiqSession(siteGroupId: string): Promise<boolean> {
  // 1. Valid token already cached.
  if (xiqService.getToken(siteGroupId)) return true;

  // 2. Saved credentials (connected once via the UI) — survives token expiry
  //    and redeploys without depending on server env.
  const saved = xiqService.getCredentials(siteGroupId);
  if (saved?.email && saved?.password) {
    try {
      await xiqService.login(saved.email, saved.password, saved.region || 'global', siteGroupId);
      return true;
    } catch {
      /* fall through to env-mediated login */
    }
  }

  // 3. Pending credentials entered at login — apply to this site group + persist.
  const pending = xiqService.getPendingCredentials();
  if (pending?.email && pending?.password) {
    try {
      await xiqService.login(pending.email, pending.password, pending.region || 'global', siteGroupId);
      xiqService.saveCredentials(siteGroupId, pending.email, pending.password, pending.region || 'global');
      return true;
    } catch {
      /* fall through to env-mediated login */
    }
  }

  // 4. Server-mediated lab/demo login (creds from env XIQ_DEMO_*; opt-in).
  try {
    await xiqService.login('', '', 'global', siteGroupId);
    return true;
  } catch {
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
