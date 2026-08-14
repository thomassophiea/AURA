/**
 * Client for AURA's guest-management API (`/api/v1/guests`).
 *
 * The browser never talks to the captive portal's database, and never holds its
 * credentials — AURA's own backend is the only thing that does. This module
 * only speaks to AURA, with the controller token `apiService` already holds.
 */

import { apiService, getDynamicControllerUrl } from './api';

const BASE = '/api/v1/guests';

/** Live association, as reported by the gateway. */
export type GuestConnectionStatus = 'connected' | 'disconnected' | 'unknown';

/** Standing authorization, as recorded by the portal. */
export type GuestAuthorizationStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export type GuestStatus =
  | 'connected'
  | 'authorized'
  | 'disconnected'
  | 'expired'
  | 'revoked'
  | 'manually_added'
  | 'failed';

export type GuestSource = 'CAPTIVE_PORTAL' | 'MANUAL' | 'GATEWAY';

export interface Guest {
  id: string;
  macAddress: string;
  /** The MAC when the portal collected no name — see `hasRealName`. */
  displayName: string;
  hasRealName: boolean;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source: GuestSource;
  authorizationStatus: GuestAuthorizationStatus;
  connectionStatus: GuestConnectionStatus;
  status: GuestStatus;
  ipAddress: string | null;
  /** False when the address is the last one the portal saw, not a live one. */
  ipAddressIsLive: boolean;
  ssid: string | null;
  wlan: string | null;
  role: string | null;
  apName: string | null;
  apSerial: string | null;
  siteId: string | null;
  gateway: string | null;
  signal: number | null;
  connectedSince: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  authorizedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  lastSessionId: string | null;
  lastSessionStatus: string | null;
  lastSessionAt: string | null;
  lastSessionFailureReason: string | null;
  /**
   * Most recent Secure Guest Access attempt, or null when this guest never
   * chose it — the normal case, since it is opt-in on the captive portal.
   *
   * `COMPLETED` means the gateway reported this device on the secure WLAN.
   * `PROFILE_DOWNLOADED` / `QR_DISPLAYED` / `MANUAL_SETUP_VIEWED` mean the
   * portal handed something over and nothing more is known.
   */
  secureOnboarding: {
    id: string;
    status: SecureOnboardingStatus;
    method: string | null;
    platform: string;
    sourceSsid: string | null;
    targetSsid: string;
    startedAt: string;
    completedAt: string | null;
    failureReason: string | null;
  } | null;
}

export type SecureOnboardingStatus =
  | 'OFFERED'
  | 'STARTED'
  | 'PROFILE_DOWNLOADED'
  | 'QR_DISPLAYED'
  | 'MANUAL_SETUP_VIEWED'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';

export interface GuestListResponse {
  guests: Guest[];
  nextCursor: string | null;
  ledgerTotal: number;
  gateway: { reachable: boolean; baseUrl?: string; errorClass?: string };
}

export interface GuestSummary {
  /** Null when the gateway could not be reached — not zero. */
  connectedNow: number | null;
  authorized: number;
  seenToday: number;
  seenLast7Days: number;
  total: number;
}

export interface GuestSummaryResponse {
  summary: GuestSummary;
  gateway: { reachable: boolean };
  truncated: boolean;
}

/** What AURA managed to do on the gateway, alongside the portal record. */
export interface GuestActivation {
  attempted: boolean;
  applied: boolean;
  reason: string | null;
  role?: string;
  errorClass?: string;
}

export interface GuestEnforcement {
  attempted: boolean;
  applied: boolean;
  reason?: string;
  roleReverted?: boolean;
  disassociated?: boolean;
  roleError?: string;
  disassociateError?: string;
}

export interface CreateGuestResponse {
  guest: Guest;
  activation: GuestActivation;
}

export interface RevokeGuestResponse {
  guest: Guest;
  enforcement: GuestEnforcement | null;
}

export interface DeleteGuestResponse {
  outcome: 'DELETED' | 'REVOKED';
  guest: Guest | null;
  enforcement: GuestEnforcement | null;
}

/**
 * A failed guest request, carrying enough for the UI to say something specific.
 *
 * `code` distinguishes the two cases an operator can act on immediately:
 * `NOT_CONFIGURED` (nobody wired the portal link up) and `DUPLICATE_ACTIVE`
 * (this MAC is already authorized, and here is the existing record).
 */
export class GuestRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string | null = null,
    public readonly guest: Guest | null = null,
    public readonly detail: string | null = null
  ) {
    super(message);
    this.name = 'GuestRequestError';
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
  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: buildHeaders(),
    signal,
  });

  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON error body; the status alone still tells the operator something */
    }
    throw new GuestRequestError(
      response.status,
      (body.error as string) ?? `Request failed (${response.status})`,
      (body.code as string) ?? null,
      (body.guest as Guest) ?? null,
      (body.detail as string) ?? null
    );
  }

  return (await response.json()) as T;
}

export interface GuestQuery {
  status?: GuestStatus[];
  search?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  cursor?: string;
}

function buildQuery(query: GuestQuery): string {
  const search = new URLSearchParams();
  if (query.status?.length) search.set('status', query.status.join(','));
  if (query.search?.trim()) search.set('search', query.search.trim());
  if (query.startTime) search.set('start_time', query.startTime);
  if (query.endTime) search.set('end_time', query.endTime);
  if (query.limit) search.set('limit', String(query.limit));
  if (query.cursor) search.set('cursor', query.cursor);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export interface CreateGuestInput {
  macAddress: string;
  displayName?: string;
  notes?: string;
  /** Minutes of access; omitted means no expiry. */
  durationMinutes?: number;
}

export const guestService = {
  list(query: GuestQuery = {}, signal?: AbortSignal): Promise<GuestListResponse> {
    return request<GuestListResponse>(buildQuery(query), {}, signal);
  },

  summary(signal?: AbortSignal): Promise<GuestSummaryResponse> {
    return request<GuestSummaryResponse>('/summary', {}, signal);
  },

  get(id: string, signal?: AbortSignal): Promise<{ guest: Guest }> {
    return request<{ guest: Guest }>(`/${encodeURIComponent(id)}`, {}, signal);
  },

  create(input: CreateGuestInput): Promise<CreateGuestResponse> {
    return request<CreateGuestResponse>('', {
      method: 'POST',
      body: JSON.stringify({
        mac_address: input.macAddress,
        display_name: input.displayName || undefined,
        notes: input.notes || undefined,
        duration_minutes: input.durationMinutes || undefined,
      }),
    });
  },

  revoke(id: string): Promise<RevokeGuestResponse> {
    return request<RevokeGuestResponse>(`/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
  },

  remove(id: string): Promise<DeleteGuestResponse> {
    return request<DeleteGuestResponse>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
