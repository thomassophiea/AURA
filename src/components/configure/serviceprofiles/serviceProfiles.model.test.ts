import { describe, expect, it } from 'vitest';
import { nameError } from './profileModel';
import { parseServers } from './adspModel';
import {
  IOT_TX_POWER,
  adaptIot,
  iotAppsSummary,
  iotDestSummary,
  iotMeasuredRssi,
  iotVendorRow,
  toIotPayload,
  toggleIotApp,
  validateIot,
} from './iotModel';
import type { IotProfile } from '../../../types/configure';

/** The real GET /v3/iotprofile "test iot" record (new ble_beacon/ble_scan schema). */
const liveIot = {
  id: '55451580-6b3a-11f1-bd52-000c29ba0406',
  canDelete: false,
  canEdit: true,
  name: 'test iot',
  app_supported: 'MULTI',
  ble_beacon: {
    applications: [
      { major: 0, minor: 0, uuid: '00000000-0000-0000-0000-000000000000', measured_rss: -52, advertise_interval: 100, tx_power: 3, app_type: 'IBEACON' },
    ],
  },
  ble_scan: {
    destination: { udp_server: { address: '10.10.10.1', port: 9050 }, http_server: { url: null, interval: null } },
    applications: [{ min_rss: -100, app_type: 'GENERIC', vendors: [] }],
  },
} as unknown as IotProfile;

describe('profileModel.nameError', () => {
  const rows = [{ id: 'a', name: 'existing' }];
  it('requires a name', () => expect(nameError(rows, { name: '  ' })).toMatch(/required/i));
  it('flags duplicates across other records', () =>
    expect(nameError(rows, { id: 'b', name: 'existing' })).toMatch(/already exists/i));
  it('allows a record to keep its own name', () =>
    expect(nameError(rows, { id: 'a', name: 'existing' })).toBeNull());
  it('rejects non-printable-ASCII when checkChars', () =>
    expect(nameError(rows, { name: 'bad' }, true)).toMatch(/invalid/i));
});

describe('AdspEditor.parseServers', () => {
  it('parses host:port strings and defaults port to 443', () => {
    expect(parseServers(['a.example.com', 'b.example.com:8443'])).toEqual([
      { addr: 'a.example.com', port: 443 },
      { addr: 'b.example.com', port: 8443 },
    ]);
  });
  it('tolerates {addr,port} object entries', () =>
    expect(parseServers([{ addr: 'c', port: 22 }])).toEqual([{ addr: 'c', port: 22 }]));
  it('returns [] for non-arrays', () => expect(parseServers(undefined)).toEqual([]));
});

describe('iotModel.adaptIot (new-shape → flat)', () => {
  const flat = adaptIot(liveIot);
  it('maps the first beacon application to the active appId', () =>
    expect(flat.appId).toBe('iBeaconAdvertisement'));
  it('carries beacon fields onto the flat sub-object', () => {
    expect(flat.iBeaconAdvertisement?.measuredRssi).toBe(-52);
    expect(flat.iBeaconAdvertisement?.interval).toBe(100);
  });
  it('populates the generic-scan destination from udp_server', () => {
    expect(flat.genericScan?.destAddr).toBe('10.10.10.1');
    expect(flat.genericScan?.destPort).toBe(9050);
  });
  it('passes already-flat records through unchanged', () => {
    const alreadyFlat = { id: 'x', name: 'n', appId: 'genericScan' } as IotProfile;
    expect(adaptIot(alreadyFlat).appId).toBe('genericScan');
  });
  it('records EVERY application in apps[] (IOT-MULTI-APP)', () => {
    expect(flat.apps).toEqual(['iBeaconAdvertisement', 'genericScan']);
  });
  it('passes tx_power through onto the beacon sub-object', () => {
    expect(flat.iBeaconAdvertisement?.txPower).toBe(3);
  });
  it('derives Real-Time Monitoring from the live UDP destination', () => {
    expect(flat.iBeaconRealTimeMonitoring).toBe(true);
    expect(flat.iBeaconRealBatchReporting).toBe(false);
  });
  it('resolves named vendor presets by company id (935 Aeroscout / 64689 Chorus)', () => {
    const rec = {
      id: 'v', name: 'v',
      ble_scan: { applications: [{ app_type: 'GENERIC', min_rss: -90, vendors: [{ id: 935 }, { id: 64689 }, { id: 1234 }, { id: -1 }] }] },
    } as unknown as IotProfile;
    const f = adaptIot(rec);
    expect(f.genericScan?.vendors.map((v) => v.vendor)).toEqual(['AEROSCOUT', 'CHORUS', 'CUSTOM', 'ANY']);
    expect(f.genericScan?.vendors[0].id).toBe(935);
  });
  it('reads ble_data into bleData', () => {
    const rec = { id: 'b', name: 'b', ble_data: 'ALL_RECORDS', ble_beacon: { applications: [] } } as unknown as IotProfile;
    expect(adaptIot(rec).bleData).toBe('ALL_RECORDS');
  });
});

