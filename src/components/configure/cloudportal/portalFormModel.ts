/**
 * Form model for the Cloud Captive Portal editor: the draft the operator
 * edits, its round-trip to the portal's stored/effective view, and the
 * client-side validation summary. Pure, so the whole model is testable
 * without rendering anything.
 */
import type {
  PortalAccessPolicy,
  PortalConfigUpdate,
  PortalConfigView,
} from '../../../services/portalConfigService';

export type FieldMode = 'off' | 'optional' | 'required';

const ACCESS_POLICIES: readonly PortalAccessPolicy[] = ['open', 'terms', 'form', 'sponsored'];

/**
 * The design's "How guests get on": one choice, and it decides whether a
 * page is drawn at all. Copy from the CWP golden design's guided create.
 */
export const ACCESS_POLICY_OPTIONS: ReadonlyArray<{
  id: PortalAccessPolicy;
  label: string;
  description: string;
}> = [
  {
    id: 'open',
    label: 'Open — no interaction',
    description: 'The guest is authorized the moment they join. No page, no consent, no fields.',
  },
  {
    id: 'terms',
    label: 'Terms of use only',
    description: 'One tick and a button. The fastest honest option, and the default.',
  },
  {
    id: 'form',
    label: 'Guest form and terms',
    description: 'Collect details before access. Choose the fields under Guest form.',
  },
  {
    id: 'sponsored',
    label: 'Sponsored approval',
    description:
      'A guest requests access; an employee approves it by email before the session opens.',
  },
];

export type BrandFooterChoice = 'default' | 'powered' | 'none';

/** Swatches from the golden design. Every one clears 4.5:1 with white ink. */
export const BRAND_SWATCHES: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: '#4b449b', label: 'Extreme purple' },
  { hex: '#6930df', label: 'Platform ONE' },
  { hex: '#0f766e', label: 'Teal' },
  { hex: '#1d4ed8', label: 'Signal blue' },
  { hex: '#374151', label: 'Graphite' },
];

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** WCAG contrast of white ink on a #rrggbb colour — mirrors the portal's check. */
export function contrastAgainstWhite(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05);
}

export function isAcceptableBrandColor(value: string): boolean {
  return HEX_COLOR_RE.test(value) && contrastAgainstWhite(value) >= 4.5;
}

export interface FormState {
  /** '' = no override stored; the portal derives terms/form from its config. */
  accessPolicy: PortalAccessPolicy | '';
  /** Administrators see these; guests never do. '' = unset. */
  displayName: string;
  description: string;
  /** '' = the portal default colour. */
  brandColor: string;
  /** '' = the portal default (centred). */
  brandAlignment: '' | 'left' | 'center' | 'right';
  brandFooter: BrandFooterChoice;
  /** Offered locale codes; [] = all of them. */
  localeSubset: string[];
  /** '' = the localized default terms. */
  termsText: string;
  privacyPolicyEnabled: boolean;
  /** '' = the shipped default text. */
  privacyPolicyText: string;
  marketingEnabled: boolean;
  marketingText: string;
  /** Unset mirrors the portal's own effective state, not a hardcoded default. */
  sponsorshipEnabled: boolean;
  /** Comma-separated; blank = use the service environment's domains. */
  domainsText: string;
  /** Comma-separated; blank = any mailbox at an allowed domain. */
  addressesText: string;
  ttlSeconds: number | '';
  maxPerSession: number | '';
  fieldModes: Record<string, FieldMode>;
  /** The secure-onboarding offer. True mirrors the portal's null default. */
  secureAccessEnabled: boolean;
}

export const FIELD_LABELS: Record<string, string> = {
  fullName: 'Full name',
  email: 'Email address',
  phone: 'Phone number',
  company: 'Company',
  roomNumber: 'Room number',
};

export const FIELD_MODE_OPTIONS = [
  { id: 'off', label: 'Not collected' },
  { id: 'optional', label: 'Optional' },
  { id: 'required', label: 'Required' },
] as const;

export const CREDENTIAL_SOURCE_LABELS: Record<string, string> = {
  'shared-passphrase': 'Shared passphrase',
  'per-device-ppsk': 'Per-device key (PPSK)',
  certificate: 'Certificate',
};

