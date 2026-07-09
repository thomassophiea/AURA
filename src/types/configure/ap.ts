/**
 * Per-AP configuration document (`/v1/aps/{serialNumber}`) — derived from a
 * live AP5010 record (api/ap-detail-sample.json). The `*Ovr` boolean pattern
 * marks fields overridden from the profile-inherited value.
 */
import type { FeatureTag, ProxiedScope } from './common';
import type { PeapCredential, SmartPollConfig } from './profile';

export interface ApFtm {
  wgs84: { latitude: number; longitude: number; altitude: number };
  wgs84Ovr: boolean;
  zSubelement: {
    expectedToMove: boolean;
    floorNumber: number;
    aboveFloor: { height: number; uncertainty: number };
  };
  civicAddress: { addr: string; ovr: boolean };
}

export interface ApRadioWlanEntry {
  bssid: string;
  ssid: string;
}

/** Per-AP radio state + overrides (superset of the profile radio template). */
export interface ApRadio {
  custId: string | null;
  id: string | null;
  canDelete: boolean | null;
  canEdit: boolean | null;
  radioIndex: number;
  mode: string;
  channelwidth: string;
  adminState: boolean;
  useSmartRf: boolean;
  txMaxPower: number;
  txPower: number;
  channel: string | number | null;
  reqChannel: string;
  opChannel: string;
  aggregateMpdu: string;
  txBf: string;
  stbc: boolean;
  stbcOvr: boolean;
  adminStateOvr: boolean;
  ldpc: string;
  attenuation: number;
  mbr: string;
  mbrOvr: boolean;
  dtim: number;
  dtimOvr: boolean;
  dot11gPM: string;
  dot11gPMOvr: boolean;
  aggMsdu: boolean;
  aggMsduOvr: boolean;
  aggMpduOvr: boolean;
  aggMpduSF: number;
  aggMpduSFOvr: boolean;
  addba: boolean;
  addbaOvr: boolean;
  ldpcOvr: boolean;
  txbfOvr: boolean;
  probeSuppRssTh: number;
  probeSuppRssThOvr: boolean;
  probeSuppOnLowRss: boolean;
  probeSuppOnLowRssOvr: boolean;
  deasscOnLowRss: boolean;
  deasscOnLowRssOvr: boolean;
  fallbackChannels: unknown[];
  wlan: ApRadioWlanEntry[];
  mesh: unknown[];
  cb: unknown[];
  ofdma: string;
  ofdmaOvr: boolean;
  maxClientsOvr: boolean;
  maxClients: number;
  bsscolor: number;
  bsscolorOvr: boolean;
  twt: boolean;
  twtOvr: boolean;
  dfsRevert: boolean;
  dfsRevertHoldTime: number;
  dfsRevertClientAware: number;
  gi: string;
  maxProbeRty: number;
  rssOffset: number;
  atf: string;
  maxDistance: number;
  giOvr: boolean;
  maxProbeRtyOvr: boolean;
  rssOffsetOvr: boolean;
  atfOvr: boolean;
  maxDistanceOvr: boolean;
  radioName: string;
  chInspect: boolean;
  inBandDiscovery: string;
  inBandDiscoveryOvr: boolean;
  cbServiceId: string | null;
  mc2uc: string;
  mc2ucOvr: boolean;
  rtsCts: boolean;
  rtsCtsOvr: boolean;
  pwrMode6: string;
  pwrMode6Ovr: boolean;
  afc: boolean;
}

export interface ApMeshpointBandSetting {
  bandId: string;
  txPower: number;
  acsPlan: string;
  acsList: number[] | unknown[];
  pathMin: number;
  pathThreshold: number;
  tolerancePeriod: number;
  txPowerOvr: boolean;
  acsPlanOvr: boolean;
  acsListOvr: boolean;
  pathMinOvr: boolean;
  pathThresholdOvr: boolean;
  tolerancePeriodOvr: boolean;
}