describe('iotModel IOT-MULTI-APP helpers', () => {
  it('builds the 20-step Tx Power ladder 3 dBm … -16 dBm', () => {
    expect(IOT_TX_POWER).toHaveLength(20);
    expect(IOT_TX_POWER[0]).toBe('3 dBm');
    expect(IOT_TX_POWER[19]).toBe('-16 dBm');
  });
  it('derives Measured RSSI from Tx Power (base -52 iBeacon / -30 Eddystone)', () => {
    expect(iotMeasuredRssi('3 dBm', true)).toBe(-52);
    expect(iotMeasuredRssi('3 dBm', false)).toBe(-30);
    expect(iotMeasuredRssi('-16 dBm', true)).toBe(-52 - 19);
    expect(iotMeasuredRssi('0 dBm', false)).toBe(-33);
  });
  it('iotVendorRow carries the fixed preset company ids', () => {
    expect(iotVendorRow('AEROSCOUT')).toEqual({ vendor: 'AEROSCOUT', id: 935, name: '' });
    expect(iotVendorRow('CHORUS')).toEqual({ vendor: 'CHORUS', id: 64689, name: '' });
    expect(iotVendorRow('ANY')).toEqual({ vendor: 'ANY', id: -1, name: '' });
    expect(iotVendorRow('CUSTOM')).toEqual({ vendor: 'CUSTOM', id: -1, name: '' });
  });
  it('toggleIotApp clears the destination modes when the last scan app is dropped (uncheckAll)', () => {
    const form = {
      id: 'x', name: 'x', apps: ['iBeaconAdvertisement', 'genericScan'],
      iBeaconRealTimeMonitoring: true, iBeaconRealBatchReporting: true,
    } as IotProfile;
    const next = toggleIotApp(form, 'genericScan');
    expect(next.apps).toEqual(['iBeaconAdvertisement']);
    expect(next.iBeaconRealTimeMonitoring).toBe(false);
    expect(next.iBeaconRealBatchReporting).toBe(false);
    // and toggling a scan app back on does not silently re-enable them
    const again = toggleIotApp(next, 'iBeaconScan');
    expect(again.apps).toContain('iBeaconScan');
    expect(again.iBeaconRealTimeMonitoring).toBe(false);
  });
  it('validateIot(multi) requires at least one application and validates the shared destination', () => {
    const ctx = { fwdI: false, fwdE: false, vendorEditing: false, multi: true };
    const empty = { id: 'x', name: 'ok', apps: [] } as IotProfile;
    expect(validateIot(empty, [], ctx)['multi.apps']).toMatch(/at least one/i);
    const bad = {
      id: 'x', name: 'ok', apps: ['iBeaconScan'],
      iBeaconRealTimeMonitoring: true,
      iBeaconScan: { uuid: '00000000-0000-0000-0000-000000000000', destAddr: 'nope', destPort: 0, interval: 100, window: 100, minRSS: -100 },
    } as IotProfile;
    const errs = validateIot(bad, [], ctx);
    expect(errs['m.destAddr']).toMatch(/IPv4/i);
    expect(errs['m.destPort']).toMatch(/between 1 and 65535/i);
  });
  it('toIotPayload(multi) resets disabled destination modes (uncheckAll on save)', () => {
    const form = {
      id: 'x', name: 'x', apps: ['iBeaconScan'],
      iBeaconRealTimeMonitoring: false, iBeaconRealBatchReporting: false,
      iBeaconScan: { uuid: '0', destAddr: '10.0.0.1', destPort: 9999, interval: 100, window: 100, minRSS: -100 },
      iBeaconAdvertisement: { uuid: '0', interval: 100, major: 0, minor: 0, measuredRssi: -47, url: 'https://x' },
    } as IotProfile;
    const out = toIotPayload(form, true, true, true);
    expect(out.iBeaconScan?.destAddr).toBe('0.0.0.0');
    expect(out.iBeaconScan?.destPort).toBe(0);
    expect(out.iBeaconAdvertisement?.url).toBeUndefined();
  });
});

describe('iotModel summaries + save payload', () => {
  it('summarises live applications and destination', () => {
    expect(iotAppsSummary(liveIot)).toContain('iBeacon Advertisement');
    expect(iotAppsSummary(liveIot)).toContain('Generic BLE Scan');
    expect(iotDestSummary(liveIot)).toBe('10.10.10.1:9050');
  });
  it('drops new-shape carrier keys on save', () => {
    const payload = toIotPayload(adaptIot(liveIot), false, false) as Record<string, unknown>;
    expect(payload.ble_beacon).toBeUndefined();
    expect(payload.ble_scan).toBeUndefined();
    expect(payload.app_supported).toBeUndefined();
    expect(payload.appId).toBe('iBeaconAdvertisement');
  });
});

describe('iotModel.validateIot', () => {
  const ctx = { fwdI: false, fwdE: false, vendorEditing: false };
  it('accepts the default iBeacon advertisement profile', () => {
    const form = {
      id: 'x', name: 'ok', appId: 'iBeaconAdvertisement',
      iBeaconAdvertisement: { uuid: '00000000-0000-0000-0000-000000000000', interval: 100, major: 0, minor: 0, measuredRssi: -47 },
    } as IotProfile;
    expect(Object.values(validateIot(form, [], ctx)).every((e) => !e)).toBe(true);
  });
  it('rejects a scan window larger than the interval', () => {
    const form = {
      id: 'x', name: 'ok', appId: 'iBeaconScan',
      iBeaconScan: { uuid: '00000000-0000-0000-0000-000000000000', destAddr: '0.0.0.0', destPort: 0, interval: 100, window: 200, minRSS: -100 },
    } as IotProfile;
    expect(validateIot(form, [], ctx)['iBeaconScan.window']).toMatch(/bigger than/i);
  });
  it('blocks save while a vendor row is mid-edit', () =>
    expect(
      validateIot({ id: 'x', name: 'ok', appId: 'genericScan', genericScan: { destAddr: '1.1.1.1', destPort: 1, interval: 100, window: 100, minRSS: -50, companyId: -1, vendors: [] } } as IotProfile, [], {
        ...ctx,
        vendorEditing: true,
      })['vendor.editing']
    ).toBeTruthy());
});
