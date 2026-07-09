/**
 * IoT Profile model (BUILD SPEC 1b · add-edit-iot.html). Function/application
 * option sets, the new-API read adapter (audit gap 1.6), create seeding,
 * per-mode validation, and list-summary helpers. The editor works on the flat
 * template model (api/defaults/iotprofile.json); the live GET /v3/iotprofile
 * record uses the newer ble_beacon/ble_scan schema — adaptIot maps it onto the
 * flat model so either shape renders. On save the flat model is emitted.
 */
import type {
  GenericScanVendor,
  IBeaconScan,
  IotProfile,
  IotScanBase,
} from '../../../types/configure';
import {
  RE_HEX16,
  RE_HEX32,
  RE_HEX4,
  RE_IPV4,
  RE_URL,
  RE_UUID,
  RE_VENDOR_NAME,
  intIn,
  isInt,
  nameError,
  type NamedRecord,
} from './profileModel';

export type IotFunction = 'bleBeacon' | 'bleScan' | 'threadGateway';

export const IOT_FN_OPTS: { id: IotFunction; label: string }[] = [
  { id: 'bleBeacon', label: 'BLE Beacon' },
  { id: 'bleScan', label: 'BLE Scan' },
  { id: 'threadGateway', label: 'Thread Gateway' },
];
export const IOT_APPS_BEACON = [
  { id: 'iBeaconAdvertisement', label: 'iBeacon' },
  { id: 'eddystoneAdvertisement', label: 'Eddystone-url' },
];
export const IOT_APPS_SCAN = [
  { id: 'iBeaconScan', label: 'iBeacon' },
  { id: 'eddystoneScan', label: 'Eddystone-url' },
  { id: 'genericScan', label: 'Generic BLE Scan' },
];
export const IOT_APP_LABEL: Record<string, string> = {
  iBeaconAdvertisement: 'iBeacon Advertisement',
  eddystoneAdvertisement: 'Eddystone-URL Advertisement',
  iBeaconScan: 'iBeacon Scan',
  eddystoneScan: 'Eddystone-URL Scan',
  genericScan: 'Generic BLE Scan',
  threadGateway: 'Thread Gateway',
};

export const fnOfApp = (a?: string): IotFunction =>
  a === 'iBeaconAdvertisement' || a === 'eddystoneAdvertisement'
    ? 'bleBeacon'
    : a === 'threadGateway'
      ? 'threadGateway'
      : 'bleScan';

export const FIRST_APP_OF_FN: Record<IotFunction, string> = {
  bleBeacon: 'iBeaconAdvertisement',
  bleScan: 'iBeaconScan',
  threadGateway: 'threadGateway',
};

/* ── new-API record shape (live list) ── */
interface NewBeaconApp {
  app_type?: string;
  uuid?: string;
  major?: number;
  minor?: number;
  measured_rss?: number;
  advertise_interval?: number;
  url?: string;
}
interface NewScanApp {
  app_type?: string;
  min_rss?: number;
  uuid?: string;
  vendors?: { vendor?: string; id?: number; name?: string }[];
}
interface NewShape {
  ble_beacon?: { applications?: NewBeaconApp[] };
  ble_scan?: {
    destination?: { udp_server?: { address?: string; port?: number } };
    applications?: NewScanApp[];
  };
}

/**
 * Flat scaffold mirroring api/defaults/iotprofile.json. Used as the base when
 * adapting a live new-shape record (which carries only ble_beacon/ble_scan and
 * none of the flat sub-objects) so every mode has a populated model to edit.
 */