export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function formFromView(view: PortalConfigView): FormState {
  const managed = view.stored.guestFieldsEnabled !== null;
  const enabled = new Set(
    managed ? view.stored.guestFieldsEnabled! : view.effective.guestFields.map((f) => f.id)
  );
  const required = new Set(
    managed
      ? (view.stored.guestFieldsRequired ?? [])
      : view.effective.guestFields.filter((f) => f.required).map((f) => f.id)
  );
  const fieldModes: Record<string, FieldMode> = {};
  for (const field of view.fieldCatalogue) {
    fieldModes[field.id] = required.has(field.id)
      ? 'required'
      : enabled.has(field.id)
        ? 'optional'
        : 'off';
  }
  const storedPolicy = view.stored.accessPolicy;
  const alignment = view.stored.brandAlignment;
  return {
    accessPolicy: ACCESS_POLICIES.includes(storedPolicy as PortalAccessPolicy)
      ? (storedPolicy as PortalAccessPolicy)
      : '',
    displayName: view.stored.displayName ?? '',
    description: view.stored.description ?? '',
    brandColor: view.stored.brandColor ?? '',
    brandAlignment:
      alignment === 'left' || alignment === 'center' || alignment === 'right' ? alignment : '',
    brandFooter:
      view.stored.brandFooterEnabled === true
        ? 'powered'
        : view.stored.brandFooterEnabled === false
          ? 'none'
          : 'default',
    localeSubset: view.stored.localesEnabled ?? [],
    termsText: view.stored.termsText ?? '',
    privacyPolicyEnabled: view.stored.privacyPolicyEnabled === true,
    privacyPolicyText: view.stored.privacyPolicyText ?? '',
    marketingEnabled: view.stored.marketingEnabled === true,
    marketingText: view.stored.marketingText ?? '',
    // Unset falls back to what the portal is actually doing right now, not a
    // hardcoded guess — an unconfigured portal shouldn't preview a sponsored-
    // access offer it was never asked to make.
    sponsorshipEnabled: view.stored.sponsorshipEnabled ?? view.effective.sponsorship.enabled,
    domainsText: view.stored.sponsorAllowedDomains?.join(', ') ?? '',
    addressesText: view.stored.sponsorAllowedAddresses?.join(', ') ?? '',
    ttlSeconds: view.stored.sponsorshipTtlSeconds ?? '',
    maxPerSession: view.stored.sponsorshipMaxPerSession ?? '',
    fieldModes,
    secureAccessEnabled: view.stored.secureAccessEnabled ?? true,
  };
}

export function updateFromForm(form: FormState): PortalConfigUpdate {
  const domains = splitList(form.domainsText);
  const addresses = splitList(form.addressesText);
  const enabled: string[] = [];
  const required: string[] = [];
  for (const [id, mode] of Object.entries(form.fieldModes)) {
    if (mode !== 'off') enabled.push(id);
    if (mode === 'required') required.push(id);
  }
  return {
    accessPolicy: form.accessPolicy === '' ? null : form.accessPolicy,
    displayName: form.displayName.trim() === '' ? null : form.displayName.trim(),
    description: form.description.trim() === '' ? null : form.description.trim(),
    brandColor: form.brandColor === '' ? null : form.brandColor.toLowerCase(),
    brandAlignment: form.brandAlignment === '' ? null : form.brandAlignment,
    brandFooterEnabled: form.brandFooter === 'default' ? null : form.brandFooter === 'powered',
    localesEnabled: form.localeSubset.length === 0 ? null : form.localeSubset,
    termsText: form.termsText.trim() === '' ? null : form.termsText,
    privacyPolicyEnabled: form.privacyPolicyEnabled ? true : null,
    privacyPolicyText: form.privacyPolicyText.trim() === '' ? null : form.privacyPolicyText,
    marketingEnabled: form.marketingEnabled ? true : null,
    marketingText: form.marketingText.trim() === '' ? null : form.marketingText,
    sponsorshipEnabled: form.sponsorshipEnabled,
    sponsorAllowedDomains: domains.length > 0 ? domains : null,
    sponsorAllowedAddresses: addresses.length > 0 ? addresses : null,
    sponsorshipTtlSeconds: form.ttlSeconds === '' ? null : form.ttlSeconds,
    sponsorshipMaxPerSession: form.maxPerSession === '' ? null : form.maxPerSession,
    guestFieldsEnabled: enabled,
    guestFieldsRequired: required,
    secureAccessEnabled: form.secureAccessEnabled,
  };
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  text: string;
}

/**
 * The policy the guest experiences for a given draft: the draft's explicit
 * choice, else the portal's resolved value, else the same derivation the
 * portal applies (form when any field is collected, otherwise terms).
 */
export function selectedAccessPolicy(form: FormState, view: PortalConfigView): PortalAccessPolicy {
  if (form.accessPolicy !== '') return form.accessPolicy;
  if (view.effective.accessPolicy) return view.effective.accessPolicy;
  const anyField = Object.values(form.fieldModes).some((mode) => mode !== 'off');
  return anyField ? 'form' : 'terms';
}

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The blocking-issue list shown above the editor. Errors block Save in the
 * UI; warnings describe configurations the portal will accept but that a
 * guest will experience differently than the switches suggest. The portal
 * still validates everything server-side — this is the early copy of the
 * same verdicts, not a substitute for them.
 */
