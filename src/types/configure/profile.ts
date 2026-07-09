/**
 * Device (AP) profile (`/v3/profiles`) — derived from the 38 live platform
 * records in api/profiles.json. Profiles have NO /default endpoint: new
 * profiles are seeded by cloning the predefined platform profile.
 */
import type { FeatureTag, ResourceBase } from './common';

/** PEAP credential selector observed on live profiles. */
export interface PeapCredential {
  selection: string; // e.g. 'serial' | 'custom'
  custom: string | null;
}

export interface SmartPollConfig {
  enabled: boolean;
  interval: number;
  deadline: number;
  targets: string[] | unknown[];
}

/** Per-radio template inside a profile (3 entries on tri-radio platforms). */
export interface ProfileRadio {
  radioName: string;
  radioIndex: number;
  mode: string; // e.g. 'anac', 'gnax'
  adminState: boolean;
  radioShare: string;
  mbr: string;
  dtim: number;
  dot11gPM: string;
  aggMsdu: boolean;
  aggregateMpdu: string;
  aggMpduSF: number;
  addba: boolean;
  txBf: string;
  rtsCts: boolean;
  stbc: boolean;
  ldpc: string;
  probeSuppRssTh: number;
  probeSuppOnLowRss: boolean;
  deasscOnLowRss: boolean;
  ofdma: string;
  bsscolor: number;
  twt: boolean;
  gi: string;
  maxProbeRty: number;
  rssOffset: number;
  atf: string;
  maxDistance: number;
  inBandDiscovery: string;
  cbServiceId: string | null;
  mc2uc: string;
  pwrMode6: string;
  maxClients: number;
  supportedModes: string[];
  ocsInterval: number;
  ocsChList: number[] | unknown[];
}

export interface ProfileWiredPort {
  portIndex: number;
  portName: string; // e.g. 'Uplink'
  ethMode: string; // 'fullDuplex' | ...
  ethSpeed: string; // 'speedAuto' | ...
  energyEffEth: boolean;
}

/** Radio-interface service binding: { serviceId, index }. */
export interface RadioIfEntry {
  serviceId: string;
  index: number;
}

export interface ApProfile extends ResourceBase {
  name: string;
  predefined: boolean;
  apPlatform: string; // e.g. 'AP5010'
  secureTunnelMode: string;
  secureTunnelLifetime: number;
  secureTunnelAp: boolean;
  bandPreference: boolean;
  sessionPersistence: boolean;
  sshEnabled: boolean;
  usePolicyZoneName: boolean;
  mtu: number;
  mgmtVlanId: number;
  mgmtVlanTagged: boolean;
  lag: boolean;
  ge2mode: string;
  apLogLevel: string;
  sensorMode: string;
  clientBalancing: boolean;
  ledStatus: string;
  pollTimeout: number;
  cbUser: string;
  cbPassword: string;
  peapUsername: PeapCredential;
  peapPassword: PeapCredential;
  enforcePkiAuth: boolean;
  faAuthKey: string;
  cbRssThreshold: number;
  usbPower: string;
  psePower: string;
  edge: boolean;
  operatingMode: string;
  smartPoll: SmartPollConfig;
  sensorChList: number[] | unknown[];
  airDefenseEssentials: boolean;
  airDefenseProfileId: string | null;
  xLocationProfileId: string | null;
  positioningProfileId: string | null;
  iotProfileId: string | null;
  analyticsProfileId: string | null;
  rtlsProfileId: string | null;
  eslProfileId: string | null;
  roleIDs: string[] | unknown[];
  referencedTopologyIDs: string[] | unknown[];
  additionalTopologyIDs: string[] | unknown[];
  radioIfList: RadioIfEntry[] | unknown[];
  wiredIfList: unknown[];
  iotList: unknown[];
  bandSteeringServiceIds: string[] | unknown[];
  mloServiceIDs: string[] | unknown[];
  radios: ProfileRadio[];
  meshpointIfList: unknown[];
  wiredPorts: ProfileWiredPort[];
  meshpoints: unknown[];
  features: FeatureTag[];
}
