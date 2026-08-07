import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  canonicalMac,
  fetchStations,
  fetchServices,
  assignRole,
  disassociate,
  clearStationCache,
  GatewayUnavailableError,
} from './gatewayStations.js';

const opts = { authToken: 'Bearer t', controllerUrl: 'https://gw.example' };

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'OK',
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** A 200 with a zero-length body — what the station action endpoints return. */
const emptyResponse = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: 'OK',
  json: async () => {
    throw new SyntaxError('Unexpected end of JSON input');
  },
  text: async () => '',
});

beforeEach(() => clearStationCache());

describe('canonicalMac', () => {
  it('normalises the gateway spelling', () => {
    expect(canonicalMac('AA:BB:CC:DD:EE:FF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(canonicalMac('aabbccddeeff')).toBe('aa:bb:cc:dd:ee:ff');
    expect(canonicalMac('aabb.ccdd.eeff')).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('returns null for anything else', () => {
    expect(canonicalMac('nope')).toBeNull();
    expect(canonicalMac(undefined)).toBeNull();
  });
});

describe('fetchStations', () => {
  it('asks the gateway once for every station, not once per guest', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([{ macAddress: 'AA:BB:CC:DD:EE:FF' }, { macAddress: '11:22:33:44:55:66' }])
    );
    const stations = await fetchStations({ ...opts, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toContain('/management/v1/stations');
    expect(stations.get('aa:bb:cc:dd:ee:ff')).toBeTruthy();
    expect(stations.size).toBe(2);
  });

  it('skips entries without a usable MAC instead of keying on undefined', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ macAddress: null }, { macAddress: 'zz' }]));
    expect((await fetchStations({ ...opts, fetchFn })).size).toBe(0);
  });

  it('reuses a snapshot within its TTL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([]));
    const now = 1_000_000;
    await fetchStations({ ...opts, fetchFn, now });
    await fetchStations({ ...opts, fetchFn, now: now + 1000 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refetches once the snapshot has expired', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([]));
    const now = 1_000_000;
    await fetchStations({ ...opts, fetchFn, now });
    await fetchStations({ ...opts, fetchFn, now: now + 60_000 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws a typed error when the gateway refuses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 500));
    await expect(fetchStations({ ...opts, fetchFn })).rejects.toBeInstanceOf(
      GatewayUnavailableError
    );
  });
});

describe('fetchServices', () => {
  it('maps service ids to their SSID and roles', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'svc-1',
          ssid: 'AURA-CWP',
          serviceName: 'AURA-CWP',
          authenticatedUserDefaultRoleID: 'auth-1',
          unAuthenticatedUserDefaultRoleID: 'preauth-1',
        },
      ])
    );
    const services = await fetchServices({ ...opts, fetchFn });
    expect(services.get('svc-1')).toEqual({
      ssid: 'AURA-CWP',
      name: 'AURA-CWP',
      authenticatedRoleId: 'auth-1',
      unauthenticatedRoleId: 'preauth-1',
    });
  });

  it('returns an empty map rather than throwing when unavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(null, 503));
    expect((await fetchServices({ ...opts, fetchFn })).size).toBe(0);
  });
});

describe('station actions', () => {
  it('treats an empty 200 as success', async () => {
    // The gateway answers assignrole with `[HTTP 200] [len 0]`. Parsing that as
    // JSON reported a successful role change as a failure.
    const fetchFn = vi.fn().mockResolvedValue(emptyResponse());
    await expect(
      assignRole({ mac: 'AA:BB:CC:DD:EE:FF', roleId: 'role-1', ...opts, fetchFn })
    ).resolves.toBeNull();
  });

  it('sends the payload shape the gateway expects', async () => {
    const fetchFn = vi.fn().mockResolvedValue(emptyResponse());
    await assignRole({ mac: 'AA:BB:CC:DD:EE:FF', roleId: 'role-1', ...opts, fetchFn });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://gw.example/management/v1/stations/assignrole');
    expect(JSON.parse(init.body)).toEqual({ mac: 'AA:BB:CC:DD:EE:FF', role: 'role-1' });

    fetchFn.mockClear();
    await disassociate({ macs: ['AA:BB:CC:DD:EE:FF'], ...opts, fetchFn });
    const [url2, init2] = fetchFn.mock.calls[0];
    expect(url2).toBe('https://gw.example/management/v1/stations/disassociate');
    expect(JSON.parse(init2.body)).toEqual({ macList: ['AA:BB:CC:DD:EE:FF'] });
  });

  it('still reports a real refusal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(emptyResponse(403));
    await expect(
      assignRole({ mac: 'AA:BB:CC:DD:EE:FF', roleId: 'role-1', ...opts, fetchFn })
    ).rejects.toBeInstanceOf(GatewayUnavailableError);
  });

  it('reports a transport failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      disassociate({ macs: ['AA:BB:CC:DD:EE:FF'], ...opts, fetchFn })
    ).rejects.toBeInstanceOf(GatewayUnavailableError);
  });
});