export function validationIssues(form: FormState, view: PortalConfigView): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const domain of splitList(form.domainsText)) {
    if (!DOMAIN_RE.test(domain)) {
      issues.push({ severity: 'error', text: `"${domain}" is not a valid sponsor domain.` });
    }
  }
  for (const address of splitList(form.addressesText)) {
    if (!EMAIL_RE.test(address)) {
      issues.push({ severity: 'error', text: `"${address}" is not a valid sponsor address.` });
    }
  }
  if (form.ttlSeconds !== '' && (form.ttlSeconds < 60 || form.ttlSeconds > 86400)) {
    issues.push({
      severity: 'error',
      text: 'Approval window must be between 60 and 86,400 seconds.',
    });
  }
  if (form.maxPerSession !== '' && (form.maxPerSession < 1 || form.maxPerSession > 10)) {
    issues.push({
      severity: 'error',
      text: 'Requests per guest session must be between 1 and 10.',
    });
  }

  const policy = selectedAccessPolicy(form, view);
  const sponsorshipAvailable = form.sponsorshipEnabled && view.effective.emailTransport !== null;
  if (policy === 'sponsored' && !sponsorshipAvailable) {
    issues.push({
      severity: 'warning',
      text:
        view.effective.emailTransport === null
          ? 'Sponsored approval needs an email transport the portal does not have; the portal will fall back to terms acceptance.'
          : 'Sponsored approval requires the sponsorship offer, which is switched off below; the portal will fall back to terms acceptance.',
    });
  }
  if (policy === 'open') {
    const hidden: string[] = [];
    if (form.sponsorshipEnabled) hidden.push('sponsorship');
    if (form.secureAccessEnabled && view.effective.secureAccess?.configured) {
      hidden.push('secure access');
    }
    if (form.privacyPolicyEnabled) hidden.push('the privacy-terms tick');
    if (form.marketingEnabled) hidden.push('the marketing tick');
    if (hidden.length > 0) {
      issues.push({
        severity: 'warning',
        text: `Open access draws no page, so ${hidden.join(' and ')} cannot be offered while it is selected.`,
      });
    }
  }
  const anyField = Object.values(form.fieldModes).some((mode) => mode !== 'off');
  if (policy === 'form' && !anyField) {
    issues.push({
      severity: 'warning',
      text: 'Guest form is selected but no fields are enabled, so the page renders like Terms of use only.',
    });
  }
  if ((policy === 'terms' || policy === 'open') && anyField) {
    issues.push({
      severity: 'warning',
      text: 'Guest details are configured but not collected under this access method.',
    });
  }

  if (policy !== 'sponsored' && form.sponsorshipEnabled && view.effective.emailTransport === null) {
    issues.push({
      severity: 'warning',
      text: 'Sponsorship is switched on but the portal has no email transport, so guests will not see the option.',
    });
  }
  if (form.brandColor !== '' && !isAcceptableBrandColor(form.brandColor)) {
    issues.push({
      severity: 'error',
      text: HEX_COLOR_RE.test(form.brandColor)
        ? `Brand colour ${form.brandColor} fails contrast: white text on it measures ${contrastAgainstWhite(form.brandColor).toFixed(2)}:1 and the bar is 4.50:1.`
        : `"${form.brandColor}" is not a #rrggbb hex colour.`,
    });
  }

  const secure = view.effective.secureAccess;
  if (form.secureAccessEnabled && secure && !secure.configured) {
    issues.push({
      severity: 'warning',
      text: 'Secure access is switched on but no secure WLAN is configured on the portal service, so guests will not see the option.',
    });
  }
  if (form.secureAccessEnabled && secure?.configured && secure.network === null) {
    issues.push({
      severity: 'warning',
      text: 'The portal could not read the secure WLAN from the gateway; the offer is suppressed until it can.',
    });
  }

  return issues;
}

/** Names of the stored settings the draft would change, for the Save summary. */
export function changedSettings(form: FormState, initial: FormState): string[] {
  const changed: string[] = [];
  if (form.accessPolicy !== initial.accessPolicy) changed.push('Access method');
  if (form.displayName !== initial.displayName) changed.push('Portal name');
  if (form.description !== initial.description) changed.push('Description');
  if (form.brandColor !== initial.brandColor) changed.push('Primary colour');
  if (form.brandAlignment !== initial.brandAlignment) changed.push('Alignment');
  if (form.brandFooter !== initial.brandFooter) changed.push('Footer');
  if (form.localeSubset.join(',') !== initial.localeSubset.join(',')) changed.push('Languages');
  if (form.termsText !== initial.termsText) changed.push('Terms of service');
  if (
    form.privacyPolicyEnabled !== initial.privacyPolicyEnabled ||
    form.privacyPolicyText !== initial.privacyPolicyText
  )
    changed.push('Privacy terms');
  if (
    form.marketingEnabled !== initial.marketingEnabled ||
    form.marketingText !== initial.marketingText
  )
    changed.push('Marketing consent');
  if (form.sponsorshipEnabled !== initial.sponsorshipEnabled) changed.push('Sponsorship offer');
  if (form.domainsText !== initial.domainsText) changed.push('Sponsor domains');
  if (form.addressesText !== initial.addressesText) changed.push('Sponsor allowlist');
  if (form.ttlSeconds !== initial.ttlSeconds) changed.push('Approval window');
  if (form.maxPerSession !== initial.maxPerSession) changed.push('Requests per session');
  if (form.secureAccessEnabled !== initial.secureAccessEnabled) changed.push('Secure access offer');
  const fieldsChanged = Object.keys({ ...form.fieldModes, ...initial.fieldModes }).some(
    (id) => (form.fieldModes[id] ?? 'off') !== (initial.fieldModes[id] ?? 'off')
  );
  if (fieldsChanged) changed.push('Guest details');
  return changed;
}
