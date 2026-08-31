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

/* ── generic-scan vendor presets (Gateway 10.20 iot.directive vendorOptions) ──
   Two named Bluetooth SIG company IDs ship alongside Any/Custom; the preset
   rows carry a fixed id and take no name, so only Custom opens the
   name + Company ID editor. Present in BOTH add-edit-iot.html and
   add-edit-multi-profile.html. */
export const IOT_VENDOR_OPTS = [
  { id: 'ANY', label: 'Any' },
  { id: 'AEROSCOUT', label: 'Aeroscout (935)' },
  { id: 'CHORUS', label: 'Chorus (64689)' },
  { id: 'CUSTOM', label: 'Custom' },
] as const;
export const IOT_VENDOR_ID: Record<string, number> = { AEROSCOUT: 935, CHORUS: 64689 };

/** Canonical row for a non-CUSTOM vendor selection. */
export const iotVendorRow = (vendor: string): GenericScanVendor =>
  vendor === 'CUSTOM'
    ? { vendor: 'CUSTOM', id: -1, name: '' }
    : { vendor, id: IOT_VENDOR_ID[vendor] ?? -1, name: '' };

/* ── IOT-MULTI-APP (Gateway 10.20) ──
   The Gateway swaps add-edit-iot.html for add-edit-multi-profile.html when the
   AP profile advertises IOT-MULTI-APP: every application becomes an
   independent toggle, each beacon application gains a Tx Power select that
   DRIVES a read-only derived Measured RSSI, one Scan Interval and one
   Destination are shared across the scan applications, and BLE Data selects
   the reporting granularity. The Gateway decides against the ONE AP profile
   you navigated from; AURA edits IoT profiles standalone, so the capability
   is read across the AP profiles: if any advertises IOT-MULTI-APP, the
   multi-application model is offered. Per-application availability follows
   the Gateway's own per-app gates. */
export const IOT_MULTI_APPS = [
  { id: 'iBeaconAdvertisement', label: 'iBeacon', kind: 'beacon', flag: 'IOT-IBEACON-ADV' },
  {
    id: 'eddystoneAdvertisement',
    label: 'Eddystone-url',
    kind: 'beacon',
    flag: 'IOT-EDDYSTONE-ADV',
  },
  { id: 'iBeaconScan', label: 'iBeacon Scan', kind: 'scan', flag: 'IOT-IBEACON-SCAN' },
  { id: 'eddystoneScan', label: 'Eddystone-url Scan', kind: 'scan', flag: 'IOT-EDDYSTONE-SCAN' },
  { id: 'genericScan', label: 'Generic BLE Scan', kind: 'scan', flag: 'IOT-GENERIC-SCAN' },
] as const;

export const IOT_SCAN_APP_IDS = ['iBeaconScan', 'eddystoneScan', 'genericScan'] as const;

/** txPowerOptions — 20 steps, "3 dBm" … "-16 dBm". */
export const IOT_TX_POWER: string[] = Array.from({ length: 20 }, (_, i) => `${3 - i} dBm`);

export const IOT_BLE_DATA = [
  { id: 'LATEST_ONLY', label: 'Latest Only (Default)' },
  { id: 'ALL_RECORDS', label: 'All Records' },
] as const;

/**
 * updateTxPower(): in the multi editor Measured RSSI is DERIVED, not entered —
 * base -52 dBm (iBeacon) / -30 dBm (Eddystone), reduced by however far Tx
 * Power sits below 3 dBm.
 */
export function iotMeasuredRssi(txLabel: string | number | undefined, isIbeacon: boolean): number {
  const tx = parseInt(String(txLabel ?? ''), 10);
  const base = isIbeacon ? -52 : -30;
  return Number.isFinite(tx) && tx < 3 ? base - (3 - tx) : base;
}

/**
 * Toggle one application in the multi model, with the Gateway's uncheckAll()
 * semantics: dropping every scan application also clears the destination
 * modes. Pure — returns the patched form.
 */
