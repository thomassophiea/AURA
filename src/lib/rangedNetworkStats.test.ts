import { describe, it, expect } from 'vitest';

import { deriveRangedNetworkStats, EMPTY_RANGED_STATS } from './rangedNetworkStats';
import type { MetricSeries, SeriesPoint } from '../types/monitoring';

const T0 = new Date('2026-08-07T12:00:00.000Z').getTime();
const at = (tick: number) => new Date(T0 + tick * 60_000).toISOString();

function pt(
  tick: number,
  { numerator = null, denominator = null, value = null }: Partial<SeriesPoint> = {}
): SeriesPoint {
  return {
    observedAt: at(tick),
    value,
    numerator,
    denominator,
    sampleCount: null,
    qualityState: 'observed',
  };
}

function series(metricName: string, points: SeriesPoint[], siteId: string | null = 'site-1'): MetricSeries {
  return {
    key: {
      monitoredSourceId: 'src-a',
      siteId,
      deviceExternalId: null,
      radioExternalId: null,
      wlanExternalId: null,
      metricFamily: metricName.startsWith('total') ? 'throughput' : 'sle',
      metricName,
      dimensions: {},
    },
    unit: null,
    metricKind: 'percentage',
    points,
    gaps: [],
  };
}

describe('deriveRangedNetworkStats — the multi-site aggregation', () => {
  it('sums sites at each tick before averaging, not the other way round', () => {
    // The live deployment's exact shape: one site with 4 APs, one with 2, both
    // reporting on the same tick. A flat average of every row returns 3, which
    // is neither site and not the fleet. The fleet is 6.
    const stats = deriveRangedNetworkStats([
      series('ap_health', [pt(0, { numerator: 4, denominator: 4 })], 'site-a'),
      series('ap_health', [pt(0, { numerator: 2, denominator: 2 })], 'site-b'),
    ]);

    expect(stats.apTotal).toBe(6);
    expect(stats.apOnline).toBe(6);
  });

  it('averages across ticks after summing across sites', () => {
    const stats = deriveRangedNetworkStats([
      series('ap_health', [pt(0, { denominator: 4 }), pt(1, { denominator: 4 })], 'site-a'),
      series('ap_health', [pt(0, { denominator: 2 }), pt(1, { denominator: 4 })], 'site-b'),
    ]);
    // Ticks total 6 and 8 → mean 7.
    expect(stats.apTotal).toBe(7);
    expect(stats.apPeak).toBe(8);
  });

  it('counts one tick per timestamp regardless of how many sites reported', () => {
    const stats = deriveRangedNetworkStats([
      series('ap_health', [pt(0, { denominator: 4 })], 'site-a'),
      series('ap_health', [pt(0, { denominator: 2 })], 'site-b'),
      series('successful_connects', [pt(0, { denominator: 10 })], 'site-a'),
    ]);
    expect(stats.tickCount).toBe(1);
  });
});

describe('deriveRangedNetworkStats — figures', () => {
  it('derives mean and peak client counts', () => {
    const stats = deriveRangedNetworkStats([
      series('successful_connects', [
        pt(0, { numerator: 30, denominator: 30 }),
        pt(1, { numerator: 38, denominator: 40 }),
        pt(2, { numerator: 35, denominator: 35 }),
      ]),
    ]);

    expect(stats.clientTotal).toBe(35); // (30+40+35)/3 = 35
    expect(stats.clientPeak).toBe(40);
    expect(stats.clientAuthenticated).toBe(34); // (30+38+35)/3 = 34.33 → 34
  });

  it('rounds counts but leaves bit rates unrounded', () => {
    const stats = deriveRangedNetworkStats([
      series('successful_connects', [pt(0, { denominator: 1 }), pt(1, { denominator: 2 })]),
      series('totalUpload', [pt(0, { value: 1000 }), pt(1, { value: 1500 })]),
    ]);
    expect(stats.clientTotal).toBe(2); // 1.5 → 2, a client count is a whole number
    expect(stats.throughputUpload).toBe(1250); // rates keep their precision
  });

  it('sums throughput across sites at each tick', () => {
    const stats = deriveRangedNetworkStats([
      series('totalDownload', [pt(0, { value: 100 })], 'site-a'),
      series('totalDownload', [pt(0, { value: 300 })], 'site-b'),
    ]);
    expect(stats.throughputDownload).toBe(400);
  });

  it('yields different figures for different windows — the whole point', () => {
    const yesterday = deriveRangedNetworkStats([
      series('successful_connects', [pt(0, { denominator: 30 }), pt(1, { denominator: 34 })]),
    ]);
    const today = deriveRangedNetworkStats([
      series('successful_connects', [pt(0, { denominator: 40 }), pt(1, { denominator: 42 })]),
    ]);
    expect(yesterday.clientTotal).not.toBe(today.clientTotal);
  });
});

describe('deriveRangedNetworkStats — absence', () => {
  it('reports unavailable for empty input rather than zeros', () => {
    const stats = deriveRangedNetworkStats([]);
    expect(stats).toEqual(EMPTY_RANGED_STATS);
    expect(stats.available).toBe(false);
    // Not zero: "no data" and "zero clients" are different claims.
    expect(stats.clientTotal).toBeNull();
  });

  it('keeps each figure independently nullable', () => {
    // A deployment collecting SLE but not throughput still gets its counts.
    const stats = deriveRangedNetworkStats([
      series('successful_connects', [pt(0, { denominator: 12 })]),
    ]);
    expect(stats.clientTotal).toBe(12);
    expect(stats.throughputUpload).toBeNull();
    expect(stats.apTotal).toBeNull();
    expect(stats.available).toBe(true);
  });

  it('ignores null points instead of counting them as zero', () => {
    const stats = deriveRangedNetworkStats([
      series('successful_connects', [
        pt(0, { denominator: 40 }),
        pt(1, {}), // a gap — no denominator
        pt(2, { denominator: 42 }),
      ]),
    ]);
    // Mean of 40 and 42, not of 40, 0 and 42.
    expect(stats.clientTotal).toBe(41);
  });

  it('ignores metrics it does not consume', () => {
    const stats = deriveRangedNetworkStats([
      series('coverage', [pt(0, { numerator: 33, denominator: 41 })]),
    ]);
    expect(stats.available).toBe(false);
  });

  it('survives an unparseable timestamp without corrupting the mean', () => {
    const stats = deriveRangedNetworkStats([
      series('successful_connects', [
        { ...pt(0, { denominator: 10 }), observedAt: 'not-a-date' },
        pt(1, { denominator: 20 }),
      ]),
    ]);
    expect(stats.clientTotal).toBe(20);
  });
});