export const IOT_FLAT_DEFAULTS: IotProfile = {
  id: '00000000-0000-0000-0000-000000000000',
  name: '',
  canEdit: true,
  canDelete: true,
  appId: 'iBeaconAdvertisement',
  iBeaconAdvertisement: { uuid: '00000000-0000-0000-0000-000000000000', interval: 100, major: 0, minor: 0, measuredRssi: -47 },
  iBeaconScan: { uuid: '00000000-0000-0000-0000-000000000000', destAddr: '0.0.0.0', destPort: 0, interval: 100, window: 100, minRSS: -100 },
  eddystoneAdvertisement: { url: '', interval: 100, measuredRssi: -5 },
  eddystoneScan: { destAddr: '0.0.0.0', destPort: 0, interval: 100, window: 100, minRSS: -100 },
  genericScan: { destAddr: '0.0.0.0', destPort: 0, interval: 100, window: 100, minRSS: -100, companyId: -1, vendors: [{ id: -1, name: '', vendor: 'ANY' }] },
  threadGateway: { channel: 25, shortPANId: '67C6', extPANId: '697351FF4AEC29CD', masterKey: 'BAABF2FBE3467CC254F81BE8E78D765A', networkName: '', commCredentials: 'THREADNETWORK', whiteList: [] },
};

/** Build the create scaffold from the /default record (fall back to the flat scaffold). */
export function seedIot(def: IotProfile): IotProfile {
  const s = structuredClone(def?.iBeaconAdvertisement ? def : IOT_FLAT_DEFAULTS);
  s.name = '';
  s.appId = s.appId ?? 'iBeaconAdvertisement';
  s.canEdit = true;
  s.canDelete = true;
  return s;
}

/**
 * Map a live new-shape record onto the flat editor model. Records already in
 * flat shape (carrying `appId`) pass through. The first application (beacon
 * apps first, then scan apps) drives the visible mode; the rest still populate
 * their sub-objects.
 */
export function adaptIot(record: IotProfile): IotProfile {
  // Already-flat record: overlay onto the scaffold so every sub-object exists.
  if (record.appId) return { ...structuredClone(IOT_FLAT_DEFAULTS), ...structuredClone(record) };
  // New-shape record carries none of the flat sub-objects — seed from the
  // scaffold and keep only its identity/flags, then overlay the mapped apps.
  const f = structuredClone(IOT_FLAT_DEFAULTS);
  f.id = record.id;
  f.name = record.name;
  if (record.canEdit != null) f.canEdit = record.canEdit;
  if (record.canDelete != null) f.canDelete = record.canDelete;
  const src = record as unknown as NewShape;
  let appId: string | null = null;

  for (const a of src.ble_beacon?.applications ?? []) {
    if (a.app_type === 'IBEACON' && f.iBeaconAdvertisement) {
      const b = f.iBeaconAdvertisement;
      if (a.uuid != null) b.uuid = a.uuid;
      b.major = a.major ?? 0;
      b.minor = a.minor ?? 0;
      if (a.measured_rss != null) b.measuredRssi = a.measured_rss;
      b.interval = a.advertise_interval ?? 100;
      appId ??= 'iBeaconAdvertisement';
    } else if (a.app_type === 'EDDYSTONE' && f.eddystoneAdvertisement) {
      const e = f.eddystoneAdvertisement;
      e.url = a.url ?? '';
      e.interval = a.advertise_interval ?? 100;
      if (a.measured_rss != null) e.measuredRssi = a.measured_rss;
      appId ??= 'eddystoneAdvertisement';
    }
  }

  const udp = src.ble_scan?.destination?.udp_server ?? {};
  for (const a of src.ble_scan?.applications ?? []) {
    const tgt =
      a.app_type === 'GENERIC' ? 'genericScan' : a.app_type === 'IBEACON' ? 'iBeaconScan' : 'eddystoneScan';
    const sub = f[tgt] as IotScanBase | undefined;
    if (sub) {
      if (a.min_rss != null) sub.minRSS = a.min_rss;
      if (a.uuid && tgt === 'iBeaconScan') (f.iBeaconScan as IBeaconScan).uuid = a.uuid;
      if (tgt === 'genericScan' && Array.isArray(a.vendors) && a.vendors.length && f.genericScan) {
        f.genericScan.vendors = a.vendors.map((v) => ({
          vendor: v.vendor || ((v.id ?? -1) > 0 ? 'CUSTOM' : 'ANY'),
          id: v.id ?? -1,
          name: v.name ?? '',
        }));
      }
      if (udp.address) {
        sub.destAddr = udp.address;
        sub.destPort = udp.port ?? 0;
      }
    }
    appId ??= tgt;
  }

  f.appId = appId ?? 'iBeaconAdvertisement';
  return f;
}