export function toggleIotApp(form: IotProfile, id: string): IotProfile {
  const next = structuredClone(form);
  const apps = (next.apps ?? []).slice();
  const i = apps.indexOf(id);
  if (i >= 0) apps.splice(i, 1);
  else apps.push(id);
  next.apps = apps;
  if (!IOT_SCAN_APP_IDS.some((x) => apps.indexOf(x) >= 0)) {
    next.iBeaconRealTimeMonitoring = false;
    next.iBeaconRealBatchReporting = false;
  }
  return next;
}

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
  tx_power?: string | number;
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
    destination?: {
      udp_server?: { address?: string; port?: number };
      http_server?: { url?: string | null; interval?: number | null };
    };
    applications?: NewScanApp[];
  };
  ble_data?: string;
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
  iBeaconAdvertisement: {
    uuid: '00000000-0000-0000-0000-000000000000',
    interval: 100,
    major: 0,
    minor: 0,
    measuredRssi: -47,
  },
  iBeaconScan: {
    uuid: '00000000-0000-0000-0000-000000000000',
    destAddr: '0.0.0.0',
    destPort: 0,
    interval: 100,
    window: 100,
    minRSS: -100,
  },
  eddystoneAdvertisement: { url: '', interval: 100, measuredRssi: -5 },
  eddystoneScan: { destAddr: '0.0.0.0', destPort: 0, interval: 100, window: 100, minRSS: -100 },
  genericScan: {
    destAddr: '0.0.0.0',
    destPort: 0,
    interval: 100,
    window: 100,
    minRSS: -100,
    companyId: -1,
    vendors: [{ id: -1, name: '', vendor: 'ANY' }],
  },
  threadGateway: {
    channel: 25,
    shortPANId: '67C6',
    extPANId: '697351FF4AEC29CD',
    masterKey: 'BAABF2FBE3467CC254F81BE8E78D765A',
    networkName: '',
    commCredentials: 'THREADNETWORK',
    whiteList: [],
  },
  /* IOT-MULTI-APP defaults (initDefaultFormValues): nothing enabled,
     BLE Data = Latest Only, both destination modes off. */
  apps: [],
  bleData: 'LATEST_ONLY',
  iBeaconRealTimeMonitoring: false,
  iBeaconRealBatchReporting: false,
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
  // IOT-MULTI-APP: the API shape is already a LIST of applications, so record
  // every one of them in `apps`. `appId` (first found) still drives the
  // single-application editor.
  const found: string[] = [];
  if (src.ble_data != null) f.bleData = src.ble_data;

  for (const a of src.ble_beacon?.applications ?? []) {
    if (a.app_type === 'IBEACON' && f.iBeaconAdvertisement) {
      const b = f.iBeaconAdvertisement;
      if (a.uuid != null) b.uuid = a.uuid;
      b.major = a.major ?? 0;
      b.minor = a.minor ?? 0;
      if (a.measured_rss != null) b.measuredRssi = a.measured_rss;
      b.interval = a.advertise_interval ?? 100;
      if (a.tx_power != null) b.txPower = a.tx_power;
      found.push('iBeaconAdvertisement');
      appId ??= 'iBeaconAdvertisement';
    } else if (a.app_type === 'EDDYSTONE' && f.eddystoneAdvertisement) {
      const e = f.eddystoneAdvertisement;
      e.url = a.url ?? '';
      e.interval = a.advertise_interval ?? 100;
      if (a.measured_rss != null) e.measuredRssi = a.measured_rss;
      if (a.tx_power != null) e.txPower = a.tx_power;
      found.push('eddystoneAdvertisement');
      appId ??= 'eddystoneAdvertisement';
    }
  }

  const udp = src.ble_scan?.destination?.udp_server ?? {};
  const http = src.ble_scan?.destination?.http_server ?? {};
  for (const a of src.ble_scan?.applications ?? []) {
    const tgt =
      a.app_type === 'GENERIC'
        ? 'genericScan'
        : a.app_type === 'IBEACON'
          ? 'iBeaconScan'
          : 'eddystoneScan';
    const sub = f[tgt] as IotScanBase | undefined;
    if (sub) {
      if (a.min_rss != null) sub.minRSS = a.min_rss;
      if (a.uuid && tgt === 'iBeaconScan') (f.iBeaconScan as IBeaconScan).uuid = a.uuid;
      if (tgt === 'genericScan' && Array.isArray(a.vendors) && a.vendors.length && f.genericScan) {
        // A record may carry only the company id; resolve the two named
        // Gateway presets (935 Aeroscout / 64689 Chorus) back to their
        // option, not to Custom.
        f.genericScan.vendors = a.vendors.map((v) => {
          if (v.vendor) return { vendor: v.vendor, id: v.id ?? -1, name: v.name ?? '' };
          const named = Object.keys(IOT_VENDOR_ID).find((k) => IOT_VENDOR_ID[k] === v.id);
          if (named) return iotVendorRow(named);
          return {
            vendor: (v.id ?? -1) > 0 ? 'CUSTOM' : 'ANY',
            id: v.id ?? -1,
            name: v.name ?? '',
          };
        });
      }
      if (udp.address) {
        sub.destAddr = udp.address;
        sub.destPort = udp.port ?? 0;
      }
    }
    found.push(tgt);
    appId ??= tgt;
  }

  f.apps = found;
  // Derive the shared destination modes from the record so an existing
  // destination survives a multi-model round-trip (the destPort>0 derivation
  // the single-application editor already uses; batch from http_server.url).
  if (found.some((x) => (IOT_SCAN_APP_IDS as readonly string[]).indexOf(x) >= 0)) {
    f.iBeaconRealTimeMonitoring = !!udp.address && (udp.port ?? 0) > 0;
    if (http.url) {
      f.iBeaconRealBatchReporting = true;
      if (f.iBeaconAdvertisement) f.iBeaconAdvertisement.url = http.url;
    }
  }

  f.appId = appId ?? 'iBeaconAdvertisement';
  return f;
}

