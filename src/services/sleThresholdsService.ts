/**
 * Shared per-site SLE thresholds.
 *
 * Thresholds define what a service level means, so they must be the same for
 * everyone looking at a site — the server copy (Postgres) is authoritative and
 * localStorage is only a cache / offline fallback. Every function here fails
 * soft: a persistence outage degrades to local behavior, never to an error the
 * dashboard has to handle.
 */

import { apiService, getDynamicControllerUrl } from './api';
import type { SLEThresholds } from '../types/sle';

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = apiService.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

/** Server thresholds for a site key ('all' or a site id), or null when unset/unavailable. */
export async function fetchSiteThresholds(siteKey: string): Promise<Partial<SLEThresholds> | null> {
  try {
    const resp = await fetch(`/api/sle/thresholds/${encodeURIComponent(siteKey)}`, {
      headers: buildHeaders(),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { thresholds: Partial<SLEThresholds> | null };
    return body.thresholds ?? null;
  } catch {
    return null;
  }
}

/** Persist thresholds for everyone. Resolves false when only local storage has them. */
export async function saveSiteThresholdsRemote(
  siteKey: string,
  thresholds: SLEThresholds
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/sle/thresholds/${encodeURIComponent(siteKey)}`, {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({ thresholds }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
