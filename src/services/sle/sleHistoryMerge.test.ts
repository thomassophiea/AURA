import { describe, it, expect } from 'vitest';

import { mergeSleHistory, hasAnyGap } from './sleHistoryMerge';
import type { SLEMetric } from '../../types/sle';
import type { MetricSeries } from '../../types/monitoring';

const sle = (id: string, overrides: Partial<SLEMetric> = {}): SLEMetric => ({
  id,
  name: id,
  scope: 'wireless',
  successRate: 95,
  status: 'good',
  unit: 'percent',
  totalUserMinutes: 20,
  affectedUserMinutes: 1,
  timeSeries: [],
  classifiers: [],
  description: '',
  ...overrides,
});

const series = (
  metricName: string,
  points: Array<{ at: string; numerator?: number | null; denominator?: number | null; value?: number }>,
  overrides: Partial<MetricSeries> = {}
): MetricSeries => ({
  key: {
    monitoredSourceId: 'src-a',
    siteId: 'site-1',
    deviceExternalId: null,
    radioExternalId: null,
    wlanExternalId: null,
    metricFamily: 'sle',
    metricName,
    dimensions: {},
  },
  unit: '%',
  metricKind: 'percentage',
  points: points.map((p) => ({
    observedAt: p.at,
    value: p.value ?? 0,
    numerator: p.numerator ?? null,
    denominator: p.denominator ?? null,
    sampleCount: p.denominator ?? null,
    qualityState: 'observed',
  })),
  gaps: [],
  ...overrides,
});

describe('mergeSleHistory', () => {
  it('attaches stored history to the matching SLE', () => {
    const result = mergeSleHistory(
      [sle('coverage')],
      [
        series('coverage', [
          { at: '2026-08-05T10:00:00.000Z', numerator: 19, denominator: 20 },
          { at: '2026-08-05T11:00:00.000Z', numerator: 18, denominator: 20 },
        ]),
      ]
    );

    expect(result.sles[0].timeSeries).toHaveLength(2);
    expect(result.sles[0].timeSeries[0].successRate).toBe(95);
    expect(result.sles[0].timeSeries[1].successRate).toBe(90);
  });

  it('leaves an SLE untouched when nothing is stored for it', () => {
    const original = sle('roaming', {
      timeSeries: [
        { timestamp: 1, time: '00:00', successRate: 50, totalClients: 2, affectedClients: 1 },
      ],
    });
    const result = mergeSleHistory([original], []);
    expect(result.sles[0].timeSeries).toEqual(original.timeSeries);
  });

  it('ignores series from other metric families', () => {
    const apReport = series('coverage', [{ at: '2026-08-05T10:00:00.000Z', numerator: 1, denominator: 1 }]);
    apReport.key.metricFamily = 'ap_report';
    const result = mergeSleHistory([sle('coverage')], [apReport]);
    expect(result.sles[0].timeSeries).toEqual([]);
  });

  it('combines multiple sites by summing the parts, not by averaging percentages', () => {
    const siteA = series('coverage', [{ at: '2026-08-05T10:00:00.000Z', numerator: 1, denominator: 1 }]);
    const siteB = series('coverage', [{ at: '2026-08-05T10:00:00.000Z', numerator: 0, denominator: 99 }]);
    siteB.key.siteId = 'site-2';

    const result = mergeSleHistory([sle('coverage')], [siteA, siteB]);
    // Averaging 100% and 0% would give 50%. The truth is 1 of 100.
    expect(result.sles[0].timeSeries[0].successRate).toBe(1);
    expect(result.sles[0].timeSeries[0].totalClients).toBe(100);
  });

  it('derives the affected count from the stored parts', () => {
    const result = mergeSleHistory(
      [sle('coverage')],
      [series('coverage', [{ at: '2026-08-05T10:00:00.000Z', numerator: 17, denominator: 20 }])]
    );
    expect(result.sles[0].timeSeries[0].affectedClients).toBe(3);
  });

  it('orders points ascending in time', () => {
    const result = mergeSleHistory(
      [sle('coverage')],
      [
        series('coverage', [
          { at: '2026-08-05T12:00:00.000Z', numerator: 1, denominator: 2 },
          { at: '2026-08-05T10:00:00.000Z', numerator: 2, denominator: 2 },
        ]),
      ]
    );
    expect(result.sles[0].timeSeries.map((p) => p.successRate)).toEqual([100, 50]);
  });

  it('leaves an outage as absent points rather than inserting zeros', () => {
    const result = mergeSleHistory(
      [sle('coverage')],
      [
        series('coverage', [
          { at: '2026-08-01T00:00:00.000Z', numerator: 2, denominator: 2 },
          { at: '2026-08-05T00:00:00.000Z', numerator: 2, denominator: 2 },
        ]),
      ]
    );
    expect(result.sles[0].timeSeries).toHaveLength(2);
    expect(result.sles[0].timeSeries.some((p) => p.successRate === 0)).toBe(false);
  });

  it('exposes gap metadata per SLE', () => {
    const withGap = series('coverage', [
      { at: '2026-08-01T00:00:00.000Z', numerator: 2, denominator: 2 },
      { at: '2026-08-05T00:00:00.000Z', numerator: 2, denominator: 2 },
    ]);
    withGap.gaps = [
      { from: '2026-08-01T00:00:00.000Z', to: '2026-08-05T00:00:00.000Z', durationSeconds: 345600 },
    ];

    const result = mergeSleHistory([sle('coverage')], [withGap]);
    expect(result.gapsById.coverage).toHaveLength(1);
    expect(hasAnyGap(result.gapsById)).toBe(true);
  });

  it('falls back to raw values when no parts were stored', () => {
    const result = mergeSleHistory(
      [sle('coverage')],
      [series('coverage', [{ at: '2026-08-05T10:00:00.000Z', value: 88 }])]
    );
    expect(result.sles[0].timeSeries[0].successRate).toBe(88);
  });

  it('reports no gaps for a continuous series', () => {
    const result = mergeSleHistory(
      [sle('coverage')],
      [series('coverage', [{ at: '2026-08-05T10:00:00.000Z', numerator: 1, denominator: 1 }])]
    );
    expect(hasAnyGap(result.gapsById)).toBe(false);
  });
});
