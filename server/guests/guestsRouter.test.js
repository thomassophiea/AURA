import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';

import { createGuestsRouter } from './guestsRouter.js';
import { CwpRequestError, CwpUnavailableError } from './cwpClient.js';

/** Minimal in-process HTTP driver so the router is exercised as Express runs it. */
async function request(app, { method = 'GET', path, body = null, headers = {} }) {
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

const guestDto = (overrides = {}) => ({
  id: 'g1',
  macAddress: 'aa:bb:cc:dd:ee:f1',
  displayName: null,
  email: null,
  phone: null,
  notes: null,
  source: 'CAPTIVE_PORTAL',
  authorizationStatus: 'ACTIVE',
  ssid: 'AURA-CWP',
  wlan: '8',
  gatewayHost: 'apcp.ezcloudx.com',
  apName: 'AP5020',
  apSerial: 'SN1',
  siteId: null,
  firstSeen: '2026-08-01T00:00:00.000Z',
  lastSeen: '2026-08-07T00:00:00.000Z',
  authorizedAt: '2026-08-07T00:00:00.000Z',
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  createdBy: null,
  lastSessionId: 's1',
  lastSessionStatus: 'AUTHORIZED',
  lastSessionAt: '2026-08-07T00:00:00.000Z',
  lastSessionFailureReason: null,
  lastKnownIp: '10.0.0.5',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  ...overrides,
});

const stationsMap = (entries = []) => new Map(entries);

function buildApp({
  cwp = {},
  gateway = {},
  live = {
    stations: stationsMap(),
    services: new Map(),
    gatewayReachable: true,
    gatewayError: null,
  },
  configured = true,
} = {}) {
  const app = express();
  const router = createGuestsRouter({
    requireAuthFn: (req, _res, next) => {
      req.gatewayAuth = { baseUrl: 'https://gw.example', authToken: 'Bearer t', degraded: false };
      next();
    },
    cwp: {
      list: vi.fn().mockResolvedValue({ guests: [], nextCursor: null, total: 0 }),
      get: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
      remove: vi.fn(),
      ...cwp,
    },
    gateway: {
      assignRole: vi.fn().mockResolvedValue({}),
      disassociate: vi.fn().mockResolvedValue({}),
      ...gateway,
    },
    loadLiveStateFn: vi.fn().mockResolvedValue(live),
    configFn: () => ({ configured, baseUrl: 'http://cwp', token: 't', timeoutMs: 1000 }),
  });
  app.use('/api', router);
  return app;
}

describe('GET /api/v1/guests', () => {
  it('reports itself unconfigured rather than failing', async () => {
    const app = buildApp({ configured: false });
    const res = await request(app, { path: '/api/v1/guests' });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('NOT_CONFIGURED');
  });

  it('merges live gateway state onto the ledger', async () => {
    const app = buildApp({
      cwp: { list: vi.fn().mockResolvedValue({ guests: [guestDto()], nextCursor: null, total: 1 }) },
      live: {
        stations: stationsMap([
          [
            'aa:bb:cc:dd:ee:f1',
            { macAddress: 'AA:BB:CC:DD:EE:F1', ipAddress: '192.168.1.9', status: 'ACTIVE', serviceId: 'svc' },
          ],
        ]),
        services: new Map([['svc', { ssid: 'AURA-CWP', name: 'AURA-CWP' }]]),
        gatewayReachable: true,
        gatewayError: null,
      },
    });
    const res = await request(app, { path: '/api/v1/guests' });
    expect(res.status).toBe(200);
    expect(res.body.guests[0].status).toBe('connected');
    expect(res.body.guests[0].ipAddress).toBe('192.168.1.9');
    expect(res.body.gateway.reachable).toBe(true);
  });

  it('still returns history when the gateway is unreachable', async () => {
    const app = buildApp({
      cwp: { list: vi.fn().mockResolvedValue({ guests: [guestDto()], nextCursor: null, total: 1 }) },
      live: {
        stations: null,
        services: new Map(),
        gatewayReachable: false,
        gatewayError: { errorClass: 'network' },
      },
    });
    const res = await request(app, { path: '/api/v1/guests' });
    expect(res.status).toBe(200);
    expect(res.body.guests).toHaveLength(1);
    expect(res.body.gateway.reachable).toBe(false);
    expect(res.body.guests[0].connectionStatus).toBe('unknown');
  });

  it('returns 503 with a distinguishable message when the portal is down', async () => {
    const app = buildApp({
      cwp: { list: vi.fn().mockRejectedValue(new CwpUnavailableError('down')) },
    });
    const res = await request(app, { path: '/api/v1/guests' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/Guest portal service unavailable/);
  });

  it('rejects an unknown status instead of ignoring the filter', async () => {
    const app = buildApp();
    const res = await request(app, { path: '/api/v1/guests?status=banana' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_status');
  });

  it('rejects a reversed time window', async () => {
    const app = buildApp();
    const res = await request(app, {
      path: '/api/v1/guests?start_time=2026-08-07T00:00:00Z&end_time=2026-08-01T00:00:00Z',
    });
    expect(res.status).toBe(400);
  });

  it('does not push a live-only status down to the portal', async () => {
    const list = vi.fn().mockResolvedValue({ guests: [guestDto()], nextCursor: null, total: 1 });
    const app = buildApp({
      cwp: { list },
      live: {
        stations: stationsMap([
          ['aa:bb:cc:dd:ee:f1', { macAddress: 'AA:BB:CC:DD:EE:F1', status: 'ACTIVE' }],
        ]),
        services: new Map(),
        gatewayReachable: true,
        gatewayError: null,
      },
    });
    const res = await request(app, { path: '/api/v1/guests?status=connected' });
    expect(list.mock.calls[0][0].status).toBeUndefined();
    expect(res.body.guests).toHaveLength(1);
  });

  it('pushes a ledger-expressible status down', async () => {
    const list = vi.fn().mockResolvedValue({ guests: [], nextCursor: null, total: 0 });
    const app = buildApp({ cwp: { list } });
    await request(app, { path: '/api/v1/guests?status=revoked' });
    expect(list.mock.calls[0][0].status).toBe('REVOKED');
  });

  it('searches by MAC regardless of separator', async () => {
    const app = buildApp({
      cwp: {
        list: vi.fn().mockResolvedValue({
          guests: [guestDto(), guestDto({ id: 'g2', macAddress: '92:b8:6a:71:ce:ae' })],
          nextCursor: null,
          total: 2,
        }),
      },
    });
    const res = await request(app, { path: '/api/v1/guests?search=92b86a' });
    expect(res.body.guests.map((g) => g.id)).toEqual(['g2']);
  });
});

describe('POST /api/v1/guests', () => {
  it('activates a station that is already associated', async () => {
    const assignRole = vi.fn().mockResolvedValue({});
    const app = buildApp({
      cwp: { create: vi.fn().mockResolvedValue({ guest: guestDto({ source: 'MANUAL' }) }) },
      gateway: { assignRole },
      live: {
        stations: stationsMap([
          [
            'aa:bb:cc:dd:ee:f1',
            { macAddress: 'AA:BB:CC:DD:EE:F1', status: 'ACTIVE', serviceId: 'svc' },
          ],
        ]),
        services: new Map([
          ['svc', { ssid: 'AURA-CWP', name: 'Enterprise User', authenticatedRoleId: 'role-1' }],
        ]),
        gatewayReachable: true,
        gatewayError: null,
      },
    });

    const res = await request(app, {
      method: 'POST',
      path: '/api/v1/guests',
      body: { mac_address: 'AA-BB-CC-DD-EE-F1' },
    });

    expect(res.status).toBe(201);
    expect(assignRole).toHaveBeenCalledWith(
      expect.objectContaining({ mac: 'AA:BB:CC:DD:EE:F1', roleId: 'role-1' })
    );
    expect(res.body.activation).toMatchObject({ attempted: true, applied: true });
  });

  it('records the authorization even when the device is not associated', async () => {
    const assignRole = vi.fn();
    const app = buildApp({
      cwp: { create: vi.fn().mockResolvedValue({ guest: guestDto({ source: 'MANUAL' }) }) },
      gateway: { assignRole },
    });
    const res = await request(app, {
      method: 'POST',
      path: '/api/v1/guests',
      body: { mac_address: 'aa:bb:cc:dd:ee:f1' },
    });
    expect(res.status).toBe(201);
    expect(assignRole).not.toHaveBeenCalled();
    expect(res.body.activation.reason).toBe('not_associated');
  });

  it('surfaces a gateway failure without pretending the grant failed', async () => {
    const app = buildApp({
      cwp: { create: vi.fn().mockResolvedValue({ guest: guestDto({ source: 'MANUAL' }) }) },
      gateway: { assignRole: vi.fn().mockRejectedValue(new Error('boom')) },
      live: {
        stations: stationsMap([
          ['aa:bb:cc:dd:ee:f1', { macAddress: 'AA:BB:CC:DD:EE:F1', status: 'ACTIVE', serviceId: 'svc' }],
        ]),
        services: new Map([['svc', { authenticatedRoleId: 'role-1', name: 'Enterprise User' }]]),
        gatewayReachable: true,
        gatewayError: null,
      },
    });
    const res = await request(app, {
      method: 'POST',
      path: '/api/v1/guests',
      body: { mac_address: 'aa:bb:cc:dd:ee:f1' },
    });
    expect(res.status).toBe(201);
    expect(res.body.activation).toMatchObject({ attempted: true, applied: false, reason: 'gateway_error' });
  });

  it('passes a duplicate through with the existing guest attached', async () => {
    const app = buildApp({
      cwp: {
        create: vi.fn().mockRejectedValue(
          new CwpRequestError('This MAC address is already authorized.', {
            status: 409,
            code: 'DUPLICATE_ACTIVE',
            body: { guest: guestDto() },
          })
        ),
      },
    });
    const res = await request(app, {
      method: 'POST',
      path: '/api/v1/guests',
      body: { mac_address: 'aa:bb:cc:dd:ee:f1' },
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_ACTIVE');
    expect(res.body.guest.id).toBe('g1');
  });

  it('passes a validation error through verbatim', async () => {
    const app = buildApp({
      cwp: {
        create: vi.fn().mockRejectedValue(
          new CwpRequestError('That is not a MAC address.', { status: 400 })
        ),
      },
    });
    const res = await request(app, {
      method: 'POST',
      path: '/api/v1/guests',
      body: { mac_address: 'nope' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a MAC address/);
  });
});

describe('POST /api/v1/guests/:id/revoke', () => {
  let assignRole;
  let disassociate;

  beforeEach(() => {
    assignRole = vi.fn().mockResolvedValue({});
    disassociate = vi.fn().mockResolvedValue({});
  });

  it('reverts the role and deauthenticates a connected guest', async () => {
    const app = buildApp({
      cwp: { revoke: vi.fn().mockResolvedValue({ guest: guestDto({ authorizationStatus: 'REVOKED' }) }) },
      gateway: { assignRole, disassociate },
      live: {
        stations: stationsMap([
          ['aa:bb:cc:dd:ee:f1', { macAddress: 'AA:BB:CC:DD:EE:F1', status: 'ACTIVE', serviceId: 'svc' }],
        ]),
        services: new Map([['svc', { unauthenticatedRoleId: 'preauth-1' }]]),
        gatewayReachable: true,
        gatewayError: null,
      },
    });

    const res = await request(app, { method: 'POST', path: '/api/v1/guests/g1/revoke' });
    expect(res.status).toBe(200);
    expect(assignRole).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'preauth-1' }));
    expect(disassociate).toHaveBeenCalledWith(
      expect.objectContaining({ macs: ['AA:BB:CC:DD:EE:F1'] })
    );
    expect(res.body.enforcement).toMatchObject({ applied: true, disassociated: true });
  });

  it('revokes without touching the gateway when the guest is offline', async () => {
    const app = buildApp({
      cwp: { revoke: vi.fn().mockResolvedValue({ guest: guestDto({ authorizationStatus: 'REVOKED' }) }) },
      gateway: { assignRole, disassociate },
    });
    const res = await request(app, { method: 'POST', path: '/api/v1/guests/g1/revoke' });
    expect(disassociate).not.toHaveBeenCalled();
    expect(res.body.enforcement.reason).toBe('not_connected');
  });

  it('still revokes when the gateway is unreachable', async () => {
    const app = buildApp({
      cwp: { revoke: vi.fn().mockResolvedValue({ guest: guestDto({ authorizationStatus: 'REVOKED' }) }) },
      gateway: { assignRole, disassociate },
      live: { stations: null, services: new Map(), gatewayReachable: false, gatewayError: {} },
    });
    const res = await request(app, { method: 'POST', path: '/api/v1/guests/g1/revoke' });
    expect(res.status).toBe(200);
    expect(res.body.guest.authorizationStatus).toBe('REVOKED');
    expect(res.body.enforcement.reason).toBe('gateway_unreachable');
  });

  it('404s an unknown guest', async () => {
    const app = buildApp({
      cwp: { revoke: vi.fn().mockRejectedValue(new CwpRequestError('nope', { status: 404 })) },
    });
    const res = await request(app, { method: 'POST', path: '/api/v1/guests/zzz/revoke' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/guests/:id', () => {
  it('reports a real deletion', async () => {
    const app = buildApp({
      cwp: { remove: vi.fn().mockResolvedValue({ outcome: 'DELETED', guest: null }) },
    });
    const res = await request(app, { method: 'DELETE', path: '/api/v1/guests/g1' });
    expect(res.body).toEqual({ outcome: 'DELETED', guest: null, enforcement: null });
  });

  it('reports a revocation when history had to be preserved', async () => {
    const app = buildApp({
      cwp: {
        remove: vi
          .fn()
          .mockResolvedValue({ outcome: 'REVOKED', guest: guestDto({ authorizationStatus: 'REVOKED' }) }),
      },
    });
    const res = await request(app, { method: 'DELETE', path: '/api/v1/guests/g1' });
    expect(res.body.outcome).toBe('REVOKED');
    expect(res.body.guest.authorizationStatus).toBe('REVOKED');
  });
});

describe('GET /api/v1/guests/summary', () => {
  it('reports connectedNow as null when the gateway is unreachable', async () => {
    const app = buildApp({
      cwp: { list: vi.fn().mockResolvedValue({ guests: [guestDto()], nextCursor: null, total: 1 }) },
      live: { stations: null, services: new Map(), gatewayReachable: false, gatewayError: {} },
    });
    const res = await request(app, { path: '/api/v1/guests/summary' });
    expect(res.body.summary.connectedNow).toBeNull();
    expect(res.body.summary.authorized).toBe(1);
  });

  it('is matched before the :id route', async () => {
    const get = vi.fn();
    const app = buildApp({ cwp: { get } });
    const res = await request(app, { path: '/api/v1/guests/summary' });
    expect(get).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
