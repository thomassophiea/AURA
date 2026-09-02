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
  /** Absent when the portal service predates the secure-access switch. */
  secureAccessEnabled?: boolean | null;
  /**
   * How guests get on: 'open' | 'terms' | 'form' | 'sponsored'. Null means
   * derived from configuration; absent when the portal predates the policy.
   */
  accessPolicy?: string | null;
  // ---- identity / look / language / legal (absent on older portals) ----
  displayName?: string | null;
  description?: string | null;
  brandColor?: string | null;
  brandAlignment?: string | null;
  brandFooterEnabled?: boolean | null;
  localesEnabled?: string[] | null;
  termsText?: string | null;
  privacyPolicyEnabled?: boolean | null;
  privacyPolicyText?: string | null;
  marketingEnabled?: boolean | null;
  marketingText?: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface PortalBrandingView {
  color: string;
  alignment: 'left' | 'center' | 'right';
  /** null = legacy portal-name footer; true = branded line; false = none. */
  footer: boolean | null;
  /** Always resolvable — the bundled Extreme mark when nothing is uploaded. */
  logoUrl: string;
  /** Whether `logoUrl` is an operator upload rather than the default. */
  hasCustomLogo: boolean;
  /** Null when no background image has ever been set. */
  backgroundUrl: string | null;
}

export interface PortalLegalView {
  termsText: string | null;
  privacyPolicy: { enabled: boolean; text: string };
  marketing: { enabled: boolean; text: string };
}

/** How guests get on. One choice; it decides whether a page is drawn at all. */
export type PortalAccessPolicy = 'open' | 'terms' | 'form' | 'sponsored';

/** Non-secret description of the secure WLAN, as the portal read it. */
export interface SecureNetworkView {
  ssid: string;
  security: string;
  securityLabel: string;
  hidden: boolean;
  /** Whether a Wi-Fi QR code can express this network's security mode. */
  qr: boolean;
  /** Whether an Apple configuration profile can express it. */
  appleProfile: boolean;
}

export interface SecureAccessView {
  /** A secure WLAN exists in the portal's environment. */
  configured: boolean;
  /** The consent form actually offers it. */
  enabled: boolean;
  /** null when unconfigured or the gateway was unreadable at read time. */
  network: SecureNetworkView | null;
  /** e.g. 'shared-passphrase'; per-device PPSK arrives as a new value. */
  credentialSource: string;
}

/** One field's label and placeholder inside a locale's `fields` block. */
export interface PortalPreviewFieldCopy {
  label: string;
  placeholder: string;
}

/**
 * The consent-form message catalogue for one locale — the portal's own
 * strings, so the guest preview renders the real page rather than a copy.
 * `fields` mixes the heading strings with per-field objects; use
 * `previewFieldCopy` to read a field safely.
 */
export interface PortalPreviewMessages {
  common: { portalName: string; optional: string; required: string };
  consent: {
    title: string;
    subtitle: string;
    terms: string;
    agree: string;
    submitOpen: string;
    tickToContinue: string;
    or: string;
  };
  privacy: { checkbox: string; explainer: string };
  fields: { heading: string; subheading: string } & Record<string, unknown>;
  secureOffer: { title: string; body: string; submit: string; note: string };
  sponsorship: {
    offerTitle: string;
    offerBody: string;
    sponsorEmailLabel: string;
    sponsorEmailPlaceholder: string;
    identityNote: string;
    submit: string;
  };
  security?: Record<string, string>;
}

export interface PortalPreviewCatalogue {
  locales: { code: string; nativeName: string }[];
  defaultLocale: string;
  messages: Record<string, PortalPreviewMessages>;
}

