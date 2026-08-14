import { describe, it, expect } from 'vitest';

import {
  CONNECTION,
  GUEST_STATUS,
  deriveStatus,
  mergeGuest,
  filterBySearch,
  filterByStatus,
  summarize,
} from './guestView.js';

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
  apName: 'AP5020-PVT-03',
  apSerial: 'CV012408S-C0078',
  siteId: 'site-1',
  firstSeen: '2026-08-01T10:00:00.000Z',
  lastSeen: '2026-08-07T10:00:00.000Z',
  authorizedAt: '2026-08-07T10:00:01.000Z',
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  createdBy: null,
  lastSessionId: 's1',
  lastSessionStatus: 'AUTHORIZED',
  lastSessionAt: '2026-08-07T10:00:00.000Z',
  lastSessionFailureReason: null,
  lastKnownIp: '10.0.0.5',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-07T10:00:00.000Z',
  ...overrides,
});

const station = (overrides = {}) => ({
  macAddress: 'AA:BB:CC:DD:EE:F1',
  ipAddress: '192.168.100.68',
  status: 'ACTIVE',
  role: 'Enterprise User',
  accessPointName: 'AP5020-PVT-02',
  accessPointSerialNumber: 'CV012408S-C0044',
  serviceId: 'svc-1',
  siteId: 'site-9',
  rss: -64,
  lastSeen: Date.parse('2026-08-07T11:00:00.000Z'),
  ...overrides,
});

describe('deriveStatus', () => {
  it('lets an operator decision outrank everything else', () => {
    expect(
      deriveStatus({
        authorizationStatus: 'REVOKED',
        connection: CONNECTION.CONNECTED,
        source: 'MANUAL',
        lastSeen: '2026-08-07T10:00:00.000Z',
      })
    ).toBe(GUEST_STATUS.REVOKED);
  });

  it('reports expiry ahead of live connection', () => {
    expect(
      deriveStatus({
        authorizationStatus: 'EXPIRED',
        connection: CONNECTION.CONNECTED,
        source: 'MANUAL',
      })
    ).toBe(GUEST_STATUS.EXPIRED);
  });

  it('reports a live association', () => {
    expect(
      deriveStatus({ authorizationStatus: 'ACTIVE', connection: CONNECTION.CONNECTED })
    ).toBe(GUEST_STATUS.CONNECTED);
  });

  it('only reports failed from a session the gateway actually refused', () => {
    expect(
      deriveStatus({
        authorizationStatus: 'ACTIVE',
        connection: CONNECTION.DISCONNECTED,
        lastSessionStatus: 'AUTH_FAILED',
        lastSeen: '2026-08-07T10:00:00.000Z',
      })
    ).toBe(GUEST_STATUS.FAILED);

    expect(
      deriveStatus({
        authorizationStatus: 'ACTIVE',
        connection: CONNECTION.DISCONNECTED,
        lastSessionStatus: 'STARTED',
        lastSeen: '2026-08-07T10:00:00.000Z',
      })
    ).toBe(GUEST_STATUS.DISCONNECTED);
  });

  it('distinguishes a manual entry that has never connected', () => {
    expect(
      deriveStatus({
        authorizationStatus: 'ACTIVE',
        connection: CONNECTION.DISCONNECTED,
        source: 'MANUAL',
        lastSeen: null,
      })
    ).toBe(GUEST_STATUS.MANUALLY_ADDED);
  });

  it('never claims disconnected when the gateway could not be asked', () => {
    expect(
      deriveStatus({
        authorizationStatus: 'ACTIVE',
        connection: CONNECTION.UNKNOWN,
        source: 'CAPTIVE_PORTAL',
        lastSeen: '2026-08-07T10:00:00.000Z',
      })
    ).toBe(GUEST_STATUS.AUTHORIZED);
  });
});

describe('mergeGuest', () => {
  const services = new Map([['svc-1', { ssid: 'AURA-CWP', name: 'AURA-CWP' }]]);

  it('prefers live gateway values over stored ones', () => {
    const merged = mergeGuest(
      guestDto(),
      new Map([['aa:bb:cc:dd:ee:f1', station()]]),
      services
    );
    expect(merged.connectionStatus).toBe(CONNECTION.CONNECTED);
    expect(merged.ipAddress).toBe('192.168.100.68');
    expect(merged.ipAddressIsLive).toBe(true);
    expect(merged.apName).toBe('AP5020-PVT-02');
    expect(merged.role).toBe('Enterprise User');
    expect(merged.status).toBe(GUEST_STATUS.CONNECTED);
  });

  it('falls back to the last known IP and marks it as not live', () => {
    const merged = mergeGuest(guestDto(), new Map(), services);
    expect(merged.connectionStatus).toBe(CONNECTION.DISCONNECTED);
    expect(merged.ipAddress).toBe('10.0.0.5');
    expect(merged.ipAddressIsLive).toBe(false);
    expect(merged.apName).toBe('AP5020-PVT-03');
  });

  it('reports unknown connection when the station list is unavailable', () => {
    const merged = mergeGuest(guestDto(), null, services);
    expect(merged.connectionStatus).toBe(CONNECTION.UNKNOWN);
    expect(merged.status).toBe(GUEST_STATUS.AUTHORIZED);
  });

  it('treats an INACTIVE station as not connected', () => {
    const merged = mergeGuest(
      guestDto(),
      new Map([['aa:bb:cc:dd:ee:f1', station({ status: 'INACTIVE' })]]),
      services
    );
    expect(merged.connectionStatus).toBe(CONNECTION.DISCONNECTED);
  });

  it('uses the MAC as the display name when the portal collected none', () => {
    const merged = mergeGuest(guestDto(), new Map(), services);
    expect(merged.displayName).toBe('aa:bb:cc:dd:ee:f1');
    expect(merged.hasRealName).toBe(false);
  });

  it('keeps a real display name when there is one', () => {
    const merged = mergeGuest(guestDto({ displayName: 'Kit' }), new Map(), services);
    expect(merged.displayName).toBe('Kit');
    expect(merged.hasRealName).toBe(true);
  });

  it('does not invent a connection start time the gateway did not give', () => {
    const merged = mergeGuest(
      guestDto(),
      new Map([['aa:bb:cc:dd:ee:f1', station()]]),
      services
    );
    expect(merged.connectedSince).toBeNull();
  });

  it('derives a connection start from an association duration when present', () => {
    const merged = mergeGuest(
      guestDto(),
      new Map([['aa:bb:cc:dd:ee:f1', station({ associationTime: 600 })]]),
      services
    );
    expect(merged.connectedSince).not.toBeNull();
    expect(Date.now() - Date.parse(merged.connectedSince)).toBeGreaterThanOrEqual(599_000);
  });
});

