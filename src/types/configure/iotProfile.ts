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
  /* Summary fields observed on the live list response */
  app_supported?: unknown;
  ble_beacon?: unknown;
  ble_scan?: unknown;
}
