import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hermetic: never hit a real controller. `fetchXcc` is mocked for every test
// in this file, and `requireRole` is stubbed to a pass-through so route-level
// tests don't need a real session/bearer-token flow.
vi.mock('../validationEngine/xccClient.js', () => ({
  fetchXcc: vi.fn(),
}));
vi.mock('../identity/identityRouter.js', () => ({
  requireRole: () => (_req, _res, next) => next(),
}));

import express from 'express';
import { fetchXcc } from '../validationEngine/xccClient.js';
import { filterDevices, createDeviceSearchRouter, clearDeviceSearchCache } from './deviceSearchRouter.js';

/** Synthetic 1,000-item AP-shaped list for exercising filter/cap/sort. */
function buildItems(count) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({
      id: `SN${i}`,
      name: `AP-${String(i).padStart(4, '0')}`,
      serialNumber: `SN${i}`,
      ipAddress: `10.0.${Math.floor(i / 255)}.${i % 255}`,
      siteName: i % 2 === 0 ? 'Building-A' : 'Building-B',
    });
  }
  // One distinctive item to search for, out of alphabetical order.
  items.push({
    id: 'SN-NEEDLE',
    name: 'Zebra-Lobby',
    serialNumber: 'FINDME123',
    ipAddress: '192.168.99.99',
    siteName: 'Remote-Site',
  });
  return items;
}

const FIELDS = ['name', 'serialNumber', 'ipAddress', 'siteName'];

describe('filterDevices', () => {
  const items = buildItems(1000);

  it('returns the first `limit` items sorted by name when q is empty, total is full count', () => {
    const result = filterDevices(items, { q: '', limit: 50, fields: FIELDS });
    expect(result.items).toHaveLength(50);
    expect(result.total).toBe(1001);
    expect(result.capped).toBe(true);
    // Sorted by name ascending.
    const names = result.items.map((item) => item.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('filters case-insensitively by name', () => {
    const result = filterDevices(items, { q: 'zebra-lobby', limit: 50, fields: FIELDS });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('SN-NEEDLE');
  });

  it('filters case-insensitively across serial/ip/site fields, not just name', () => {
    const bySerial = filterDevices(items, { q: 'findme123', limit: 50, fields: FIELDS });
    expect(bySerial.total).toBe(1);
    expect(bySerial.items[0].id).toBe('SN-NEEDLE');

    const byIp = filterDevices(items, { q: '192.168.99.99', limit: 50, fields: FIELDS });
    expect(byIp.total).toBe(1);
    expect(byIp.items[0].id).toBe('SN-NEEDLE');

    const bySite = filterDevices(items, { q: 'remote-site', limit: 50, fields: FIELDS });
    expect(bySite.total).toBe(1);
    expect(bySite.items[0].id).toBe('SN-NEEDLE');
  });

  it('matches a substring shared by many items and reports the full pre-cap count', () => {
    const result = filterDevices(items, { q: 'building-a', limit: 10, fields: FIELDS });
    // Half of the 1000 synthetic APs (even indices) are in Building-A.
    expect(result.total).toBe(500);
    expect(result.items).toHaveLength(10);
    expect(result.capped).toBe(true);
  });

  it('enforces the cap: items.length === limit when matches exceed limit', () => {
    const result = filterDevices(items, { q: 'ap-', limit: 25, fields: FIELDS });
    expect(result.items).toHaveLength(25);
    expect(result.capped).toBe(true);
  });

  it('capped is false when matches are under the limit', () => {
    const result = filterDevices(items, { q: 'zebra', limit: 50, fields: FIELDS });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.capped).toBe(false);
  });

  it('returns no items and total 0 for a query that matches nothing', () => {
    const result = filterDevices(items, { q: 'no-such-device-xyz', limit: 50, fields: FIELDS });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.capped).toBe(false);
  });
});

// Real controller STATION shape uses `dhcpHostName` / `accessPointName` /
// `serviceId` — NOT `hostName` / `apName` / a plain `ssid` string. These
// synthetic stations use only the real field names, plus one legacy-shaped
// station to prove the defensive fallback still works.
function buildStations() {
  return [
    {
      macAddress: 'aa:bb:cc:00:00:01',
      dhcpHostName: 'toms-laptop',
      accessPointName: 'AP-Lobby-01',
      serviceId: 101,
      ipAddress: '10.1.1.5',
    },
    {
      macAddress: 'aa:bb:cc:00:00:02',
      dhcpHostName: 'jans-phone',
      accessPointName: 'AP-Floor2-03',
      serviceId: 202,
      ipAddress: '10.1.1.6',
    },
    // No dhcpHostName / serviceId lookup miss — name falls back to MAC, ssid
    // falls back to the raw serviceId string.
    {
      macAddress: 'aa:bb:cc:00:00:03',
      accessPointName: 'AP-Floor2-03',
      serviceId: 999,
      ipAddress: '10.1.1.7',
    },
    // Legacy/alternate field spellings — the defensive fallback must still work.
    {
      macAddress: 'aa:bb:cc:00:00:04',
      hostName: 'legacy-host',
      apName: 'AP-Legacy',
      ssid: 'Guest-Legacy',
      ipAddress: '10.1.1.8',
    },
  ];
}

const services = [
  { id: 101, serviceName: 'Corp-WiFi' },
  { id: 202, serviceName: 'Guest-WiFi' },
];

function buildApp() {
  const app = express();
  app.use('/api', createDeviceSearchRouter());
  return app;
}

async function call(app, path, headers = {}) {
  const { default: request } = await import('supertest');
  let req = request(app).get(path);
  for (const [key, value] of Object.entries(headers)) {
    req = req.set(key, value);
  }
  return req;
}

describe('client normalization + search (real controller field names)', () => {
  const ORIGINAL_CONTROLLER_URL = process.env.CAMPUS_CONTROLLER_URL;

  beforeEach(() => {
    fetchXcc.mockReset();
    clearDeviceSearchCache();
    process.env.CAMPUS_CONTROLLER_URL = 'https://controller.example.com';
  });

  afterEach(() => {
    process.env.CAMPUS_CONTROLLER_URL = ORIGINAL_CONTROLLER_URL;
  });

  it('resolves name from dhcpHostName, apName from accessPointName, and ssid via serviceId', async () => {
    fetchXcc.mockImplementation((path) => {
      if (path === '/v1/stations') return Promise.resolve(buildStations());
      if (path === '/v1/services') return Promise.resolve(services);
      throw new Error(`unexpected path ${path}`);
    });

    const res = await call(buildApp(), '/api/devices/clients/search');
    expect(res.status).toBe(200);
    const byMac = Object.fromEntries(res.body.items.map((item) => [item.macAddress, item]));

    expect(byMac['aa:bb:cc:00:00:01']).toMatchObject({
      name: 'toms-laptop',
      apName: 'AP-Lobby-01',
      ssid: 'Corp-WiFi',
    });
    expect(byMac['aa:bb:cc:00:00:02']).toMatchObject({
      name: 'jans-phone',
      apName: 'AP-Floor2-03',
      ssid: 'Guest-WiFi',
    });
    // Unresolvable serviceId falls back to the serviceId string itself.
    expect(byMac['aa:bb:cc:00:00:03']).toMatchObject({
      name: 'aa:bb:cc:00:00:03', // no dhcpHostName -> falls back to macAddress
      ssid: '999',
    });
    // Legacy field spellings still resolve via the defensive fallback.
    expect(byMac['aa:bb:cc:00:00:04']).toMatchObject({
      name: 'legacy-host',
      apName: 'AP-Legacy',
      ssid: 'Guest-Legacy',
    });
  });

  it('searches clients by name (dhcpHostName)', async () => {
    fetchXcc.mockImplementation((path) => {
      if (path === '/v1/stations') return Promise.resolve(buildStations());
      if (path === '/v1/services') return Promise.resolve(services);
      throw new Error(`unexpected path ${path}`);
    });

    const res = await call(buildApp(), '/api/devices/clients/search?q=toms-laptop');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].macAddress).toBe('aa:bb:cc:00:00:01');
  });

  it('searches clients by SSID resolved from serviceId', async () => {
    fetchXcc.mockImplementation((path) => {
      if (path === '/v1/stations') return Promise.resolve(buildStations());
      if (path === '/v1/services') return Promise.resolve(services);
      throw new Error(`unexpected path ${path}`);
    });

    const res = await call(buildApp(), '/api/devices/clients/search?q=guest-wifi');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].macAddress).toBe('aa:bb:cc:00:00:02');
  });

  it('searches clients by AP name', async () => {
    fetchXcc.mockImplementation((path) => {
      if (path === '/v1/stations') return Promise.resolve(buildStations());
      if (path === '/v1/services') return Promise.resolve(services);
      throw new Error(`unexpected path ${path}`);
    });

    const res = await call(buildApp(), '/api/devices/clients/search?q=ap-floor2-03');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });
});