describe('filterBySearch', () => {
  const merged = [
    mergeGuest(guestDto(), new Map([['aa:bb:cc:dd:ee:f1', station()]]), new Map()),
    mergeGuest(
      guestDto({ id: 'g2', macAddress: '92:b8:6a:71:ce:ae', email: 'kit@example.com', lastKnownIp: null }),
      new Map(),
      new Map()
    ),
  ];

  it('matches a MAC however it is typed', () => {
    for (const term of ['92:b8:6a', '92b86a', '92-B8-6A', '92b8.6a']) {
      expect(filterBySearch(merged, term).map((g) => g.id)).toEqual(['g2']);
    }
  });

  it('matches an IP address', () => {
    expect(filterBySearch(merged, '192.168.100.68').map((g) => g.id)).toEqual(['g1']);
  });

  it('matches an email address', () => {
    expect(filterBySearch(merged, 'kit@').map((g) => g.id)).toEqual(['g2']);
  });

  it('returns everything for an empty term', () => {
    expect(filterBySearch(merged, '   ')).toHaveLength(2);
  });
});

describe('filterByStatus', () => {
  const merged = [
    mergeGuest(guestDto(), new Map([['aa:bb:cc:dd:ee:f1', station()]]), new Map()),
    mergeGuest(guestDto({ id: 'g2', authorizationStatus: 'REVOKED' }), new Map(), new Map()),
  ];

  it('keeps only the requested statuses', () => {
    expect(filterByStatus(merged, ['revoked']).map((g) => g.id)).toEqual(['g2']);
  });

  it('returns everything when no status is requested', () => {
    expect(filterByStatus(merged, [])).toHaveLength(2);
  });
});

describe('summarize', () => {
  const now = new Date('2026-08-07T12:00:00.000Z');

  it('counts live, authorized and recently seen guests', () => {
    const merged = [
      mergeGuest(guestDto(), new Map([['aa:bb:cc:dd:ee:f1', station()]]), new Map()),
      mergeGuest(
        guestDto({ id: 'g2', macAddress: '92:b8:6a:71:ce:ae', lastSeen: '2026-08-06T09:00:00.000Z' }),
        new Map(),
        new Map()
      ),
      mergeGuest(
        guestDto({ id: 'g3', macAddress: '92:b8:6a:71:ce:ff', authorizationStatus: 'REVOKED', lastSeen: '2026-06-01T09:00:00.000Z' }),
        new Map(),
        new Map()
      ),
    ];

    const summary = summarize(merged, { gatewayReachable: true, now });
    expect(summary.connectedNow).toBe(1);
    expect(summary.authorized).toBe(2);
    expect(summary.seenLast7Days).toBe(2);
    expect(summary.total).toBe(3);
  });

  it('reports connectedNow as null rather than zero when the gateway is down', () => {
    const merged = [mergeGuest(guestDto(), null, new Map())];
    expect(summarize(merged, { gatewayReachable: false, now }).connectedNow).toBeNull();
  });
});

describe('secure onboarding passthrough', () => {
  it('is null for a guest who never chose Secure Guest Access', () => {
    const merged = mergeGuest(guestDto(), new Map(), new Map());
    expect(merged.secureOnboarding).toBeNull();
  });

  it('carries the portal record through unchanged', () => {
    const onboarding = {
      id: 'onb_1',
      status: 'COMPLETED',
      method: 'APPLE_PROFILE',
      platform: 'IOS',
      sourceSsid: 'AURA-CWP',
      targetSsid: 'Skynet',
      startedAt: '2026-08-14T12:00:00.000Z',
      completedAt: '2026-08-14T12:01:00.000Z',
      failureReason: null,
    };
    const merged = mergeGuest(guestDto({ secureOnboarding: onboarding }), new Map(), new Map());
    expect(merged.secureOnboarding).toEqual(onboarding);
  });

  it('does not let a completed onboarding change the guest status', () => {
    // Reaching the secure WLAN and being authorized on the guest WLAN are
    // different questions; folding one into the other would make the second
    // unanswerable.
    const revoked = mergeGuest(
      guestDto({
        authorizationStatus: 'REVOKED',
        secureOnboarding: { id: 'onb_2', status: 'COMPLETED', method: 'WIFI_QR', platform: 'ANDROID', sourceSsid: 'AURA-CWP', targetSsid: 'Skynet', startedAt: '2026-08-14T12:00:00.000Z', completedAt: '2026-08-14T12:01:00.000Z', failureReason: null },
      }),
      new Map(),
      new Map()
    );
    expect(revoked.status).toBe('revoked');
    expect(revoked.secureOnboarding.status).toBe('COMPLETED');
  });
});
