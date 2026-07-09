/**
 * WLAN editor form state: the API record plus a separate `ui` block for
 * controller-side UI-model fields (aaaConf / selectedCpConfig / openRoaming)
 * that are NOT part of the persisted /v1/services document. Save persists
 * exactly the API record with a single derived privacy element (parity gap
 * #32: strip UI-only keys, never orphan a stale element).
 */
import type { ServicePrivacy, WlanService } from '../../../types/configure';
import {
  AUTH_TO_ELEMENT,
  deriveAuthType,
  isEnterprise,
  isPureWpa3,
  readPrivacyElement,
  type WlanAuthType,
} from './wlanModel';

export interface WalledGardenRule {
  domain: string;
  ip: string;
  port: string;
}

export interface EGuestSetting {
  id: string;
  useRadiusAuthentication: boolean;
  useRadiusAccounting: boolean;
}

/** Editor-session state mirroring controller UI models (not persisted). */
export interface WlanUiState {
  authType: WlanAuthType;
  authMethod: string;
  ldapConfig: string;
  localMacAuth: boolean;
  /** Ordered proxy-RADIUS server picks (RADIUS Server 1-4, IP values). */
  radiusServers: string[];
  portalName: string;
  portalInterface: string;
  cpRedirect: string;
  cpIdentity: string;
  cpSharedKey: string;
  cpRedirectUrlSelect: string;
  cpDefaultRedirectUrl: string;
  cpUseFqdn: boolean;
  cpHttps: boolean;
  cpRedirectPorts: number[];
  walledGardenRules: WalledGardenRule[];
  trustPoint: string;
  wbaId: string;
  hs20QosMap: boolean;
}

export interface WlanFormState {
  record: WlanService;
  ui: WlanUiState;
}

/**
 * Controller wlanModel blocks the reference implementation persists alongside
 * the record (selectedCpConfig / aaaConf / openRoamingModel). Read on load,
 * written back by buildWlanPayload only for the contexts that use them.
 */
export interface PersistedWlanExtras {
  selectedCpConfig?: {
    name?: string;
    selectedPortalInterface?: string;
    cpRedirectPorts?: number[];
    wallGardenRole?: {
      cpRedirect?: string;
      cpIdentity?: string;
      cpSharedKey?: string;
      cpRedirectUrlSelect?: string;
      cpDefaultRedirectUrl?: string;
      cpHttp?: boolean;
      cpUseFQDN?: boolean;
      rules?: WalledGardenRule[];
    };
  };
  aaaConf?: {
    selectedAuthMethod?: string;
    localMacAuth?: boolean;
    radiusServers?: (string | null)[];
    ldapConf?: string;
  };
  openRoamingModel?: { trustPoint?: string; wbaId?: string };
}

export type WlanRecord = WlanService & PersistedWlanExtras;

function readHs20QosMap(hotspot: unknown): boolean {
  if (hotspot && typeof hotspot === 'object') {
    const hs20 = (hotspot as { hs20?: { qosMap?: boolean } }).hs20;
    return !!hs20?.qosMap;
  }
  return false;
}

const normalizeRule = (rule: Partial<WalledGardenRule>): WalledGardenRule => ({
  domain: String(rule.domain ?? ''),
  ip: String(rule.ip ?? ''),
  port: String(rule.port ?? ''),
});

/** Build editor state from a record (edit/clone) or the /default seed (add). */
export function createFormState(seed: WlanService): WlanFormState {
  const record = structuredClone(seed) as WlanRecord;
  const cp = record.selectedCpConfig;
  const garden = cp?.wallGardenRole;
  const aaaConf = record.aaaConf;
  const roaming = record.openRoamingModel;
  return {
    record,
    ui: {
      authType: deriveAuthType(record),
      authMethod: aaaConf?.selectedAuthMethod ?? 'Default',
      ldapConfig: aaaConf?.ldapConf ?? '',
      localMacAuth: !!aaaConf?.localMacAuth,
      radiusServers: [0, 1, 2, 3].map((slot) => aaaConf?.radiusServers?.[slot] ?? ''),
      portalName: cp?.name ?? '',
      portalInterface: cp?.selectedPortalInterface ?? '',
      cpRedirect: garden?.cpRedirect ?? '',
      cpIdentity: garden?.cpIdentity ?? '',
      cpSharedKey: garden?.cpSharedKey ?? '',
      cpRedirectUrlSelect: garden?.cpRedirectUrlSelect ?? 'ORIGINALDESTINATION',
      cpDefaultRedirectUrl: garden?.cpDefaultRedirectUrl ?? '',
      cpUseFqdn: !!garden?.cpUseFQDN,
      cpHttps: garden?.cpHttp ?? true,
      cpRedirectPorts: [...(cp?.cpRedirectPorts ?? [])],
      walledGardenRules: (garden?.rules ?? []).map(normalizeRule),
      trustPoint: roaming?.trustPoint ?? '',
      wbaId: roaming?.wbaId ?? '',
      hs20QosMap: readHs20QosMap(record.hotspot),
    },
  };
}

