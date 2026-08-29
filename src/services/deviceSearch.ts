/**
 * Device Search Service — frontend client for the server-side device
 * typeahead endpoints (`server/devices/deviceSearchRouter.js`).
 *
 * At scale (100k+ APs), a picker cannot load "all devices" into the browser.
 * These endpoints filter and cap on the server from a short-lived cached
 * snapshot, so the client only ever asks for a small, capped result set.
 */

import { apiService, getDynamicControllerUrl } from './api';

// ── Types ──

export interface ApItem {
  id: string;
  name: string;
  serialNumber: string;
  ipAddress: string | null;
  siteName: string | null;
  status: string | null;
}

export interface ClientItem {
  id: string;
  name: string;
  macAddress: string;
  ssid: string | null;
  apName: string | null;
  ipAddress: string | null;
}

export interface DeviceSearchResult<T> {
  items: T[];
  total: number;
  capped: boolean;
}

// ── Helpers ──

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = apiService.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

async function deviceSearchFetch<T>(path: string): Promise<T> {
  const resp = await fetch(path, {
    headers: buildHeaders(),
    credentials: 'include',
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Device search API error ${resp.status}: ${msg}`);
  }

  return resp.json() as Promise<T>;
}

function buildQuery(q: string, limit?: number): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ── API Methods ──

export async function searchAccessPoints(
  q: string,
  limit?: number
): Promise<DeviceSearchResult<ApItem>> {
  return deviceSearchFetch(`/api/devices/aps/search${buildQuery(q, limit)}`);
}

export async function searchClients(
  q: string,
  limit?: number
): Promise<DeviceSearchResult<ClientItem>> {
  return deviceSearchFetch(`/api/devices/clients/search${buildQuery(q, limit)}`);
}
