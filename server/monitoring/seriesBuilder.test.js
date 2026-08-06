import { describe, it, expect } from 'vitest';

import { buildSeries, detectGaps, classifyFreshness, aggregatePercentage } from './seriesBuilder.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000);

const point = (overrides = {}) => ({
  monitoredSourceId: 'src-1',
  siteId: 'site-1',
  deviceExternalId: null,
  radioExternalId: null,
  wlanExternalId: null,
  metricFamily: 'sle',
  metricName: 'coverage',
  dimensions: {},
  unit: '%',
  metricKind: 'percentage',
  numericValue: 95,
  numerator: 19,
  denominator: 20,
  sampleCount: 20,
  qualityState: 'observed',
  observedAt: NOW,
  ...overrides,
});

describe('classifyFreshness', () => {
  const opts = { now: NOW, staleAfterSeconds: 900 };

  it('is fresh for a recent observation from a healthy source', () => {
    expect(
      classifyFreshness({ observedAt: minutesAgo(1), lastSuccessAt: minutesAgo(1), consecutiveFailures: 0, ...opts })
    ).toBe('fresh');
  });

  it('is stale once the observation ages past the threshold', () => {
    expect(
      classifyFreshness({ observedAt: minutesAgo(30), lastSuccessAt: minutesAgo(1), consecutiveFailures: 0, ...opts })
    ).toBe('stale');
  });

  it('is offline when the source is failing and contact is old', () => {
    expect(
      classifyFreshness({ observedAt: minutesAgo(120), lastSuccessAt: minutesAgo(120), consecutiveFailures: 5, ...opts })
    ).toBe('offline');
  });

  it('is unknown when nothing was ever observed', () => {
    expect(classifyFreshness({ observedAt: null, lastSuccessAt: null, consecutiveFailures: 0, ...opts })).toBe(
      'unknown'
    );
  });

  it('is not offline for a single recent failure that has not aged out', () => {
    expect(
      classifyFreshness({ observedAt: minutesAgo(1), lastSuccessAt: minutesAgo(1), consecutiveFailures: 1, ...opts })
    ).toBe('fresh');
  });
});

describe('detectGaps', () => {
  it('finds no gaps in an evenly spaced series', () => {
    const points = [0, 5, 10, 15].map((m) => ({ observedAt: minutesAgo(60 - m) }));
    expect(detectGaps(points)).toEqual([]);
  });

  it('finds a gap where observations are missing', () => {
    const points = [0, 5, 10, 180, 185].map((m) => ({ observedAt: minutesAgo(240 - m) }));
    const gaps = detectGaps(points);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].durationSeconds).toBe(170 * 60);
  });

  it('finds multiple gaps', () => {
    const points = [0, 5, 200, 205, 500].map((m) => ({ observedAt: minutesAgo(600 - m) }));
    expect(detectGaps(points).length).toBeGreaterThanOrEqual(2);
  });

  it('uses the declared interval when given one', () => {
    const points = [0, 5, 15].map((m) => ({ observedAt: minutesAgo(60 - m) }));
    // 10-minute jump is fine at a 15-minute cadence, a gap at a 1-minute one.
    expect(detectGaps(points, { expectedIntervalSeconds: 900 })).toEqual([]);
    expect(detectGaps(points, { expectedIntervalSeconds: 60 }).length).toBeGreaterThan(0);
  });

  it('returns nothing for fewer than two points', () => {
    expect(detectGaps([])).toEqual([]);
    expect(detectGaps([{ observedAt: NOW }])).toEqual([]);
  });
});

describe('buildSeries', () => {
  it('groups points by series identity', () => {
    const series = buildSeries([
      point({ metricName: 'coverage' }),
      point({ metricName: 'coverage', observedAt: minutesAgo(5) }),
      point({ metricName: 'roaming' }),
    ]);
    expect(series).toHaveLength(2);
    expect(series.find((s) => s.key.metricName === 'coverage').points).toHaveLength(2);
  });

  it('keeps different dimensions as separate series', () => {
    const series = buildSeries([
      point({ metricFamily: 'ap_report', dimensions: { band: '5' } }),
      point({ metricFamily: 'ap_report', dimensions: { band: '2_4' } }),
    ]);
    expect(series).toHaveLength(2);
  });

  it('orders points ascending by time', () => {
    const series = buildSeries([
      point({ observedAt: minutesAgo(5), numericValue: 2 }),
      point({ observedAt: minutesAgo(10), numericValue: 1 }),
    ]);
    expect(series[0].points.map((p) => p.value)).toEqual([1, 2]);
  });

  it('emits ISO-8601 UTC timestamps', () => {
    const series = buildSeries([point()]);
    expect(series[0].points[0].observedAt).toBe('2026-08-05T12:00:00.000Z');
  });

  it('carries numerator and denominator through for re-aggregation', () => {
    const series = buildSeries([point()]);
    expect(series[0].points[0]).toMatchObject({ numerator: 19, denominator: 20 });
  });

  it('never fills a gap with a zero-valued point', () => {
    const series = buildSeries([
      point({ observedAt: minutesAgo(200), numericValue: 90 }),
      point({ observedAt: minutesAgo(195), numericValue: 91 }),
      point({ observedAt: minutesAgo(5), numericValue: 92 }),
    ]);
    expect(series[0].points.map((p) => p.value)).toEqual([90, 91, 92]);
    expect(series[0].gaps.length).toBeGreaterThan(0);
  });

  it('returns an empty list for no points', () => {
    expect(buildSeries([])).toEqual([]);
    expect(buildSeries(null)).toEqual([]);
  });
});

describe('aggregatePercentage', () => {
  it('weights by denominator instead of averaging percentages', () => {
    // 100% of 1 client and 0% of 99 would average to 50%; the truth is 1%.
    const result = aggregatePercentage([
      { numerator: 1, denominator: 1 },
      { numerator: 0, denominator: 99 },
    ]);
    expect(result.value).toBe(1);
  });

  it('reports the totals it used', () => {
    const result = aggregatePercentage([
      { numerator: 19, denominator: 20 },
      { numerator: 8, denominator: 10 },
    ]);
    expect(result).toMatchObject({ numerator: 27, denominator: 30, pointsUsed: 2 });
  });

  it('returns null rather than a wrong number when the parts are missing', () => {
    expect(aggregatePercentage([{ numerator: null, denominator: null }])).toBeNull();
    expect(aggregatePercentage([])).toBeNull();
  });

  it('returns null when the denominator sums to zero', () => {
    expect(aggregatePercentage([{ numerator: 0, denominator: 0 }])).toBeNull();
  });

  it('ignores points that lack the parts and uses the rest', () => {
    const result = aggregatePercentage([
      { numerator: 5, denominator: 10 },
      { numerator: null, denominator: null },
    ]);
    expect(result).toMatchObject({ value: 50, pointsUsed: 1 });
  });
});