/** Immutably set one field inside the active privacy element. */
export function withPrivacyField(
  form: WlanFormState,
  key: string,
  value: unknown
): WlanFormState {
  const element = AUTH_TO_ELEMENT[form.ui.authType];
  if (!element) return form;
  const privacy: ServicePrivacy = { ...(form.record.privacy ?? {}) };
  const current = privacy[element];
  privacy[element] = {
    ...(current && typeof current === 'object' ? (current as Record<string, unknown>) : {}),
    [key]: value,
  };
  return { ...form, record: { ...form.record, privacy } };
}

/* Validation rules live in wlanValidation.ts; re-exported for import stability. */
export {
  showMobilityDomainId,
  validateWlan,
  wepKeyExpectedLength,
  type WlanErrors,
} from './wlanValidation';

/**
 * Build the persisted API document: exactly one privacy element for the
 * chosen auth type (pure WPA3 pins pmfMode to required), hotspot hs20.qosMap
 * folded in when Hotspot is Enabled, the controller UI-model blocks
 * (selectedCpConfig / aaaConf / openRoamingModel) serialized only for the
 * contexts that use them, and no flat UI-only keys.
 */
export function buildWlanPayload(form: WlanFormState): WlanService {
  const out = structuredClone(form.record) as WlanRecord;
  const { ui } = form;
  const element = AUTH_TO_ELEMENT[ui.authType];
  if (element) {
    const keep = readPrivacyElement(out.privacy, ui.authType) as Record<string, unknown>;
    if (isPureWpa3(ui.authType)) keep.pmfMode = 'required';
    out.privacy = { [element]: { ...keep } };
  } else {
    out.privacy = null;
  }
  if (out.hotspotType === 'Enabled') {
    const hotspot =
      out.hotspot && typeof out.hotspot === 'object'
        ? (out.hotspot as Record<string, unknown>)
        : {};
    const hs20 =
      hotspot.hs20 && typeof hotspot.hs20 === 'object'
        ? (hotspot.hs20 as Record<string, unknown>)
        : {};
    out.hotspot = { ...hotspot, hs20: { ...hs20, qosMap: ui.hs20QosMap } };
  }

  // Captive-portal block: persisted while a portal is enabled (or the record
  // already carried one); dropped entirely when the portal is off and clean.
  if (out.enableCaptivePortal || out.selectedCpConfig) {
    out.selectedCpConfig = {
      name: ui.portalName,
      selectedPortalInterface: ui.portalInterface,
      cpRedirectPorts: [...ui.cpRedirectPorts],
      wallGardenRole: {
        cpRedirect: ui.cpRedirect,
        cpIdentity: ui.cpIdentity,
        cpSharedKey: ui.cpSharedKey,
        cpRedirectUrlSelect: ui.cpRedirectUrlSelect,
        cpDefaultRedirectUrl: ui.cpDefaultRedirectUrl,
        cpHttp: ui.cpHttps,
        cpUseFQDN: ui.cpUseFqdn,
        rules: ui.walledGardenRules.map((rule) => ({ ...rule })),
      },
    };
  }

  // Enterprise AAA block: persisted once the operator configures anything
  // beyond the Default method (or the record already carried the block).
  const aaaTouched =
    ui.authMethod !== 'Default' ||
    ui.localMacAuth ||
    ui.ldapConfig !== '' ||
    ui.radiusServers.some((ip) => ip !== '');
  if (isEnterprise(ui.authType) && (aaaTouched || out.aaaConf)) {
    out.aaaConf = {
      selectedAuthMethod: ui.authMethod,
      localMacAuth: ui.localMacAuth,
      radiusServers: [...ui.radiusServers],
      ldapConf: ui.ldapConfig,
    };
  }

  // WBA OpenRoaming block (trust point + WBAID).
  if (out.hotspotType === 'OpenRoaming' || out.openRoamingModel) {
    out.openRoamingModel = { trustPoint: ui.trustPoint, wbaId: ui.wbaId };
  }

  return out;
}
