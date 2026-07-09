/**
 * WLAN (Networks) domain model for the EPB-125 Configure port.
 *
 * Auth-type <-> privacy-element mapping, hotspot gating, controller enums and
 * label derivation are verified against the XCC wlan_config.html template
 * (audit/controller-spec-v2.json "WLAN / Networks") and live records in
 * golden-eds-strict-ascend/api/services.json.
 */
import type { ServicePrivacy, WlanService } from '../../../types/configure';

/** The controller's 10 auth types (conditionals.json authSelect, exact order). */
export const WLAN_AUTH_TYPES = [
  'Open',
  'OWE',
  'WEP',
  'WPA2-Personal (PSK)',
  'WPA2-Enterprise (802.1X/EAP)',
  'WPA3-Enterprise (802.1X/EAP)',
  'WPA3-Enterprise Transition (802.1X/EAP)',
  'WPA3-Personal',
  'WPA3-Compatibility',
  'WPA3-Enterprise (192 Bits)',
] as const;
export type WlanAuthType = (typeof WLAN_AUTH_TYPES)[number];

/** Auth type -> privacy element key (element names exactly match the API). */
export const AUTH_TO_ELEMENT: Partial<Record<WlanAuthType, string>> = {
  WEP: 'WepElement',
  'WPA2-Personal (PSK)': 'WpaPskElement',
  'WPA3-Personal': 'WpaSaeElement',
  'WPA3-Compatibility': 'WpaSaePskElement',
  'WPA2-Enterprise (802.1X/EAP)': 'WpaEnterpriseElement',
  'WPA3-Enterprise (802.1X/EAP)': 'Wpa3EnterpriseElement',
  'WPA3-Enterprise Transition (802.1X/EAP)': 'Wpa3EnterpriseTransitionElement',
  'WPA3-Enterprise (192 Bits)': 'Wpa3Enterprise192bElement',
};

/** Full inverse map — legacy Dot1xElement records derive as WPA2-Enterprise. */
const ELEMENT_TO_AUTH: Record<string, WlanAuthType> = {
  WepElement: 'WEP',
  WpaPskElement: 'WPA2-Personal (PSK)',
  WpaSaeElement: 'WPA3-Personal',
  WpaSaePskElement: 'WPA3-Compatibility',
  WpaEnterpriseElement: 'WPA2-Enterprise (802.1X/EAP)',
  Dot1xElement: 'WPA2-Enterprise (802.1X/EAP)',
  Wpa3EnterpriseElement: 'WPA3-Enterprise (802.1X/EAP)',
  Wpa3EnterpriseTransitionElement: 'WPA3-Enterprise Transition (802.1X/EAP)',
  Wpa3Enterprise192bElement: 'WPA3-Enterprise (192 Bits)',
};

/**
 * Authoritative auth-type derivation: the privacy element wins; privacy null
 * with an OWE companion (or an OweElement) means OWE; otherwise Open.
 */
export function deriveAuthType(
  record: Pick<WlanService, 'privacy' | 'oweCompanion'> | null | undefined
): WlanAuthType {
  const privacy = record?.privacy;
  if (privacy) {
    for (const element of Object.keys(ELEMENT_TO_AUTH)) {
      if (privacy[element]) return ELEMENT_TO_AUTH[element];
    }
    if (privacy['OweElement']) return 'OWE';
    return 'Open';
  }
  return record?.oweCompanion ? 'OWE' : 'Open';
}

export const isEnterprise = (auth: WlanAuthType): boolean => /Enterprise/.test(auth);
export const isWpa = (auth: WlanAuthType): boolean => /WPA2|WPA3/.test(auth);
/** Pure WPA3 pins PMF to Required (Transition/Compatibility keep the full set). */
export const isPureWpa3 = (auth: WlanAuthType): boolean =>
  auth === 'WPA3-Personal' ||
  auth === 'WPA3-Enterprise (802.1X/EAP)' ||
  auth === 'WPA3-Enterprise (192 Bits)';
/** 6 GHz radios accept only WPA3 / OWE networks. */
export const allows6GHz = (auth: WlanAuthType): boolean => /WPA3/.test(auth) || auth === 'OWE';
/** Auth types carrying a pre-shared key (masked 8-63 chars / 64-hex input). */
export const hasPresharedKey = (auth: WlanAuthType): boolean =>
  auth === 'WPA2-Personal (PSK)' || auth === 'WPA3-Personal' || auth === 'WPA3-Compatibility';

/** Hotspot enum: API values Disabled/Enabled/Osu/OpenRoaming, controller labels. */
export const HOTSPOT_OPTIONS = [
  { id: 'Disabled', label: 'Disabled' },
  { id: 'Enabled', label: 'Enabled' },
  { id: 'Osu', label: 'OSU' },
  { id: 'OpenRoaming', label: 'WBA OpenRoaming' },
] as const;

const ENTERPRISE_3: WlanAuthType[] = [
  'WPA2-Enterprise (802.1X/EAP)',
  'WPA3-Enterprise (802.1X/EAP)',
  'WPA3-Enterprise Transition (802.1X/EAP)',
];

/** Hotspot mode constrains the offered auth types (conditionals.json hotspotVariants). */
export function authOptionsForHotspot(hotspotType: string): WlanAuthType[] {
  if (hotspotType === 'Enabled' || hotspotType === 'OpenRoaming') return ENTERPRISE_3;
  if (hotspotType === 'Osu') return ['Open', ...ENTERPRISE_3];
  return [...WLAN_AUTH_TYPES];
}

