/**
 * Client for AURA's Private SAE (WPA3-Personal) management API
 * (`/api/v1/private-sae`).
 *
 * Private SAE is PPSK's identity model on the SAE AKM; AURA owns the credential
 * lifecycle and the MAC-enrollment loop, while the Campus OS AP enforces it by
 * selecting a per-station SAE password by MAC (see docs/private-sae/). This
 * module speaks only to AURA's backend, which holds the encrypted passphrases —
 * the browser never does.
 *
 * Mirrors ppskService: list/create/update/remove drive the grid; the extra
 * methods (reveal, generate, enable, disable, keyfile, enroll, bindings) back the
 * editor and dialog actions.
 */

import { apiService, getDynamicControllerUrl } from './api';

const BASE = '/api/v1/private-sae';

export type SaeScope = 'global' | 'site' | 'site-group' | 'gateway';
export type SaeUsage = 'multi' | 'single';
export type SaeAkm = 'wpa3-sae' | 'wpa2-psk';

/** Public shape of a Private SAE credential. The passphrase is never included. */
export interface SaeCredential {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  ssid: string;
  keyid: string;
  hasPassphrase: boolean;
  akm: SaeAkm;
  role: string | null;
  vlanId: number | null;
  usage: SaeUsage;
  scope: SaeScope;
  scopeRef: string | null;
  enabled: boolean;
  expiresAt: string | null;
  maxDevices: number | null;
  notify: boolean;
  storeLocally: boolean;
  bindingCount: number;
  lastUsedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaeInput {
  name: string;
  ssid?: string;
  passphrase?: string;
  description?: string | null;
  email?: string | null;
  keyid?: string;
  akm?: SaeAkm;
  role?: string | null;
  vlanId?: number | null;
  usage?: SaeUsage;
  scope?: SaeScope;
  scopeRef?: string | null;
  enabled?: boolean;
  expiresAt?: string | null;
  maxDevices?: number | null;
  notify?: boolean;
  storeLocally?: boolean;
}

/** Derived lifecycle status for the filter pills. */
export type SaeStatus = 'active' | 'paused' | 'expired';
export function saeStatus(c: SaeCredential): SaeStatus {
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return 'expired';
  return c.enabled ? 'active' : 'paused';
}

export interface SaeBinding {
  id: string;
  credentialId: string;
  mac: string;
  boundAt: string;
  lastSeen: string | null;
}

export interface SaeAuditEntry {
  id: number;
  actor: string | null;
  source: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  at: string;
}

/** What AURA managed to enforce on the controller — honest, since it can't yet. */
export interface SaeEnforcement {
  attempted: boolean;
  applied: boolean;
  reason: string;
}

export interface SaeKeyFile {
  ssid: string;
  entryCount: number;
  content: string;
  provisioning: { supported: boolean; reason: string };
}

export class SaeRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string | null = null
  ) {
    super(message);
    this.name = 'SaeRequestError';
  }

  get isNotConfigured(): boolean {
    return this.code === 'NOT_CONFIGURED' || this.status === 501;
  }
  get isPersistenceUnavailable(): boolean {
    return this.status === 503;
  }
  get isMaxDevices(): boolean {
    return this.code === 'MAX_DEVICES';
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
    throw new SaeRequestError(
      response.status,
      (body.error as string) ?? `Request failed (${response.status})`,
      (body.code as string) ?? null
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const privateSaeService = {
  async list(ssid?: string): Promise<SaeCredential[]> {
    const query = ssid ? `?ssid=${encodeURIComponent(ssid)}` : '';
    const data = await request<{ credentials: SaeCredential[]; encryptionConfigured: boolean }>(query);
    return data.credentials;
  },

  async listWithMeta(
    signal?: AbortSignal
  ): Promise<{ credentials: SaeCredential[]; encryptionConfigured: boolean }> {
    return request('', {}, signal);
  },

  async get(id: string): Promise<SaeCredential> {
    return request(`/${id}`);
  },

  async create(payload: SaeInput): Promise<SaeCredential> {
    return request('', { method: 'POST', body: JSON.stringify(payload) });
  },

  async update(id: string, payload: Partial<SaeInput>): Promise<SaeCredential> {
    return request(`/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  async remove(id: string): Promise<void> {
    await request(`/${id}`, { method: 'DELETE' });
  },

  async setEnabled(id: string, enabled: boolean): Promise<{ credential: SaeCredential; enforcement: SaeEnforcement }> {
    return request(`/${id}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });
  },

  async reveal(id: string): Promise<{ id: string; keyid: string; passphrase: string }> {
    return request(`/${id}/reveal`);
  },

  async generate(length = 24): Promise<string> {
    const data = await request<{ passphrase: string }>('/generate', {
      method: 'POST',
      body: JSON.stringify({ length }),
    });
    return data.passphrase;
  },

  async keyfile(ssid: string): Promise<SaeKeyFile> {
    return request(`/keyfile?ssid=${encodeURIComponent(ssid)}`);
  },

  async audit(limit = 200): Promise<SaeAuditEntry[]> {
    const data = await request<{ entries: SaeAuditEntry[] }>(`/audit?limit=${limit}`);
    return data.entries;
  },

  /** Enroll (bind) a station MAC onto a credential — the enrollment loop. */
  async enroll(id: string, mac: string): Promise<{ credentialId: string; keyid: string; binding: SaeBinding }> {
    return request(`/${id}/enroll`, { method: 'POST', body: JSON.stringify({ mac }) });
  },

  async bindings(id: string): Promise<SaeBinding[]> {
    const data = await request<{ bindings: SaeBinding[] }>(`/${id}/bindings`);
    return data.bindings;
  },

  async revokeBinding(id: string, mac: string): Promise<void> {
    await request(`/${id}/bindings/${encodeURIComponent(mac)}`, { method: 'DELETE' });
  },

  /** Bulk create from parsed CSV rows; returns per-row outcomes. */
  async importMany(inputs: SaeInput[]): Promise<Array<{ ok: boolean; name: string; error?: string }>> {
    const results: Array<{ ok: boolean; name: string; error?: string }> = [];
    for (const input of inputs) {
      try {
        await this.create(input);
        results.push({ ok: true, name: input.name });
      } catch (err) {
        results.push({
          ok: false,
          name: input.name,
          error: err instanceof SaeRequestError ? err.message : 'failed',
        });
      }
    }
    return results;
  },
};