export interface ApMeshpointBinding {
  meshpointId: string;
  pathSelectionMethod: string;
  monitorCrm: boolean;
  monitorPrimaryLink: boolean;
  preferredNeighbor: string | null;
  preferredRoot: string | null;
  preferredBand: string;
  hysteresisMinTh: number;
  hysteresisPeriod: number;
  hysteresisDelta: number;
  hysteresisSNRDelta: number;
  excludeWiredPeer: boolean;
  meshRoot: boolean;
  meshRootOvr: boolean;
  costRoot: boolean;
  rootSelectionMethod: string;
  pathSelectionMethodOvr: boolean;
  monitorCrmOvr: boolean;
  monitorPrimaryLinkOvr: boolean;
  preferredNeighborOvr: boolean;
  preferredRootOvr: boolean;
  preferredBandOvr: boolean;
  hysteresisMinThOvr: boolean;
  hysteresisPeriodOvr: boolean;
  hysteresisDeltaOvr: boolean;
  hysteresisSNRDeltaOvr: boolean;
  excludeWiredPeerOvr: boolean;
  costRootOvr: boolean;
  rootSelectionMethodOvr: boolean;
  bandSettings: ApMeshpointBandSetting[];
}

export interface ApEthPort {
  name: string;
  speed: string;
  mode: string;
  power: string;
}

export interface ApWiredPort {
  portIndex: number;
  portName: string;
  energyEffEth: boolean;
  ethMode: string;
  ethSpeed: string;
}

export interface ApElevation {
  height: number;
  heightReference: string | null;
  uncertainty: number;
}

export interface ApDetail {
  canDelete: boolean;
  canEdit: boolean;
  serialNumber: string;
  hardwareType: string;
  platformName: string;
  macAddress: string;
  apName: string;
  softwareVersion: string;
  hostSite: string;
  description: string;
  ftm: ApFtm;
  ethPowerStatus: string;
  powerSource: string;
  pwrSource: string;
  services: string[];
  features: FeatureTag[];
  ipAddress: string;
  ipNetmask: string;
  ipGateway: string;
  radios: ApRadio[];
  ledStatus: string;
  ledStatusOvr: boolean;
  supportedCountries: string[];
  location: string;
  environment: string;
  maintainClientSession: string;
  apPersistence: string;
  captureTimeout: number;
  mcastAssembly: boolean;
  addrAssn: boolean;
  home: string;
  adoptedBy: string;
  approvedStatus: string;
  lldpEnabled: boolean;
  lbsEnabled: boolean;
  autoTxPowerMin: boolean;
  bcastForDisassoc: boolean;
  ethMode: string;
  ethSpeed: string;
  acList: unknown[];
  mgmtVlanId: number;
  mgmtVlanIdOvr: boolean;
  mtu: number;
  mtuOvr: boolean;
  lag: boolean;
  lagOvr: boolean;
  forcePoEPlus: boolean;
  profileId: string;
  rfMgmtPolicyId: string;
  proxied: ProxiedScope;
  meshpoints: ApMeshpointBinding[];
  hostname: string;
  pollTimeout: number;
  pollTimeoutOvr: boolean;
  intVni: number;
  intIpAddr: string;
  bandPreference: boolean;
  roleIDs: string[];
  radioIfList: Array<{ serviceId: string; index: number }>;
  radioIfListOvr: boolean;
  ge2mode: string;
  ge2modeOvr: boolean;
  cbUser: string;
  cbPassword: string;
  peapUsername: PeapCredential;
  peapUsernameOvr: boolean;
  peapPassword: PeapCredential;
  peapPasswordOvr: boolean;
  enforcePkiAuth: boolean;
  enforcePkiAuthOvr: boolean;
  faAuthKey: string;
  faAuthKeyOvr: boolean;
  topologyIDs: string[];
  smartPoll: SmartPollConfig;
  smartPollOvr: boolean;
  cbRssThreshold: number;
  cbRssThresholdOvr: boolean;
  switchPorts: string[];
  bandSteeringServiceIds: string[] | unknown[];
  ethPorts: ApEthPort[];
  complianceRegion: string;
  ovr: boolean;
  wiredIfList: unknown[];
  wiredPorts: ApWiredPort[];
  wiredPortsOvr: boolean;
  usbPower: string;
  usbPowerOvr: boolean;
  psePower: string;
  psePowerOvr: boolean;
  affinity: string;
  affinityOvr: boolean;
  apLogLevel: string;
  apLogLevelOvr: boolean;
  edge: boolean;
  edgeOvr: boolean;
  sshEnabled: boolean;
  sshEnabledOvr: boolean;
  gpsAnchor: boolean;
  gpsAntennaDistance: number;
  elevation: ApElevation;
  elevationOvr: boolean;
  iotEnabled: boolean;
  mloServiceIDs: string[] | unknown[];
}