/**
 * Emit the flat template model. Clears each scan's external-server
 * destination when its forward toggle is off, and drops the new-shape
 * carrier keys so a live record round-trips as flat. In the multi-application
 * model (`multi`) the Gateway's uncheckAll() semantics apply instead: a
 * destination mode that is not enabled is reset rather than persisted.
 */
export function toIotPayload(
  form: IotProfile,
  fwdI: boolean,
  fwdE: boolean,
  multi = false
): Partial<IotProfile> {
  const out = structuredClone(form) as IotProfile & Record<string, unknown>;
  if (multi) {
    if (!form.iBeaconRealTimeMonitoring && out.iBeaconScan) {
      out.iBeaconScan.destAddr = '0.0.0.0';
      out.iBeaconScan.destPort = 0;
    }
    if (!form.iBeaconRealBatchReporting && out.iBeaconAdvertisement) {
      delete out.iBeaconAdvertisement.url;
    }
  } else {
    if (!fwdI && out.iBeaconScan) {
      out.iBeaconScan.destAddr = '0.0.0.0';
      out.iBeaconScan.destPort = 0;
    }
    if (!fwdE && out.eddystoneScan) {
      out.eddystoneScan.destAddr = '0.0.0.0';
      out.eddystoneScan.destPort = 0;
    }
  }
  delete out.ble_beacon;
  delete out.ble_scan;
  delete out.app_supported;
  delete out.ble_data;
  return out;
}

const rangeErr = (v: unknown, lo: number, hi: number, what: string): string | null =>
  intIn(v, lo, hi) ? null : `${what} must be an integer between ${lo} and ${hi}`;

export interface IotValidateCtx {
  fwdI: boolean;
  fwdE: boolean;
  vendorEditing: boolean;
  /** IOT-MULTI-APP model — several concurrent applications, shared destination. */
  multi?: boolean;
}

