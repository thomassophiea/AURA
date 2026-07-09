/**
 * Test fixtures for the Networks (WLANs) feature.
 *
 * `SKYNET` and `LAB_6GHZ` are REAL controller records copied verbatim from
 * golden-eds-strict-ascend/api/services.json (live XCC capture); `DEFAULTS`
 * mirrors api/defaults/services.json (/v1/services/default). The remaining
 * records vary only the privacy element so every derivation branch is
 * exercised on the real record shape.
 */
import type { WlanService } from '../../../types/configure';

export const DEFAULT_DSCP_CODEPOINTS = [
  2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 2, 0, 1, 0, 3, 0, 3, 0, 3, 0, 3, 0, 4, 0, 4, 0, 4, 0,
  4, 0, 5, 0, 5, 0, 5, 0, 5, 0, 0, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0,
];

/** api/defaults/services.json — the controller's new-WLAN template. */
export const DEFAULTS: WlanService = {
  id: '00000000-0000-0000-0000-000000000000',
  serviceName: '',
  status: 'enabled',
  ssid: '',
  suppressSsid: false,
  canEdit: true,
  canDelete: true,
  proxied: 'Local',
  shutdownOnMeshpointLoss: false,
  privacy: null,
  dot1dPortNumber: 99,
  enabled11kSupport: false,
  rm11kBeaconReport: false,
  rm11kQuietIe: false,
  uapsdEnabled: true,
  admissionControlVideo: false,
  admissionControlVoice: false,
  admissionControlBestEffort: false,
  admissionControlBackgroundTraffic: false,
  flexibleClientAccess: false,
  mbaAuthorization: false,
  accountingEnabled: false,
  clientToClientCommunication: true,
  includeHostname: false,
  mbo: false,
  oweAutogen: false,
  oweCompanion: null,
  purgeOnDisconnect: false,
  enable11mcSupport: false,
  beaconProtection: false,
  aaaPolicyId: null,
  mbatimeoutRoleId: null,
  roamingAssistPolicy: null,
  vendorSpecificAttributes: [],
  enableCaptivePortal: false,
  captivePortalType: null,
  eGuestPortalId: null,
  eGuestSettings: [],
  preAuthenticatedIdleTimeout: 300,
  postAuthenticatedIdleTimeout: 1800,
  sessionTimeout: 0,
  defaultTopology: null,
  defaultCoS: '1eea4d66-2607-11e7-93ae-92361f002671',
  unAuthenticatedUserDefaultRoleID: null,
  authenticatedUserDefaultRoleID: null,
  cpNonAuthenticatedPolicyName: null,
  hotspotType: 'Disabled',
  hotspot: null,
  dscp: { codePoints: [...DEFAULT_DSCP_CODEPOINTS] },
  features: ['CENTRALIZED-SITE'],
};

/** Real live record: WPA2-Personal (PSK) — api/services.json "Skynet". */
export const SKYNET: WlanService = {
  ...structuredClone(DEFAULTS),
  id: 'c8d4880b-2a54-424e-9459-46c02425f587',
  serviceName: 'Skynet',
  ssid: 'Skynet',
  dot1dPortNumber: 101,
  privacy: {
    WpaPskElement: {
      mode: 'aesOnly',
      pmfMode: 'disabled',
      presharedKey: 'Annabell7',
      keyHexEncoded: false,
    },
  },
  vendorSpecificAttributes: ['apName', 'vnsName', 'ssid'],
  defaultTopology: '3ad88dfd-ea7d-4fbf-a9b7-d44a0f865709',
  unAuthenticatedUserDefaultRoleID: '4459ee6c-2f76-11e7-93ae-92361f002671',
  authenticatedUserDefaultRoleID: '4459ee6c-2f76-11e7-93ae-92361f002671',
};

/** Real live record: WPA3-Personal (SAE) — api/services.json "LAB-6GHz". */
export const LAB_6GHZ: WlanService = {
  ...structuredClone(DEFAULTS),
  id: '2d6dd0b3-200f-4dd1-a9de-d93e5b210244',
  serviceName: 'LAB-6GHz',
  ssid: 'LAB-6GHz',
  dot1dPortNumber: 106,
  privacy: {
    WpaSaeElement: {
      pmfMode: 'required',
      presharedKey: 'TSts1232!',
      keyHexEncoded: false,
      saeMethod: 'SaeH2e',
      encryption: 'AES_CCM_128',
      akmSuiteSelector: 'AKM8_24',
    },
  },
  vendorSpecificAttributes: ['apName', 'vnsName', 'ssid'],
  defaultTopology: '3ad88dfd-ea7d-4fbf-a9b7-d44a0f865709',
  unAuthenticatedUserDefaultRoleID: '4459ee6c-2f76-11e7-93ae-92361f002671',
  authenticatedUserDefaultRoleID: '4459ee6c-2f76-11e7-93ae-92361f002671',
};

/** Build a record with a specific privacy element on the real record shape. */
export function withPrivacy(
  element: string | null,
  fields: Record<string, unknown> = {},
  extra: Partial<WlanService> = {}
): WlanService {
  return {
    ...structuredClone(DEFAULTS),
    id: 'f0000000-0000-0000-0000-00000000000f',
    serviceName: 'Fixture',
    ssid: 'Fixture',
    privacy: element ? { [element]: fields } : null,
    ...extra,
  };
}
