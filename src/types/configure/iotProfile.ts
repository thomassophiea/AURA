/**
 * IoT profile (`/v3/iotprofile`) — derived from the /default template (full
 * per-app blocks) plus the live list record, which carries a divergent
 * summary shape (app_supported / ble_beacon / ble_scan); both field groups
 * are optional so a single interface covers list and editor payloads.
 */
import type { ResourceBase } from './common';

export interface IBeaconAdvertisement {
  uuid: string;
  interval: number;
  major: number;
  minor: number;
  measuredRssi: number;
  /** Multi-application model (IOT-MULTI-APP): Tx Power label, e.g. '3 dBm'. */
  txPower?: string | number;
  /** Multi-application model: Batch Reporting URL (ble_scan http_server). */
  url?: string;
}

export interface IotScanBase {
  destAddr: string;
  destPort: number;
  interval: number;
  window: number;
  minRSS: number;
}

export interface IBeaconScan extends IotScanBase {
  uuid: string;
}

export interface EddystoneAdvertisement {
  url: string;
  interval: number;
  measuredRssi: number;
  /** Multi-application model (IOT-MULTI-APP): Tx Power label, e.g. '3 dBm'. */
  txPower?: string | number;
}

export interface GenericScanVendor {
  id: number;
  name: string;
  vendor: string; // 'ANY' | ...
}

export interface GenericScan extends IotScanBase {
  companyId: number;
  vendors: GenericScanVendor[];
}

export interface ThreadGateway {
  channel: number;
  shortPANId: string;
  extPANId: string;
  masterKey: string;
  networkName: string;
  commCredentials: string;
  whiteList: unknown[];
}

export interface IotProfile extends ResourceBase {
  name: string;
  /** Selected application, e.g. 'iBeaconAdvertisement'. */
  appId?: string;
  iBeaconAdvertisement?: IBeaconAdvertisement;
  iBeaconScan?: IBeaconScan;
  eddystoneAdvertisement?: EddystoneAdvertisement;
  eddystoneScan?: IotScanBase;
  genericScan?: GenericScan;
  threadGateway?: ThreadGateway;
  /* ── IOT-MULTI-APP model (Gateway 10.20) ──
     `apps` is the set of concurrently enabled applications — the API already
     carries that shape as ble_beacon.applications[] / ble_scan.applications[]
     (which adaptIot reads); the single-application model collapses it to one. */
  apps?: string[];
  /** BLE reporting granularity: 'LATEST_ONLY' | 'ALL_RECORDS'. */
  bleData?: string;
  /** Shared scan Destination mode — UDP real-time monitoring. */
  iBeaconRealTimeMonitoring?: boolean;
  /** Shared scan Destination mode — HTTP batch reporting. */
  iBeaconRealBatchReporting?: boolean;
  /* Summary fields observed on the live list response */
  app_supported?: unknown;
  ble_beacon?: unknown;
  ble_scan?: unknown;
  ble_data?: unknown;
}