/**
 * Emit the flat template model. Clears each scan's external-server
 * destination when its forward toggle is off, and drops the new-shape
 * carrier keys so a live record round-trips as flat.
 */
export function toIotPayload(form: IotProfile, fwdI: boolean, fwdE: boolean): Partial<IotProfile> {
  const out = structuredClone(form) as IotProfile & Record<string, unknown>;
  if (!fwdI && out.iBeaconScan) {
    out.iBeaconScan.destAddr = '0.0.0.0';
    out.iBeaconScan.destPort = 0;
  }
  if (!fwdE && out.eddystoneScan) {
    out.eddystoneScan.destAddr = '0.0.0.0';
    out.eddystoneScan.destPort = 0;
  }
  delete out.ble_beacon;
  delete out.ble_scan;
  delete out.app_supported;
  return out;
}

const rangeErr = (v: unknown, lo: number, hi: number, what: string): string | null =>
  intIn(v, lo, hi) ? null : `${what} must be an integer between ${lo} and ${hi}`;

export interface IotValidateCtx {
  fwdI: boolean;
  fwdE: boolean;
  vendorEditing: boolean;
}

/** Per-mode validation. Returns a flat error map; empty ⇒ valid. */
export function validateIot(
  form: IotProfile,
  rows: NamedRecord[],
  ctx: IotValidateCtx
): Record<string, string | null> {
  const errs: Record<string, string | null> = { name: nameError(rows, form) };
  const scanErrs = (root: 'iBeaconScan' | 'eddystoneScan' | 'genericScan', hasUuid: boolean, destOn: boolean) => {
    const s = (form[root] ?? {}) as Partial<IBeaconScan>;
    errs[`${root}.interval`] = rangeErr(s.interval, 100, 10240, 'Scan Interval');
    errs[`${root}.window`] = !intIn(s.window, 100, 10240)
      ? 'Scan Window must be an integer between 100 and 10240'
      : isInt(s.interval) && (s.window as number) > s.interval
        ? 'Scan Window can not be bigger than Scan Interval'
        : null;
    if (hasUuid) errs[`${root}.uuid`] = RE_UUID.test(s.uuid ?? '') ? null : 'Enter a valid UUID';
    errs[`${root}.minRSS`] = intIn(s.minRSS, -100, -10) ? null : 'Min RSS must be an integer between -100 and -10';
    if (destOn) {
      errs[`${root}.destAddr`] = RE_IPV4.test(s.destAddr ?? '') ? null : 'Enter a valid IPv4 address';
      errs[`${root}.destPort`] = intIn(s.destPort, 1, 65535)
        ? null
        : 'Destination Port must be an integer between 1 and 65535';
    }
  };

  if (form.appId === 'iBeaconAdvertisement') {
    const b = form.iBeaconAdvertisement;
    errs['ib.interval'] = rangeErr(b?.interval, 100, 10240, 'Advertise Interval');
    errs['ib.uuid'] = RE_UUID.test(b?.uuid ?? '') ? null : 'Enter a valid UUID';
    errs['ib.major'] = rangeErr(b?.major, 0, 65535, 'Major');
    errs['ib.minor'] = rangeErr(b?.minor, 0, 65535, 'Minor');
    errs['ib.rssi'] = intIn(b?.measuredRssi, -127, 127) ? null : 'Measured RSSI must be an integer between -127 and 127';
  } else if (form.appId === 'eddystoneAdvertisement') {
    const e = form.eddystoneAdvertisement;
    errs['ed.url'] = !e?.url ? 'URL is required' : RE_URL.test(e.url) ? null : 'Enter a valid URL (http:// or https://)';
    errs['ed.interval'] = rangeErr(e?.interval, 100, 10240, 'Advertise Interval');
    errs['ed.rssi'] = intIn(e?.measuredRssi, -127, 127) ? null : 'Measured RSSI must be an integer between -127 and 127';
  } else if (form.appId === 'iBeaconScan') scanErrs('iBeaconScan', true, ctx.fwdI);
  else if (form.appId === 'eddystoneScan') scanErrs('eddystoneScan', false, ctx.fwdE);
  else if (form.appId === 'genericScan') scanErrs('genericScan', false, true);
  else if (form.appId === 'threadGateway') {
    const t = form.threadGateway;
    errs['tg.name'] = t?.networkName && String(t.networkName).trim() ? null : 'Service Name is required';
    errs['tg.ch'] = rangeErr(t?.channel, 11, 26, 'Channel');
    errs['tg.span'] = RE_HEX4.test(t?.shortPANId ?? '') ? null : 'Short PAN ID must be 4 hex characters';
    errs['tg.xpan'] = RE_HEX16.test(t?.extPANId ?? '') ? null : 'Extended PAN ID must be 16 hex characters';
    errs['tg.key'] = RE_HEX32.test(t?.masterKey ?? '') ? null : 'Master Key must be 32 hex characters';
    errs['tg.cred'] = t?.commCredentials ? null : 'Commissioning Credentials are required';
  }
  if (ctx.vendorEditing) errs['vendor.editing'] = 'Finish editing the vendor row';
  return errs;
}

