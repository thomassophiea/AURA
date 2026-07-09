/**
 * Access Point editor helpers — enums, band/channel/power derivation and the
 * AFC-status rule, ported verbatim from the golden reference (config-en2.js
 * apBandOf / apChannelOpts / apWidthOpts / apPowerOpts / apAfcStatus) so the
 * per-AP override editor matches controller behaviour. Field truth:
 * api/ap-detail-sample.json + audit/controller-spec-v2.json "Access Point".
 */
export interface Opt {
  id: string;
  label: string;
}

/** Controller RADIO_MODE_LABEL (config-en.jsx:188). */
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

/** apEventLevelOptions — Critical/Major/Minor/Info to controller enum values. */
export const AP_EVENT_LEVELS: Opt[] = [
  { id: 'Critical', label: 'Critical' },
  { id: 'Errors', label: 'Major' },
  { id: 'Warnings', label: 'Minor' },
  { id: 'Informational', label: 'Info' },
];

/** enums.ApWiredPortSpeeds. */
export const AP_ETH_SPEEDS: Opt[] = [
  { id: 'speedAuto', label: 'Auto' },
  { id: 'speed100Mbps', label: '100 Mbps' },
  { id: 'speed1Gbps', label: '1 Gbps' },
  { id: 'speed2_5Gbps', label: '2.5 Gbps' },
  { id: 'speed5Gbps', label: '5 Gbps' },
  { id: 'speed10Gbps', label: '10 Gbps' },
  { id: 'speedNA', label: 'N/A' },
];

/** $root.invalidCharsPattern approximation (gap 21). */
export const AP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
export const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export const MESH_BAND_LABEL: Record<string, string> = {
  Band24: '2.4 GHz',
  Band5: '5 GHz',
  Band6: '6 GHz',
};
export const PREF_BAND_LABEL: Record<string, string> = {
  BandNONE: 'None',
  Band24: '2.4 GHz',
  Band5: '5 GHz',
  Band6: '6 GHz',
};

export const PEAP_OPTS: Opt[] = [
  { id: 'NA', label: 'None' },
  { id: 'SerialNo', label: 'Serial Number' },
  { id: 'Custom', label: 'Custom' },
];

/** Band of a per-AP radio (radio 2 can run 6 GHz modes on tri-band APs). */
export const apBandOf = (r: { radioIndex: number; mode?: string }): string =>
  r.radioIndex === 1
    ? 'Band24'
    : r.mode === 'ax6' || r.mode === 'ax6be' || r.radioIndex === 3
      ? 'Band6'
      : 'Band5';

/**
 * Requested-channel lists per band with per-option max-power labels ("6: 30dBm").
 * Static regulatory stand-ins; the real controller reads per-channel ceilings
 * from the regulatory table. The record's current value is injected if missing.
 */
const AP_REQ_CHANNELS: Record<string, { max: number; chans: string[] }> = {
  Band24: { max: 24, chans: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'] },
  Band5: {
    max: 30,
    chans: ['36/40', '44/48', '52/56', '60/64', '100/104', '108/112', '116/120', '124/128', '132/136', '140/144', '149/153', '157/161', '165'],
  },
  Band6: {
    max: 36,
    chans: ['7e/80', '23e/80', '39e/80', '55e/80', '71e/80', '87e/80', '103e/80', '119e/80', '135e/80', '151e/80', '167e/80', '183e/80', '199e/80', '215e/80'],
  },
};

export const apChannelOpts = (band: string, current?: string | number | null): Opt[] => {
  const spec = AP_REQ_CHANNELS[band] ?? { max: 30, chans: [] };
  const chans = spec.chans.slice();
  if (current != null && current !== '' && chans.indexOf(String(current)) < 0) {
    chans.unshift(String(current));
  }
  return chans.map((c) => ({ id: c, label: `${c}: ${spec.max}dBm` }));
};

/** Per-band widths (gap 9): 2.4 -> 20/40; 5 -> 20/40/80/160; 6 -> +320 on BE. */
export const apWidthOpts = (band: string, mode?: string): Opt[] => {
  const mk = (n: number): Opt => ({ id: `Ch1Width_${n}MHz`, label: `${n} MHz` });
  if (band === 'Band24') return [20, 40].map(mk);
  if (band === 'Band5') return [20, 40, 80, 160].map(mk);
  return (mode === 'ax6be' ? [20, 40, 80, 160, 320] : [20, 40, 80, 160]).map(mk);
};

/** Regulatory-style power select, 1..max dBm in 1-dBm steps (gap 7). */
export const apPowerOpts = (band: string): Opt[] => {
  const max = ({ Band24: 24, Band5: 30, Band6: 36 } as Record<string, number>)[band] ?? 30;
  return Array.from({ length: max }, (_, i) => ({ id: String(i + 1), label: `${i + 1} dBm` }));
};

/** Minimal radio shape the band/AFC helpers need (ApRadio and list-row radios). */
export interface RadioLike {
  radioIndex: number;
  mode?: string;
  afc?: boolean;
  pwrMode6?: string;
}

/** AFC status derives from radios[].afc + pwrMode6, not adminState (gap 29). */
export function apAfcStatus(ap: { radios?: RadioLike[] }): string {
  const r6 = (ap.radios ?? []).find((r) => apBandOf(r) === 'Band6');
  if (!r6) return 'Not Applicable';
  if (r6.afc === true) return 'Standard Power';
  return r6.pwrMode6 === 'LPI' || r6.pwrMode6 === 'SP_WITH_LPI_FALLBACK'
    ? 'Low Power Indoor (LPI)'
    : 'Not Applicable';
}

export const hasFeature = (features: string[] | undefined, tag: string): boolean =>
  (features ?? []).indexOf(tag) >= 0;

export const inRange = (v: unknown, min: number, max: number): boolean =>
  v !== '' && v != null && !Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max;