/** Label/placeholder for a guest field in one locale, when the portal has it. */
export function previewFieldCopy(
  messages: PortalPreviewMessages,
  fieldId: string
): PortalPreviewFieldCopy | null {
  const entry = (messages.fields as Record<string, unknown>)[fieldId];
  if (
    entry &&
    typeof entry === 'object' &&
    typeof (entry as PortalPreviewFieldCopy).label === 'string'
  ) {
    return entry as PortalPreviewFieldCopy;
  }
  return null;
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
    /** Absent when the portal service predates the secure-access surface. */
    secureAccess?: SecureAccessView;
    /** Session lifetimes from the portal's environment. Read-only facts. */
    session?: { portalSessionTtlSeconds: number; approvalUrlTtlSeconds: number };
    /**
     * The ECP wiring a WLAN needs to point at this portal (never the shared
     * secret). Null when the portal deployment is not fully configured;
     * absent when the portal service predates it.
     */
    ecp?: { url: string; identity: string } | null;
    /**
     * The resolved acceptance policy (null overrides already derived).
     * Absent when the portal service predates it.
     */
    accessPolicy?: PortalAccessPolicy;
    /** Resolved look. Absent when the portal service predates it. */
    branding?: PortalBrandingView;
    /** Resolved legal documents, defaults applied. Absent on older portals. */
    legal?: PortalLegalView;
    /** Offered locale codes, validated. Absent on older portals. */
    enabledLocales?: string[];
    /** RFC 8908 posture; RFC 8910 (DHCP 114 / RA) is the network's half. */
    capport?: { apiPath: string; tokenConfigured: boolean };
  };
  fieldCatalogue: { id: string; personal: boolean }[];
  envDefaults: {
    sponsorAllowedDomains: string[];
    brandColor?: string;
    privacyPolicyText?: string;
    marketingText?: string;
  };
  /** Absent when the portal service predates the preview catalogue. */
  preview?: PortalPreviewCatalogue;
}

export interface PortalConfigUpdate {
  sponsorshipEnabled?: boolean | null;
  sponsorAllowedDomains?: string[] | null;
  sponsorAllowedAddresses?: string[] | null;
  sponsorshipTtlSeconds?: number | null;
  sponsorshipMaxPerSession?: number | null;
  guestFieldsEnabled?: string[] | null;
  guestFieldsRequired?: string[] | null;
  /** Ignored by portal services that predate the switch. */
  secureAccessEnabled?: boolean | null;
  /** Null = derive from configuration. Ignored by older portal services. */
  accessPolicy?: PortalAccessPolicy | null;
  displayName?: string | null;
  description?: string | null;
  brandColor?: string | null;
  brandAlignment?: string | null;
  brandFooterEnabled?: boolean | null;
  localesEnabled?: string[] | null;
  termsText?: string | null;
  privacyPolicyEnabled?: boolean | null;
  privacyPolicyText?: string | null;
  marketingEnabled?: boolean | null;
  marketingText?: string | null;
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

async function request<T>(init: RequestInit = {}, path: string = BASE): Promise<T> {
  const response = await fetch(path, { ...init, headers: buildHeaders() });
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

export interface PortalEcpInfo {
  url: string;
  identity: string;
}

let ecpInfoPromise: Promise<PortalEcpInfo | null> | null = null;

/**
 * The managed portal's ECP wiring, for the WLAN editor's "Cloud Captive
 * Portal" choice. Cached for the session — the portal's base URL and identity
 * change on redeploys, not mid-edit. Null whenever the portal is not
 * connected, not configured, or predates the field; callers degrade to the
 * plain External flow.
 */
export function portalEcpInfo(): Promise<PortalEcpInfo | null> {
  ecpInfoPromise ??= getPortalConfig().then(
    (view) => view.effective.ecp ?? null,
    () => null
  );
  return ecpInfoPromise;
}

/** Test seam — drops the memoised ECP info. */
export function resetPortalEcpInfoCache(): void {
  ecpInfoPromise = null;
}

export function updatePortalConfig(update: PortalConfigUpdate): Promise<PortalConfigView> {
  return request<PortalConfigView>({ method: 'PUT', body: JSON.stringify(update) });
}

// ---------------------------------------------------------------------------
// Brand images — logo and background. Separate from `updatePortalConfig`
// because a base64 image payload does not belong inside that endpoint's
// otherwise-small JSON body; validation (size, decoded pixel dimensions) is
// the portal's, same as every other value here — this file only relays.

export type BrandImageKind = 'logo' | 'background';

export interface BrandImageUploadResult {
  width: number;
  height: number;
  bytes: number;
  branding: PortalBrandingView;
}

/**
 * `file` is read client-side and sent as a `data:<mime>;base64,...` URL —
 * the same shape `FileReader.readAsDataURL` produces, so a caller can pass
 * its result straight through.
 */
export function uploadPortalImage(
  kind: BrandImageKind,
  dataUrl: string,
  mimeType: string
): Promise<BrandImageUploadResult> {
  return request<BrandImageUploadResult>(
    { method: 'PUT', body: JSON.stringify({ data: dataUrl, mimeType }) },
    `${BASE}/${kind}`
  );
}

export function clearPortalImage(kind: BrandImageKind): Promise<{ branding: PortalBrandingView }> {
  return request<{ branding: PortalBrandingView }>({ method: 'DELETE' }, `${BASE}/${kind}`);
}
