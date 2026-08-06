import { describe, it, expect } from 'vitest';

import { normalizeSleSamples, DEFAULT_SLE_THRESHOLDS } from './sleNormalizer.js';

const BASE = {
  monitoredSourceId: '11111111-1111-1111-1111-111111111111',
  orgId: 'org-1',
  siteGroupId: 'sg-1',
  siteId: 'site-1',
  collectedAt: new Date('2026-08-05T12:00:00.000Z'),
  retentionDays: 7,
};

const station = (overrides = {}) => ({
  macAddress: `AA:BB:CC:00:00:${String(overrides.n ?? 1).padStart(2, '0')}`,
  isWired: false,
  rssi: -55,
  txRate: 100_000_000,
  rxRate: 100_000_000,
  authenticated: true,
  ipAddress: '10.0.0.1',
  apSerialNumber: 'AP-1',
  uptime: 60,
  ...overrides,
});

const ap = (overrides = {}) => ({
  serialNumber: `AP-${overrides.n ?? 1}`,
  status: 'connected',
  ...overrides,
});

const byName = (samples, name) => samples.find((s) => s.metricName === name);

describe('normalizeSleSamples', () => {
  it('emits nothing when there is nothing to measure, rather than a fabricated 100%', () => {
    const { samples } = normalizeSleSamples([], [], BASE);
    expect(samples).toEqual([]);
  });

  it('stores numerator and denominator alongside the percentage so it can be re-aggregated', () => {
    const stations = [
      station({ n: 1, rssi: -55 }),
      station({ n: 2, rssi: -55 }),
      station({ n: 3, rssi: -85 }), // weak signal
      station({ n: 4, rssi: -55 }),
    ];
    const { samples } = normalizeSleSamples(stations, [ap()], BASE);
    const coverage = byName(samples, 'coverage');

    expect(coverage).toMatchObject({
      metricFamily: 'sle',
      metricName: 'coverage',
      numerator: 3,
      denominator: 4,
      numericValue: 75,
      unit: '%',
      metricKind: 'percentage',
      sampleCount: 4,
    });
  });

  it('counts a client failing two classifiers only once', () => {
    // Weak signal AND asymmetric rates: one client, one failure.
    const stations = [
      station({ n: 1, rssi: -85, txRate: 1_000_000, rxRate: 100_000_000 }),
      station({ n: 2 }),
    ];
    const { samples } = normalizeSleSamples(stations, [ap()], BASE);
    expect(byName(samples, 'coverage')).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it('excludes wired clients from wireless SLEs', () => {
    const stations = [station({ n: 1 }), station({ n: 2, isWired: true, rssi: -95 })];
    const { samples } = normalizeSleSamples(stations, [ap()], BASE);
    expect(byName(samples, 'coverage').denominator).toBe(1);
  });

  it('computes AP health against the AP list, not the client list', () => {
    const aps = [
      ap({ n: 1, status: 'connected' }),
      ap({ n: 2, status: 'disconnected' }),
      ap({ n: 3, status: 'connected' }),
      ap({ n: 4, status: 'connected' }),
    ];
    const { samples } = normalizeSleSamples([station()], aps, BASE);
    expect(byName(samples, 'ap_health')).toMatchObject({
      numerator: 3,
      denominator: 4,
      numericValue: 75,
    });
  });

  it('treats an unauthenticated client as a failed connect', () => {
    const stations = [
      station({ n: 1, authenticated: true }),
      station({ n: 2, authenticated: false }),
    ];
    const { samples } = normalizeSleSamples(stations, [ap()], BASE);
    expect(byName(samples, 'successful_connects')).toMatchObject({
      numerator: 1,
      denominator: 2,
    });
  });

  it('counts an idle client (zero rates) as healthy for throughput rather than failing', () => {
    const stations = [station({ n: 1, txRate: 0, rxRate: 0 }), station({ n: 2 })];
    const { samples } = normalizeSleSamples(stations, [ap()], BASE);
    expect(byName(samples, 'throughput')).toMatchObject({ numerator: 2, denominator: 2 });
  });

  it('flags a client below the throughput threshold', () => {
    const stations = [
      station({ n: 1, txRate: 1000, rxRate: 1000 }), // 2 kbps, below 1 Mbps
      station({ n: 2 }),
    ];
    const { samples } = normalizeSleSamples(stations, [ap()], BASE);
    expect(byName(samples, 'throughput')).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it('honours an overridden RSSI threshold', () => {
    // -65 dBm passes the default -70 floor but fails a stricter -60.
    const stations = [station({ n: 1, rssi: -65 }), station({ n: 2, rssi: -55 })];
    const strict = normalizeSleSamples(stations, [ap()], {
      ...BASE,
      thresholds: { ...DEFAULT_SLE_THRESHOLDS, coverage: { rssiMin: -60 } },
    });
    expect(byName(strict.samples, 'coverage')).toMatchObject({ numerator: 1, denominator: 2 });

    const lax = normalizeSleSamples(stations, [ap()], BASE);
    expect(byName(lax.samples, 'coverage')).toMatchObject({ numerator: 2, denominator: 2 });
  });

  it('marks an AP over the client limit as a capacity failure', () => {
    const stations = Array.from({ length: 26 }, (_, i) =>
      station({ n: i + 1, apSerialNumber: 'AP-1' })
    );
    const { samples } = normalizeSleSamples(stations, [ap({ n: 1 }), ap({ n: 2 })], BASE);
    expect(byName(samples, 'capacity')).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it('treats a sticky client (weak signal, long uptime) as a roaming failure', () => {
    const stations = [
      station({ n: 1, rssi: -80, uptime: 600 }),
      station({ n: 2, rssi: -80, uptime: 60 }), // weak but recently connected
      station({ n: 3 }),
    ];
    const { samples } = normalizeSleSamples(stations, [ap()], BASE);
    expect(byName(samples, 'roaming')).toMatchObject({ numerator: 2, denominator: 3 });
  });

  it('stamps every sample with collection time, retention, and tenancy', () => {
    const { samples } = normalizeSleSamples([station()], [ap()], BASE);
    const expiry = BASE.collectedAt.getTime() + 7 * 24 * 60 * 60 * 1000;
    for (const sample of samples) {
      expect(sample.observedAt).toEqual(BASE.collectedAt);
      expect(sample.qualityState).toBe('collection_timestamped');
      expect(sample.expiresAt.getTime()).toBe(expiry);
      expect(sample.orgId).toBe('org-1');
      expect(sample.siteGroupId).toBe('sg-1');
      expect(sample.siteId).toBe('site-1');
      expect(sample.clientExternalId).toBeNull();
    }
  });

  it('never persists client identifiers', () => {
    const { samples } = normalizeSleSamples([station()], [ap()], BASE);
    const serialized = JSON.stringify(samples);
    expect(serialized).not.toContain('AA:BB:CC');
  });

  it('emits every wireless SLE when clients and APs are present', () => {
    const { samples } = normalizeSleSamples([station()], [ap()], BASE);
    expect(samples.map((s) => s.metricName).sort()).toEqual([
      'ap_health',
      'capacity',
      'coverage',
      'roaming',
      'successful_connects',
      'throughput',
      'time_to_connect',
    ]);
  });

  it('emits AP health but no client SLEs when a site has APs and no clients', () => {
    const { samples } = normalizeSleSamples([], [ap()], BASE);
    expect(samples.map((s) => s.metricName)).toEqual(['ap_health', 'capacity']);
  });

  it('reports a percentage in 0-100 with one decimal, matching the UI engine', () => {
    const stations = [
      station({ n: 1, rssi: -85 }),
      station({ n: 2 }),
      station({ n: 3 }),
    ];
    const { samples } = normalizeSleSamples(stations, [ap()], BASE);
    expect(byName(samples, 'coverage').numericValue).toBe(66.7);
  });
});
