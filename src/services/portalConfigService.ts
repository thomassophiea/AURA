/**
 * Client for AURA's Cloud Captive Portal configuration API
 * (`/api/v1/portal-config`).
 *
 * The browser never holds the portal's internal token — AURA's backend relays,
 * exactly as guest management does. The portal validates every value
 * server-side; a 400 from here carries its `details` list verbatim.
 */

import { apiService, getDynamicControllerUrl } from './api';

const BASE = '/api/v1/portal-config';

/** Operator overrides, null meaning "fall back to the service environment". */
export interface PortalConfigStored {
  sponsorshipEnabled: boolean | null;
  sponsorAllowedDomains: string[] | null;
  sponsorAllowedAddresses: string[] | null;
  sponsorshipTtlSeconds: number | null;
  sponsorshipMaxPerSession: number | null;
  guestFieldsEnabled: string[] | null;
  guestFieldsRequired: string[] | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface PortalConfigView {
  stored: PortalConfigStored;
  effective: {
    sponsorship: {
      enabled: boolean;
      domains: string[];
      addresses: string[];
      ttlSeconds: number;
      maxPerSession: number;
    };
    /** null means the portal has no way to send email — sponsorship is off. */
    emailTransport: 'resend' | 'smtp' | 'console' | null;
    guestFields: { id: string; required: boolean }[];
  };
  fieldCatalogue: { id: string; personal: boolean }[];
  envDefaults: { sponsorAllowedDomains: string[] };
}

export interface PortalConfigUpdate {
  sponsorshipEnabled?: boolean | null;
  sponsorAllowedDomains?: string[] | null;
  sponsorAllowedAddresses?: string[] | null;
  sponsorshipTtlSeconds?: number | null;
  sponsorshipMaxPerSession?: number | null;
  guestFieldsEnabled?: string[] | null;
  guestFieldsRequired?: string[] | null;
}

export class PortalConfigError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string | null = null,
    public readonly details: string[] | null = null,
    public readonly detail: string | null = null
  ) {
    super(message);
    this.name = 'PortalConfigError';
  }

  get isNotConfigured(): boolean {
    return this.code === 'NOT_CONFIGURED' || this.status === 501;
  }

  get isPortalUnavailable(): boolean {
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
  const email = localStorage.getItem('user_email');
  if (email) headers['X-AURA-User'] = email;
  return headers;
}

async function request<T>(init: RequestInit = {}): Promise<T> {
  const response = await fetch(BASE, { ...init, headers: buildHeaders() });
  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON error body; the status alone still tells the operator something */
    }
    throw new PortalConfigError(
      response.status,
      (body.error as string) ?? `Request failed (${response.status})`,
      (body.code as string) ?? null,
      (body.details as string[]) ?? null,
      (body.detail as string) ?? null
    );
  }
  return (await response.json()) as T;
}

export function getPortalConfig(): Promise<PortalConfigView> {
  return request<PortalConfigView>();
}

export function updatePortalConfig(update: PortalConfigUpdate): Promise<PortalConfigView> {
  return request<PortalConfigView>({ method: 'PUT', body: JSON.stringify(update) });
}
