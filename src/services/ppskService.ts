/**
 * Client for AURA's PPSK / MPSK management API (`/api/v1/ppsk`).
 *
 * AURA owns the PPSK identity lifecycle; the Campus OS AP enforces it by matching
 * the key against the 4-way-handshake MIC in a wpa_psk_file (proven on real
 * hardware — docs/PPSK_HARDWARE_FINDINGS.md). This module speaks only to AURA's
 * backend, which holds the encrypted passphrases — the browser never does.
 *
 * The exported `ppskService` conforms to the _kit ResourceCrudService shape
 * (list/create/update/remove) so useResourceCrud drives the grid; the extra
 * methods (reveal, generate, enable, disable, keyfile) back the editor actions.
 */

import { apiService, getDynamicControllerUrl } from './api';

const BASE = '/api/v1/ppsk';

export type PpskScope = 'global' | 'site' | 'site-group' | 'gateway';
export type PpskUsage = 'multi' | 'single';
export type PpskMacMode = 'first' | 'specify';

/** Public shape of a PPSK identity. The passphrase is never included here. */
export interface PpskIdentity {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  ssid: string;
  keyid: string;
  hasPassphrase: boolean;
  role: string | null;
  vlanId: number | null;
  usage: PpskUsage;
  macMode: PpskMacMode | null;
  mac: string | null;
  notify: boolean;
  storeLocally: boolean;
  scope: PpskScope;
  scopeRef: string | null;
  enabled: boolean;
  expiresAt: string | null;
  maxDevices: number | null;
  lastUsedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PpskInput {
  name: string;
  ssid: string;
  passphrase?: string;
  description?: string | null;
  email?: string | null;
  keyid?: string;
  role?: string | null;
  vlanId?: number | null;
  usage?: PpskUsage;
  macMode?: PpskMacMode | null;
  mac?: string | null;
  notify?: boolean;
  storeLocally?: boolean;
  scope?: PpskScope;
  scopeRef?: string | null;
  enabled?: boolean;
  expiresAt?: string | null;
  maxDevices?: number | null;
}

/** Derived lifecycle status for the filter pills. */
export type PpskStatus = 'active' | 'paused' | 'expired';
export function ppskStatus(k: PpskIdentity): PpskStatus {
  if (k.expiresAt && new Date(k.expiresAt).getTime() < Date.now()) return 'expired';
  return k.enabled ? 'active' : 'paused';
}

export interface PpskObservation {
  keyid: string;
  ssid: string | null;
  apName: string | null;
  seenAt: string;
}

export interface PpskAuditEntry {
  id: number;
  actor: string | null;
  source: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  at: string;
}

/** What AURA managed to enforce on the gateway — honest, since it can't yet. */
export interface PpskEnforcement {
  attempted: boolean;
  applied: boolean;
  reason: string;
}

export interface PpskKeyFile {
  ssid: string;
  entryCount: number;
  content: string;
  provisioning: { supported: boolean; reason: string };
}

export class PpskRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string | null = null
  ) {
    super(message);
    this.name = 'PpskRequestError';
  }

  get isNotConfigured(): boolean {
    return this.code === 'NOT_CONFIGURED' || this.status === 501;
  }
  get isPersistenceUnavailable(): boolean {
    return this.status === 503;
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const token = apiService.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: buildHeaders(), signal });
  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON error body */
    }
    throw new PpskRequestError(
      response.status,
      (body.error as string) ?? `Request failed (${response.status})`,
      (body.code as string) ?? null
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const ppskService = {
  async list(ssid?: string): Promise<PpskIdentity[]> {
    const query = ssid ? `?ssid=${encodeURIComponent(ssid)}` : '';
    const data = await request<{ identities: PpskIdentity[]; encryptionConfigured: boolean }>(query);
    return data.identities;
  },

  async listWithMeta(
    signal?: AbortSignal
  ): Promise<{ identities: PpskIdentity[]; encryptionConfigured: boolean }> {
    return request('', {}, signal);
  },

  async get(id: string): Promise<PpskIdentity> {
    return request(`/${id}`);
  },

  async create(payload: PpskInput): Promise<PpskIdentity> {
    return request('', { method: 'POST', body: JSON.stringify(payload) });
  },

  async update(id: string, payload: Partial<PpskInput>): Promise<PpskIdentity> {
    return request(`/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  async remove(id: string): Promise<void> {
    await request(`/${id}`, { method: 'DELETE' });
  },

  async setEnabled(id: string, enabled: boolean): Promise<{ identity: PpskIdentity; enforcement: PpskEnforcement }> {
    return request(`/${id}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });
  },

  async reveal(id: string): Promise<{ id: string; keyid: string; passphrase: string }> {
    return request(`/${id}/reveal`);
  },

  async generate(length = 16): Promise<string> {
    const data = await request<{ passphrase: string }>('/generate', {
      method: 'POST',
      body: JSON.stringify({ length }),
    });
    return data.passphrase;
  },

  async keyfile(ssid: string): Promise<PpskKeyFile> {
    return request(`/keyfile?ssid=${encodeURIComponent(ssid)}`);
  },

  async audit(limit = 200): Promise<PpskAuditEntry[]> {
    const data = await request<{ entries: PpskAuditEntry[] }>(`/audit?limit=${limit}`);
    return data.entries;
  },

  /**
   * Observed MAC -> PPSK identity map (keyed by canonical lowercase MAC).
   * Fills the Clients "Username" column for PPSK clients until Campus OS reports
   * the keyid itself. Returns {} when unconfigured — never throws for the caller.
   */
  async observed(signal?: AbortSignal): Promise<Record<string, PpskObservation>> {
    try {
      const data = await request<{ observed: Record<string, PpskObservation> }>('/observed', {}, signal);
      return data.observed ?? {};
    } catch {
      return {};
    }
  },

  /** Bulk create from parsed CSV rows; returns per-row outcomes. */
  async importMany(
    inputs: PpskInput[]
  ): Promise<Array<{ ok: boolean; name: string; error?: string }>> {
    const results: Array<{ ok: boolean; name: string; error?: string }> = [];
    for (const input of inputs) {
      try {
        await this.create(input);
        results.push({ ok: true, name: input.name });
      } catch (err) {
        results.push({
          ok: false,
          name: input.name,
          error: err instanceof PpskRequestError ? err.message : 'failed',
        });
      }
    }
    return results;
  },
};
