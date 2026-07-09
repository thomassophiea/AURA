/**
 * WLAN service (`/v1/services`) — derived from live records (api/services.json)
 * and the controller's /v1/services/default template.
 */
import type { FeatureTag, ProxiedScope, ResourceBase } from './common';

/** WPA2-Personal privacy element (observed on live 'Skynet' service). */
export interface WpaPskElement {
  mode: string; // e.g. 'aesOnly'
  pmfMode: string; // 'disabled' | 'enabled' | 'required'
  presharedKey: string;
  keyHexEncoded: boolean;
}

/** WPA3-SAE privacy element (observed on live service). */
export interface WpaSaeElement {
  pmfMode: string;
  presharedKey: string;
  keyHexEncoded: boolean;
  saeMethod: string; // e.g. 'SaeH2e'
  encryption: string; // e.g. 'AES_CCM_128'
  akmSuiteSelector: string; // e.g. 'AKM8_24'
}

/**
 * Privacy is a single-key discriminated envelope: exactly one element key is
 * present per service. Only PSK/SAE were observed on the lab controller;
 * other variants (enterprise, WEP, OWE) pass through as unknown until a real
 * record pins their shape.
 */
export interface ServicePrivacy {
  WpaPskElement?: WpaPskElement;
  WpaSaeElement?: WpaSaeElement;
  [element: string]: unknown;
}

export interface ServiceDscp {
  codePoints: number[]; // 64 entries
}

export interface WlanService extends ResourceBase {
  serviceName: string;
  status: string; // 'enabled' | 'disabled'
  ssid: string;
  suppressSsid: boolean;
  proxied: ProxiedScope;
  shutdownOnMeshpointLoss: boolean;
  privacy: ServicePrivacy | null;
  dot1dPortNumber: number;
  enabled11kSupport: boolean;
  rm11kBeaconReport: boolean;
  rm11kQuietIe: boolean;
  uapsdEnabled: boolean;
  admissionControlVideo: boolean;
  admissionControlVoice: boolean;
  admissionControlBestEffort: boolean;
  admissionControlBackgroundTraffic: boolean;
  flexibleClientAccess: boolean;
  mbaAuthorization: boolean;
  accountingEnabled: boolean;
  clientToClientCommunication: boolean;
  includeHostname: boolean;
  mbo: boolean;
  oweAutogen: boolean;
  oweCompanion: string | null;
  purgeOnDisconnect: boolean;
  enable11mcSupport: boolean;
  beaconProtection: boolean;
  aaaPolicyId: string | null;
  mbatimeoutRoleId: string | null;
  roamingAssistPolicy: string | null;
  vendorSpecificAttributes: string[]; // e.g. ['apName', ...]
  enableCaptivePortal: boolean;
  captivePortalType: string | null;
  eGuestPortalId: string | null;
  eGuestSettings: unknown[];
  preAuthenticatedIdleTimeout: number;
  postAuthenticatedIdleTimeout: number;
  sessionTimeout: number;
  defaultTopology: string | null;
  defaultCoS: string | null;
  unAuthenticatedUserDefaultRoleID: string | null;
  authenticatedUserDefaultRoleID: string | null;
  cpNonAuthenticatedPolicyName: string | null;
  hotspotType: string; // 'Disabled' | ...
  hotspot: unknown;
  dscp: ServiceDscp;
  features: FeatureTag[];
}
