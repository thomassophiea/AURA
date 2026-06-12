/**
 * Last-known-good cache for the Service Levels site selector.
 *
 * Site fetches can transiently return empty (token refresh, a concurrent
 * controller base-URL switch, a controller hiccup). Persisting the last
 * non-empty list per scope lets the selector survive those blips instead of
 * blanking out — the list is only replaced when a fetch actually returns sites.
 */

import type { Site } from '../api';

const PREFIX = 'sle_sites_';

function key(scopeKey: string): string {
  return `${PREFIX}${scopeKey}`;
}

export function readCachedSites(scopeKey: string): Site[] {
  try {
    const raw = localStorage.getItem(key(scopeKey));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCachedSites(scopeKey: string, sites: Site[]): void {
  if (!sites.length) return; // never persist an empty list
  try {
    localStorage.setItem(key(scopeKey), JSON.stringify(sites));
  } catch {
    /* ignore quota errors */
  }
}
