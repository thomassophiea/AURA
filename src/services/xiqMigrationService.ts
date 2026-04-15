/**
 * XIQ Migration Service
 *
 * Handles fetching SSIDs from ExtremeCloud IQ and posting them to the
 * on-prem controller as Services. Depends on xiqService for auth tokens.
 *
 * Flow:
 *   1. getSSIDs(token)          — paginated fetch from XIQ via Express proxy
 *   2. convertSSIDToService()   — map XIQ format → controller Service payload
 *   3. migrateSSIDs(ssids, token) — post each selected SSID to the controller
 */

import { type XIQStoredToken, XIQ_REGIONS } from './xiqService';
import { apiService } from './api';

export interface XIQMigrationSSID {
  id: string;
  ssid_name: string;
  enabled_status: string;
  key_management: string;
  passphrase?: string;
  broadcast_ssid: boolean;
  access_vlan?: number;
}

export interface MigrationResult {
  succeeded: string[];
  failed: { name: string; error: string }[];
}

// Maps XIQ key_management values to controller securityLevel strings
const SECURITY_MAP: Record<string, string> = {
  WPA2_PERSONAL: 'WPA2',
  WPA2_ENTERPRISE: 'WPA2',
  WPA3_PERSONAL: 'WPA3',
  WPA3_ENTERPRISE: 'WPA3',
  WPA2_WPA3_PERSONAL: 'WPA2',
  OPEN: 'Open',
  OPEN_ENHANCED: 'Open',
  WPA_PERSONAL: 'WPA',
};

function mapSecurityLevel(keyManagement: string): string {
  return SECURITY_MAP[keyManagement] ?? 'WPA2';
}

async function makeXiqProxyRequest(token: XIQStoredToken, path: string): Promise<Response> {
  // Route through the Express /xiq/api/* proxy to avoid browser CORS restrictions
  return fetch(`/xiq/api${path}`, {
    method: 'GET',
    headers: {
      'X-XIQ-Token': token.access_token,
      'X-XIQ-Region': token.region,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(25000),
  });
}

export async function getSSIDs(token: XIQStoredToken): Promise<XIQMigrationSSID[]> {
  const all: XIQMigrationSSID[] = [];
  let page = 1;
  const limit = 100;

  // Validate region is recognized
  if (!XIQ_REGIONS[token.region]) {
    throw new Error(`Unknown XIQ region: ${token.region}`);
  }

  while (true) {
    const response = await makeXiqProxyRequest(token, `/ssids?page=${page}&limit=${limit}`);

    if (!response.ok) {
      let message = `Failed to fetch XIQ SSIDs (${response.status})`;
      try {
        const body = await response.json();
        if (body.error || body.message) message = body.error || body.message;
      } catch {
        // ignore parse failure
      }
      throw new Error(message);
    }

    const body = await response.json();
    const items: XIQMigrationSSID[] = Array.isArray(body) ? body : (body.data ?? []);

    if (items.length === 0) break;
    all.push(...items);

    // Stop when we got fewer items than requested (last page)
    if (items.length < limit) break;
    page++;
  }

  return all;
}

export function convertSSIDToService(ssid: XIQMigrationSSID): Record<string, unknown> {
  const securityLevel = mapSecurityLevel(ssid.key_management ?? 'WPA2_PERSONAL');
  const service: Record<string, unknown> = {
    serviceName: ssid.ssid_name,
    ssid: ssid.ssid_name,
    status: 'disabled', // initially disabled; admin can enable after review
    securityLevel,
    broadcastSsid: ssid.broadcast_ssid ?? true,
  };

  // Include PSK for personal security modes
  if (ssid.passphrase && securityLevel !== 'Open') {
    service.presharedKey = ssid.passphrase;
  }

  return service;
}

export async function migrateSSIDs(
  ssids: XIQMigrationSSID[],
  _token: XIQStoredToken
): Promise<MigrationResult> {
  const result: MigrationResult = { succeeded: [], failed: [] };

  for (const ssid of ssids) {
    const name = ssid.ssid_name;
    try {
      const payload = convertSSIDToService(ssid);
      const response = await apiService.makeAuthenticatedRequest(
        '/v1/services',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        15000
      );

      if (response.ok || response.status === 201) {
        result.succeeded.push(name);
      } else {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          if (body.error || body.message) errorMsg = body.error || body.message;
        } catch {
          // ignore
        }
        result.failed.push({ name, error: errorMsg });
      }
    } catch (err) {
      result.failed.push({ name, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return result;
}
