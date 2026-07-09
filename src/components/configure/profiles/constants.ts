/**
 * Controller-exact enums, per-radio advanced field catalogue, numeric ranges
 * and mode predicates for the Device Profiles editor. Values are the ones
 * resolved from the live controller enum bundle (see profiles-parity.md UQ-3):
 * ofdma Off/Dl/Ul/Both, mcastToUcast Disabled/Auto, apEventLevel label→value,
 * ApWiredPortSpeeds speedAuto/speed100/speed10, mesh Path/RootSelectionMethod.
 */
import type { ProfileRadio } from '../../../types/configure';
import type { Opt, ProfileMesh } from './types';

/** Radio mode id → human label (covers all 14 live modes). */
export const RADIO_MODE_LABEL: Record<string, string> = {
  off: 'Off',
  sensor: 'sensor',
  bridge: 'client-bridge',
  'client-bridge': 'client-bridge',
  bg: 'b/g',
  gn: 'g/n',
  bgn: 'b/g/n',
  gnx: 'g/n/ax',
  gnstrict: 'g/n-strict',
  gnxbe: 'g/n/ax/be',
  anc: 'a/n/ac',
  acstrict: 'ac-strict',
  ancx: 'a/n/ac/ax',
  ancxbe: 'a/n/ac/ax/be',
  ax6: 'ax6',
  ax6be: 'ax6/be',
};