export const AUTH_METHODS = [
  'Default',
  'Proxy RADIUS (Failover)',
  'Proxy RADIUS (Load Balance)',
  'Local',
  'LDAP',
] as const;

export interface EnumOption {
  id: string;
  label: string;
}

/** Controller-exact privacy/security enums (XCC API values, controller labels). */
export const WLAN_ENUMS = {
  saeMethod: [
    { id: 'SaeH2e', label: 'SAE/H2E' },
    { id: 'H2eOnly', label: 'H2E Only' },
  ],
  encryption: [
    { id: 'AES_CCM_128', label: 'AES-CCM-128' },
    { id: 'AES_CCM_128_GCMP256', label: 'AES-CCM-128 & GCMP256' },
    { id: 'GCMP256', label: 'GCMP256' },
  ],
  akmSuite: [
    { id: 'AKM8_24', label: 'AKM8/AKM24' },
    { id: 'AKM24', label: 'AKM24 Only' },
  ],
  pmf: [
    { id: 'disabled', label: 'Disabled' },
    { id: 'enabled', label: 'Enabled' },
    { id: 'required', label: 'Required' },
  ],
  wpa2Mode: [
    { id: 'aesOnly', label: 'AES Only' },
    { id: 'auto', label: 'Auto' },
  ],
  wepKeyLength: [
    { id: 'WEP_64bit', label: '64 bit' },
    { id: 'Wep_128bit', label: '128 bit' },
  ],
  inputMethod: [
    { id: 'Hex', label: 'Hex' },
    { id: 'Ascii', label: 'ASCII' },
  ],
  portalType: [
    { id: 'Internal', label: 'Internal' },
    { id: 'External', label: 'External' },
    { id: 'EGuest', label: 'Extreme Guest' },
    { id: 'GuestEssentials', label: 'Guest Essentials' },
    { id: 'CWA', label: 'CWA' },
  ],
  ecpRedirect: [
    { id: 'ORIGINALDESTINATION', label: 'Original destination' },
    { id: 'URLCUSTOMIZED', label: 'Custom URL' },
  ],
} satisfies Record<string, EnumOption[]>;

/** DSCP service classes for the 64-row codePoints editor. */
export const DSCP_CLASSES: EnumOption[] = [
  { id: '0', label: '0 - Best Effort' },
  { id: '1', label: '1 - Background' },
  { id: '2', label: '2 - Spare' },
  { id: '3', label: '3 - Excellent Effort' },
  { id: '4', label: '4 - Controlled Load' },
  { id: '5', label: '5 - Video' },
  { id: '6', label: '6 - Voice' },
  { id: '7', label: '7 - Network Control' },
];

/** Loosely-typed view of one privacy element (fields cascade per auth type). */
export interface PrivacyElementFields {
  mode?: string;
  pmfMode?: string;
  presharedKey?: string;
  keyHexEncoded?: boolean;
  saeMethod?: string;
  encryption?: string;
  akmSuiteSelector?: string;
  keyLength?: string;
  keyIndex?: string;
  pskInputType?: string;
  passPhrase?: string;
  fastTransitionEnabled?: boolean;
  fastTransitionMdId?: number;
}

/** Read the active privacy element's fields for an auth type ({} when absent). */
export function readPrivacyElement(
  privacy: ServicePrivacy | null | undefined,
  auth: WlanAuthType
): PrivacyElementFields {
  const element = AUTH_TO_ELEMENT[auth];
  if (!element || !privacy) return {};
  const value = privacy[element];
  return value && typeof value === 'object' ? (value as PrivacyElementFields) : {};
}

/** Sensible controller-default fields when the user switches to an auth type. */
export function defaultPrivacyFields(auth: WlanAuthType): PrivacyElementFields {
  switch (auth) {
    case 'WPA2-Personal (PSK)':
      return { mode: 'aesOnly', pmfMode: 'disabled', presharedKey: '', keyHexEncoded: false };
    case 'WPA3-Personal':
      return {
        saeMethod: 'SaeH2e',
        encryption: 'AES_CCM_128',
        akmSuiteSelector: 'AKM8_24',
        pmfMode: 'required',
        presharedKey: '',
        keyHexEncoded: false,
      };
    case 'WPA3-Compatibility':
      return { pmfMode: 'enabled', presharedKey: '', keyHexEncoded: false };
    case 'WEP':
      return { keyLength: 'WEP_64bit', pskInputType: 'Hex', keyIndex: '1', passPhrase: '' };
    case 'WPA2-Enterprise (802.1X/EAP)':
    case 'WPA3-Enterprise Transition (802.1X/EAP)':
      return { pmfMode: 'enabled', fastTransitionEnabled: false };
    case 'WPA3-Enterprise (802.1X/EAP)':
    case 'WPA3-Enterprise (192 Bits)':
      return { pmfMode: 'required', fastTransitionEnabled: false };
    default:
      return {};
  }
}

/** Grid label for a record's privacy (WPA3-Personal, WEP, OWE, Open, ...). */
export function privacyLabel(record: WlanService): string {
  return deriveAuthType(record);
}

/** Grid label for the captive portal column. */
export function captivePortalLabel(record: WlanService): string {
  if (!record.enableCaptivePortal) return 'Disabled';
  const match = WLAN_ENUMS.portalType.find((o) => o.id === record.captivePortalType);
  return match ? match.label : (record.captivePortalType ?? 'Enabled');
}