describe('route-level behavior (mounted router, mocked fetchXcc)', () => {
  const ORIGINAL_CONTROLLER_URL = process.env.CAMPUS_CONTROLLER_URL;

  beforeEach(() => {
    fetchXcc.mockReset();
    clearDeviceSearchCache();
  });

  afterEach(() => {
    process.env.CAMPUS_CONTROLLER_URL = ORIGINAL_CONTROLLER_URL;
  });

  it('returns 400 when no controller URL can be resolved', async () => {
    delete process.env.CAMPUS_CONTROLLER_URL;
    const res = await call(buildApp(), '/api/devices/aps/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(fetchXcc).not.toHaveBeenCalled();
  });

  it('returns 502 without leaking internals when the controller read throws', async () => {
    process.env.CAMPUS_CONTROLLER_URL = 'https://controller.example.com';
    fetchXcc.mockRejectedValue(new Error('500 /v1/aps/query: some internal detail'));

    const res = await call(buildApp(), '/api/devices/aps/search');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('failed to reach controller');
    expect(JSON.stringify(res.body)).not.toContain('some internal detail');
  });

  it('returns 200 with { items, total, capped } on success', async () => {
    process.env.CAMPUS_CONTROLLER_URL = 'https://controller.example.com';
    fetchXcc.mockResolvedValue([
      { serialNumber: 'SN1', apName: 'AP-One', ipAddress: '10.0.0.1', siteName: 'Site-A' },
      { serialNumber: 'SN2', apName: 'AP-Two', ipAddress: '10.0.0.2', siteName: 'Site-A' },
    ]);

    const res = await call(buildApp(), '/api/devices/aps/search?limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        { id: 'SN1', name: 'AP-One', serialNumber: 'SN1', ipAddress: '10.0.0.1', siteName: 'Site-A', status: null },
        { id: 'SN2', name: 'AP-Two', serialNumber: 'SN2', ipAddress: '10.0.0.2', siteName: 'Site-A', status: null },
      ],
      total: 2,
      capped: false,
    });
  });
});
