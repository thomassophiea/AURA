import { describe, expect, it } from 'vitest';
import { nameError } from './profileModel';
import { parseServers } from './adspModel';
import { adaptIot, iotAppsSummary, iotDestSummary, toIotPayload, validateIot } from './iotModel';
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