/* ── vendor-row validation (spec #28) ── */
export interface VendorDraft {
  vendor: string;
  name: string;
  id: number | '';
}
export const vendorNameErr = (d: VendorDraft): string | null =>
  d.vendor !== 'CUSTOM' ? null : !d.name ? 'Vendor name is required' : RE_VENDOR_NAME.test(d.name) ? null : 'Vendor name contains invalid characters';
export const vendorIdErr = (d: VendorDraft): string | null =>
  d.vendor !== 'CUSTOM' ? null : intIn(d.id, 1, 65535) ? null : 'Company ID must be an integer between 1 and 65535';
export const vendorDraftOk = (d: VendorDraft): boolean =>
  d.vendor === 'ANY' || (!vendorNameErr(d) && !vendorIdErr(d));

/* ── list-summary helpers ── */
export function iotAppsSummary(r?: IotProfile): string {
  if (!r) return '';
  if (r.appId) return IOT_APP_LABEL[r.appId] ?? r.appId;
  const src = r as unknown as NewShape;
  const out: string[] = [];
  for (const a of src.ble_beacon?.applications ?? []) {
    out.push({ IBEACON: 'iBeacon Advertisement', EDDYSTONE: 'Eddystone-URL Advertisement' }[a.app_type ?? ''] ?? a.app_type ?? '');
  }
  for (const a of src.ble_scan?.applications ?? []) {
    out.push(
      { GENERIC: 'Generic BLE Scan', IBEACON: 'iBeacon Scan', EDDYSTONE: 'Eddystone-URL Scan' }[a.app_type ?? ''] ??
        a.app_type ??
        ''
    );
  }
  return out.filter(Boolean).join(', ');
}

export function iotDestSummary(r?: IotProfile): string {
  if (!r) return '';
  if (r.appId) {
    const s = (r[r.appId as keyof IotProfile] ?? {}) as Partial<IotScanBase>;
    return s.destAddr && s.destPort ? `${s.destAddr}:${s.destPort}` : '';
  }
  const u = (r as unknown as NewShape).ble_scan?.destination?.udp_server ?? {};
  return u.address ? `${u.address}:${u.port}` : '';
}

export type { GenericScanVendor };