/** Controller md-tab order (add-edit-profile.html L76-133). */
export const PROFILE_TABS = [
  'Radios',
  'Networks',
  'Roles',
  'VLANs',
  'Air Defense',
  'IoT',
  'Meshpoints',
  'Wired Ports',
  'ESL',
  'Positioning',
  'Analytics',
  'RTLS',
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const OPERATING_MODE_OPTS: Opt[] = [
  { id: 'GENERIC', label: 'Generic' },
  { id: 'SERVICE_2_5_6', label: '2.4 / 5 / 6 GHz Service' },
  { id: 'SENSOR_SERVICE_2_5_6', label: 'Sensor + 2.4 / 5 / 6 GHz Service' },
];

/* radio band/mode predicates (add-edit-profile.html mode gates) */
export const IS_24G_MODE = (m: string) =>
  ['bg', 'gn', 'bgn', 'gnx', 'gnstrict', 'gnxbe'].indexOf(m) >= 0;
export const IS_6G_MODE = (m: string) => m === 'ax6' || m === 'ax6be';
export const IS_AX_MODE = (m: string) =>
  ['gnx', 'gnxbe', 'ancx', 'ancxbe', 'ax6', 'ax6be'].indexOf(m) >= 0;

/** getMinimumBasicRatesByRadioMode: 2.4 GHz modes add the DSSS rates. */
export const mbrOptsFor = (m: string): Opt[] =>
  (IS_24G_MODE(m) ? ['1', '2', '5.5', '11', '6', '12', '24'] : ['6', '12', '24']).map((r) => ({
    id: r,
    label: r,
  }));

/** Numeric ranges enforced by radioAdvancedProfile.html (parity gap 20). */
export const ADV_RANGES: Record<string, [number, number]> = {
  ocsInterval: [2, 100],
  maxDistance: [100, 15000],
  aggMpduSF: [2, 64],
  dtim: [1, 50],
  bsscolor: [0, 63],
  maxClients: [0, 512],
  probeSuppRssTh: [-100, -50],
  maxProbeRty: [1, 10],
  rssOffset: [0, 120],
};

type FeaturePredicate = (tag: string) => boolean;
export type AdvFieldType =
  | 'num'
  | 'bool'
  | 'chlist'
  | Opt[]
  | ((r: ProfileRadio) => Opt[]);

export interface AdvRadioField {
  key: string;
  label: string;
  type: AdvFieldType;
  show: (r: ProfileRadio, F: FeaturePredicate) => boolean;
  /** 'csc' rows render inside the Cell Size Control block. */
  group?: 'csc';
}

const opt = (ids: string[]): Opt[] => ids.map((id) => ({ id, label: id }));

/**
 * Full radioAdvancedProfile.html per-radio field set (29 controls). Option ids
 * beyond the live values follow controller naming; the ofdma/mc2uc/txBf/gi/
 * pwrMode6 id lists are controller-exact (enum bundle).
 */
export const ADV_RADIO_FIELDS: AdvRadioField[] = [
  { key: 'ocsChList', label: 'OCS Channels', type: 'chlist', show: (_r, F) => F('OCS') },
  { key: 'ocsInterval', label: 'OCS Interval [DTIMs]', type: 'num', show: (_r, F) => F('OCS') },
  { key: 'ldpc', label: 'LDPC', type: opt(['enabled', 'disabled']), show: (r) => r.mode !== 'bg' },
  { key: 'stbc', label: 'STBC', type: 'bool', show: (r) => r.mode !== 'bg' },
  {
    key: 'gi',
    label: 'Guard Interval Mode',
    type: [
      { id: 'AllowShort', label: 'Auto' },
      { id: 'ForceLong', label: 'Long' },
      { id: 'ForceQuad', label: 'Quadruple' },
    ],
    show: (_r, F) => F('CELL-SIZE-CONTROL'),
  },
  { key: 'atf', label: 'Airtime Fairness Mode', type: opt(['Off', 'On']), show: (_r, F) => F('CELL-SIZE-CONTROL') },
  { key: 'maxDistance', label: 'Maximum Distance [Meters]', type: 'num', show: (_r, F) => F('CELL-SIZE-CONTROL') },
  {
    key: 'txBf',
    label: 'Beamforming',
    type: [
      { id: 'disabled', label: 'Disabled' },
      { id: 'suMimo', label: 'TX SU-MIMO' },
      { id: 'muMimo', label: 'TX MU-MIMO' },
      { id: 'ulMuMimo', label: 'UL MU-MIMO' },
      { id: 'dlUlMuMimo', label: 'DL & UL MU-MIMO' },
    ],
    show: () => true,
  },
  {
    key: 'radioShare',
    label: 'Radio Share Mode',
    type: [
      { id: 'off', label: 'Off' },
      { id: 'inline', label: 'Inline' },
      { id: 'promiscuous', label: 'Promiscuous' },
    ],
    show: (_r, F) => F('RADIO-SHARE-MODE'),
  },
  { key: 'addba', label: 'ADDBA support', type: 'bool', show: (r) => r.mode !== 'bg' },
  { key: 'aggMsdu', label: 'Aggregate MSDU', type: 'bool', show: (r) => r.mode !== 'bg' },
  { key: 'dot11gPM', label: '802.11g protection mode', type: opt(['Auto', 'None']), show: (r) => IS_24G_MODE(r.mode) },
  { key: 'mbr', label: 'Minimum Basic Rate [Mbps]', type: (r) => mbrOptsFor(r.mode), show: () => true },
  { key: 'aggregateMpdu', label: 'Aggregate MPDU', type: opt(['enabled', 'disabled']), show: (r) => r.mode !== 'bg' },
  { key: 'aggMpduSF', label: 'Aggregate MPDU max subframes', type: 'num', show: (r) => r.mode !== 'bg' },
  { key: 'rtsCts', label: 'AMPDU RTS/CTS', type: 'bool', show: (r) => r.mode !== 'bg' },
  { key: 'dtim', label: 'DTIM [beacons]', type: 'num', show: (r) => r.mode !== 'bg' },
  {
    key: 'ofdma',
    label: 'OFDMA',
    type: [
      { id: 'Off', label: 'Off' },
      { id: 'Dl', label: 'Downlink' },
      { id: 'Ul', label: 'Uplink' },
      { id: 'Both', label: 'Both' },
    ],
    show: (r, F) => F('802.11AX-TAG') && IS_AX_MODE(r.mode),
  },
  { key: 'twt', label: 'Target Wake Time (TWT)', type: 'bool', show: (r, F) => F('802.11AX-TAG') && IS_AX_MODE(r.mode) },
  { key: 'bsscolor', label: 'BSS Color', type: 'num', show: (r, F) => F('802.11AX-TAG') && IS_AX_MODE(r.mode) },
  {
    key: 'inBandDiscovery',
    label: 'In-Band Discovery',
    type: opt(['Disabled', 'Enabled']),
    show: (r, F) => F('IN-BAND-DISCOVERY') && IS_6G_MODE(r.mode),
  },
  {
    key: 'pwrMode6',
    label: '6 GHz Power Mode',
    type: [
      { id: 'LPI', label: 'Low Power Indoor (LPI)' },
      { id: 'SP_WITH_LPI_FALLBACK', label: 'Standard Power (LPI fallback)' },
    ],
    show: (r, F) => F('6GHZ-POWER-MODE-LPI') && F('6GHZ-POWER-MODE-SP') && IS_6G_MODE(r.mode),
  },
  { key: 'maxClients', label: 'Max Clients', type: 'num', show: (_r, F) => F('HI-DEN-MAX-CLIENTS') },
  { key: 'mc2uc', label: 'Multicast to Unicast Delivery', type: opt(['Disabled', 'Auto']), show: () => true },
  // ── Cell Size Control collapsible (CELL-SIZE-CONTROL) ──
  { key: 'probeSuppOnLowRss', label: 'Probe Suppression', type: 'bool', show: (_r, F) => F('CELL-SIZE-CONTROL'), group: 'csc' },
  {
    key: 'probeSuppRssTh',
    label: 'RSS Threshold [dBm]',
    type: 'num',
    show: (r, F) => F('CELL-SIZE-CONTROL') && !!r.probeSuppOnLowRss,
    group: 'csc',
  },
  {
    key: 'deasscOnLowRss',
    label: 'Disassociate on low RSS',
    type: 'bool',
    show: (_r, F) => F('CELL-SIZE-CONTROL') && F('FORCE-DEASSOC-ON-LOW-RSS'),
    group: 'csc',
  },
  { key: 'maxProbeRty', label: 'Max Probe Retries', type: 'num', show: (_r, F) => F('CELL-SIZE-CONTROL'), group: 'csc' },
  { key: 'rssOffset', label: 'RSS Offset [dB]', type: 'num', show: (_r, F) => F('CELL-SIZE-CONTROL'), group: 'csc' },
];

/* ── device Advanced Settings dialog enums (profileAdvanced.html) ── */
export const SECURE_TUNNEL_OPTS: Opt[] = [
  { id: 'disabled', label: 'Disabled' },
  { id: 'control', label: 'Control' },
  { id: 'controlData', label: 'Control & Data' },
  { id: 'debug', label: 'Debug' },
];
export const PEAP_OPTS: Opt[] = [
  { id: 'NA', label: 'None' },
  { id: 'SerialNo', label: 'Serial Number' },
  { id: 'Custom', label: 'Custom' },
];
// apEventLevelOptions: display labels Critical/Major/Minor/Info → wire Critical/Errors/Warnings/Informational
export const AP_LOG_LEVEL_OPTS: Opt[] = [
  { id: 'Critical', label: 'Critical' },
  { id: 'Errors', label: 'Major' },
  { id: 'Warnings', label: 'Minor' },
  { id: 'Informational', label: 'Info' },
];
export const LED_STATUS_OPTS: Opt[] = [
  { id: 'NORMAL', label: 'Normal' },
  { id: 'OFF', label: 'Off' },
];
export const SMART_POLL_INTERVAL_OPTS: Opt[] = [
  { id: '60', label: '60' },
  { id: '120', label: '120' },
  { id: '300', label: '300' },
  { id: '600', label: '600' },
];

/* ── Wired Ports enums (ApWiredPortSpeeds / duplex) ── */
export const WIRED_SPEED_OPTS: Opt[] = [
  { id: 'speedAuto', label: 'Auto' },
  { id: 'speed100', label: '100M' },
  { id: 'speed10', label: '10M' },
];
export const WIRED_DUPLEX_OPTS: Opt[] = [
  { id: 'fullDuplex', label: 'Full Duplex' },
  { id: 'halfDuplex', label: 'Half Duplex' },
];

/* ── Meshpoint advanced enums (profileMeshpointEdit.html) ── */
export const MESH_BAND_LABEL: Record<string, string> = {
  Band24: '2.4 GHz',
  Band5: '5 GHz',
  Band6: '6 GHz',
};
export const PATH_SELECTION_OPTS: Opt[] = [
  { id: 'Uniform', label: 'Uniform' },
  { id: 'SNRLeaf', label: 'SNR Leaf' },
  { id: 'MobileSNRLeaf', label: 'Mobile SNR Leaf' },
  { id: 'BoundPair', label: 'Bound Pair' },
];
export const ROOT_SELECTION_OPTS: Opt[] = [
  { id: 'None', label: 'None' },
  { id: 'AutoMint', label: 'Auto (MINT)' },
  { id: 'AutoProximity', label: 'Auto (Proximity)' },
];
export const PREFERRED_BAND_OPTS: Opt[] = [
  { id: 'BandNONE', label: 'None' },
  { id: 'Band24', label: '2.4 GHz' },
  { id: 'Band5', label: '5 GHz' },
  { id: 'Band6', label: '6 GHz' },
];
export const acsPlansFor = (bandId: string): Opt[] => {
  const plans: Opt[] = [
    { id: 'ChannelPlanAuto', label: 'Auto' },
    { id: 'ChannelPlanAll', label: 'All Channels' },
    { id: 'ChannelPlanAllNonDFS', label: 'All Non-DFS Channels' },
    { id: 'ChannelPlanCustom', label: 'Custom' },
  ];
  if (bandId === 'Band6') plans.splice(3, 0, { id: 'ChannelPlanPSC', label: 'PSC Channels' });
  return plans;
};

/** Default per-profile meshpoint record, seeded when first assigned to a radio. */
export const defaultProfileMesh = (meshpointId: string): ProfileMesh => ({
  meshpointId,
  pathSelectionMethod: 'Uniform',
  monitorCrm: false,
  monitorPrimaryLink: false,
  preferredNeighbor: null,
  preferredRoot: null,
  preferredBand: 'BandNONE',
  hysteresisMinTh: 0,
  hysteresisPeriod: 1,
  hysteresisDelta: 1,
  hysteresisSNRDelta: 1,
  excludeWiredPeer: false,
  meshRoot: false,
  meshRootOvr: true,
  costRoot: false,
  rootSelectionMethod: 'None',
  bandSettings: [
    { bandId: 'Band5', txPower: 17, acsPlan: 'ChannelPlanAllNonDFS', acsList: [], pathMin: 1000, pathThreshold: 1500, tolerancePeriod: 60 },
    { bandId: 'Band24', txPower: 17, acsPlan: 'ChannelPlanAuto', acsList: [], pathMin: 1000, pathThreshold: 1500, tolerancePeriod: 60 },
    { bandId: 'Band6', txPower: 17, acsPlan: 'ChannelPlanAll', acsList: [], pathMin: 1000, pathThreshold: 1500, tolerancePeriod: 60 },
  ],
});