/** Per-mode validation. Returns a flat error map; empty ⇒ valid. */
export function validateIot(
  form: IotProfile,
  rows: NamedRecord[],
  ctx: IotValidateCtx
): Record<string, string | null> {
  const errs: Record<string, string | null> = { name: nameError(rows, form) };
  if (ctx.multi) return validateIotMulti(form, errs, ctx);
  const scanErrs = (
    root: 'iBeaconScan' | 'eddystoneScan' | 'genericScan',
    hasUuid: boolean,
    destOn: boolean
  ) => {
    const s = (form[root] ?? {}) as Partial<IBeaconScan>;
    errs[`${root}.interval`] = rangeErr(s.interval, 100, 10240, 'Scan Interval');
    errs[`${root}.window`] = !intIn(s.window, 100, 10240)
      ? 'Scan Window must be an integer between 100 and 10240'
      : isInt(s.interval) && (s.window as number) > s.interval
        ? 'Scan Window can not be bigger than Scan Interval'
        : null;
    if (hasUuid) errs[`${root}.uuid`] = RE_UUID.test(s.uuid ?? '') ? null : 'Enter a valid UUID';
    errs[`${root}.minRSS`] = intIn(s.minRSS, -100, -10)
      ? null
      : 'Min RSS must be an integer between -100 and -10';
    if (destOn) {
      errs[`${root}.destAddr`] = RE_IPV4.test(s.destAddr ?? '')
        ? null
        : 'Enter a valid IPv4 address';
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
    errs['ib.rssi'] = intIn(b?.measuredRssi, -127, 127)
      ? null
      : 'Measured RSSI must be an integer between -127 and 127';
  } else if (form.appId === 'eddystoneAdvertisement') {
    const e = form.eddystoneAdvertisement;
    errs['ed.url'] = !e?.url
      ? 'URL is required'
      : RE_URL.test(e.url)
        ? null
        : 'Enter a valid URL (http:// or https://)';
    errs['ed.interval'] = rangeErr(e?.interval, 100, 10240, 'Advertise Interval');
    errs['ed.rssi'] = intIn(e?.measuredRssi, -127, 127)
      ? null
      : 'Measured RSSI must be an integer between -127 and 127';
  } else if (form.appId === 'iBeaconScan') scanErrs('iBeaconScan', true, ctx.fwdI);
  else if (form.appId === 'eddystoneScan') scanErrs('eddystoneScan', false, ctx.fwdE);
  else if (form.appId === 'genericScan') scanErrs('genericScan', false, true);
  else if (form.appId === 'threadGateway') {
    const t = form.threadGateway;
    errs['tg.name'] =
      t?.networkName && String(t.networkName).trim() ? null : 'Service Name is required';
    errs['tg.ch'] = rangeErr(t?.channel, 11, 26, 'Channel');
    errs['tg.span'] = RE_HEX4.test(t?.shortPANId ?? '')
      ? null
      : 'Short PAN ID must be 4 hex characters';
    errs['tg.xpan'] = RE_HEX16.test(t?.extPANId ?? '')
      ? null
      : 'Extended PAN ID must be 16 hex characters';
    errs['tg.key'] = RE_HEX32.test(t?.masterKey ?? '')
      ? null
      : 'Master Key must be 32 hex characters';
    errs['tg.cred'] = t?.commCredentials ? null : 'Commissioning Credentials are required';
  }
  if (ctx.vendorEditing) errs['vendor.editing'] = 'Finish editing the vendor row';
  return errs;
}

/**
 * Multi-application validation (add-edit-multi-profile.html): at least one
 * application, beacon blocks WITHOUT Measured RSSI (derived from Tx Power),
 * one shared Scan Interval and one shared Destination across the scan
 * applications, per-scan filter fields.
 */
function validateIotMulti(
  form: IotProfile,
  errs: Record<string, string | null>,
  ctx: IotValidateCtx
): Record<string, string | null> {
  const apps = form.apps ?? [];
  const on = (id: string) => apps.indexOf(id) >= 0;
  const scanOn = IOT_SCAN_APP_IDS.some(on);
  errs['multi.apps'] = apps.length ? null : 'Enable at least one application';
  if (on('iBeaconAdvertisement')) {
    const b = form.iBeaconAdvertisement;
    errs['ib.interval'] = rangeErr(b?.interval, 100, 10240, 'Advertise Interval');
    errs['ib.uuid'] = RE_UUID.test(b?.uuid ?? '') ? null : 'Enter a valid UUID';
    errs['ib.major'] = rangeErr(b?.major, 0, 65535, 'Major');
    errs['ib.minor'] = rangeErr(b?.minor, 0, 65535, 'Minor');
  }
  if (on('eddystoneAdvertisement')) {
    const e = form.eddystoneAdvertisement;
    errs['ed.url'] = !e?.url
      ? 'URL is required'
      : RE_URL.test(e.url)
        ? null
        : 'Enter a valid URL (http:// or https://)';
    errs['ed.interval'] = rangeErr(e?.interval, 100, 10240, 'Advertise Interval');
  }
  if (scanOn) {
    errs['m.interval'] = rangeErr(form.iBeaconScan?.interval, 100, 10240, 'Scan Interval');
    if (form.iBeaconRealTimeMonitoring) {
      errs['m.destAddr'] = RE_IPV4.test(form.iBeaconScan?.destAddr ?? '')
        ? null
        : 'Enter a valid IPv4 address';
      errs['m.destPort'] = intIn(form.iBeaconScan?.destPort, 1, 65535)
        ? null
        : 'Destination Port must be an integer between 1 and 65535';
    }
    if (form.iBeaconRealBatchReporting) {
      const u = form.iBeaconAdvertisement?.url;
      errs['m.batchUrl'] = !u
        ? 'Reporting URL is required'
        : RE_URL.test(u)
          ? null
          : 'Enter a valid URL (http:// or https://)';
    }
  }
  if (on('iBeaconScan')) {
    errs['m.ibUuid'] = RE_UUID.test(form.iBeaconScan?.uuid ?? '') ? null : 'Enter a valid UUID';
    errs['m.ibRss'] = intIn(form.iBeaconScan?.minRSS, -100, -10)
      ? null
      : 'Min RSS must be an integer between -100 and -10';
  }
  if (on('eddystoneScan')) {
    errs['m.edRss'] = intIn(form.eddystoneScan?.minRSS, -100, -10)
      ? null
      : 'Min RSS must be an integer between -100 and -10';
  }
  if (on('genericScan')) {
    errs['m.gnRss'] = intIn(form.genericScan?.minRSS, -100, -10)
      ? null
      : 'Min RSS must be an integer between -100 and -10';
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
  d.vendor !== 'CUSTOM'
    ? null
    : !d.name
      ? 'Vendor name is required'
      : RE_VENDOR_NAME.test(d.name)
        ? null
        : 'Vendor name contains invalid characters';
export const vendorIdErr = (d: VendorDraft): string | null =>
  d.vendor !== 'CUSTOM'
    ? null
    : intIn(d.id, 1, 65535)
      ? null
      : 'Company ID must be an integer between 1 and 65535';
export const vendorDraftOk = (d: VendorDraft): boolean =>
  d.vendor !== 'CUSTOM' || (!vendorNameErr(d) && !vendorIdErr(d));

/* ── list-summary helpers ── */
export function iotAppsSummary(r?: IotProfile): string {
  if (!r) return '';
  if (r.appId) return IOT_APP_LABEL[r.appId] ?? r.appId;
  const src = r as unknown as NewShape;
  const out: string[] = [];
  for (const a of src.ble_beacon?.applications ?? []) {
    out.push(
      { IBEACON: 'iBeacon Advertisement', EDDYSTONE: 'Eddystone-URL Advertisement' }[
        a.app_type ?? ''
      ] ??
        a.app_type ??
        ''
    );
  }
  for (const a of src.ble_scan?.applications ?? []) {
    out.push(
      { GENERIC: 'Generic BLE Scan', IBEACON: 'iBeacon Scan', EDDYSTONE: 'Eddystone-URL Scan' }[
        a.app_type ?? ''
      ] ??
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
