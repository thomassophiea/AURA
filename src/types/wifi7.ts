/**
 * Wi-Fi 7 (802.11be) domain model — MLO (Multi-Link Operation) and AFC
 * (Automated Frequency Coordination).
 *
 * Every field maps to a value read from the live controller; see
 * audit/WIFI7_MLO_AFC_FINDINGS.md for the source-of-truth capture. The raw
 * controller shapes are ApDetail/ApRadio in types/configure/ap.ts — these are
 * the derived, presentation-oriented views the Wi-Fi 7 page renders.
 */

export type Wifi7Band = '2.4GHz' | '5GHz' | '6GHz';

/** 6 GHz power modes. LPI = Low Power Indoor; SP = Standard Power (AFC-gated). */
export type PowerMode6 = 'LPI' | 'SP' | 'SP_WITH_LPI_FALLBACK';

export const POWER_MODE6: Record<PowerMode6, { label: string; short: string; standardPower: boolean }> = {
  LPI: { label: 'Low Power Indoor', short: 'LPI', standardPower: false },
  SP: { label: 'Standard Power', short: 'SP', standardPower: true },
  SP_WITH_LPI_FALLBACK: { label: 'Standard Power (LPI fallback)', short: 'SP+LPI', standardPower: true },
};

export const POWER_MODE6_VALUES: PowerMode6[] = ['LPI', 'SP', 'SP_WITH_LPI_FALLBACK'];

/** A single radio, projected for the Wi-Fi 7 view. */
export interface Wifi7Radio {
  radioIndex: number;
  band: Wifi7Band;
  /** Raw controller mode string, e.g. `ax6be`. */
  mode: string;
  /** 802.11be / Wi-Fi 7 capable — true iff `mode` ends in `be`. */
  eht: boolean;
  adminState: boolean;
  /** Operating channel string, e.g. `23e/80`. */
  opChannel: string;
  channelWidth: string;
  channelWidthMhz: number | null;
  txMaxPower: number;
  txPower: number;
  /** Headroom given up vs the ceiling (dB). On AFC-SP radios this is the AFC cap. */
  powerCapDb: number;
  afc: boolean;
  pwrMode6: PowerMode6 | string;
  pwrMode6Ovr: boolean;
  /** True when the 6 GHz radio is running a Standard-Power mode. */
  standardPower: boolean;
  /** MLO combined-band grouping present on this radio. */
  mloGrouped: boolean;
  cbServiceId: string | null;
  /** SSIDs currently bound to this radio (from `wlan[]`). */
  boundSsids: string[];
}

export interface Wifi7Geo {
  latitude: number;
  longitude: number;
  altitude: number;
}

/** An AP, projected for the Wi-Fi 7 view. */
export interface Wifi7Ap {
  serialNumber: string;
  apName: string;
  model: string;
  softwareVersion: string;
  hostSite: string;
  /** Any radio EHT-capable. */
  ehtCapable: boolean;
  radios: Wifi7Radio[];
  /** Service IDs grouped for MLO on this AP. */
  mloServiceIDs: string[];
  geo: Wifi7Geo | null;
  elevation: { height: number; uncertainty: number } | null;
}

export interface Wifi7ServiceRef {
  id: string;
  name: string;
}

export interface ClientProtocolStat {
  protocol: string;
  count: number;
  /** 802.11be capable clients. */
  eht: boolean;
}

export interface Wifi7Summary {
  totalAps: number;
  ehtAps: number;
  ehtRadios: number;
  afcRadios: number;
  standardPowerRadios: number;
  mloConfiguredAps: number;
  totalClients: number;
  ehtClients: number;
}

export interface Wifi7Snapshot {
  aps: Wifi7Ap[];
  services: Wifi7ServiceRef[];
  clientProtocols: ClientProtocolStat[];
  summary: Wifi7Summary;
  fetchedAt: number;
  /**
   * Surfaces honest coverage gaps, e.g. runtime per-link MLO telemetry not
   * exposed by the controller. Rendered as info banners, never as fake data.
   */
  notes: string[];
}

/** Result of a write + mandatory read-back (ai-first verification discipline). */
export interface Wifi7WriteResult {
  ok: boolean;
  serialNumber: string;
  /** Human-readable description of what was verified after read-back. */
  detail: string;
  /** The re-fetched values, for the UI to reflect backend truth. */
  applied?: Record<string, unknown>;
}

export interface AfcRadioUpdate {
  afc?: boolean;
  pwrMode6?: PowerMode6;
}
