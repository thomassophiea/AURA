import { describe, it, expect } from 'vitest';

import {
  AP_REPORT_FAMILY,
  buildInsightsFromHistory,
  hasHistoricalInsights,
  splitMetricName,
  statNameForSlug,
} from './apInsightsHistory';
import type { MetricSeries, SeriesPoint } from '../types/monitoring';

const START = new Date('2026-08-05T00:00:00.000Z');
const END = new Date('2026-08-05T23:59:59.999Z');

function point(offsetMinutes: number, value: number | null): SeriesPoint {
  return {
    observedAt: new Date(START.getTime() + offsetMinutes * 60_000).toISOString(),
    value,
    numerator: null,
    denominator: null,
    sampleCount: null,
    qualityState: 'observed',
  };
}

function series(
  metricName: string,
  points: SeriesPoint[],
  overrides: Partial<MetricSeries['key']> = {},
  extra: Partial<MetricSeries> = {}
): MetricSeries {
  return {
    key: {
      monitoredSourceId: 'src-a',
      siteId: 'site-1',
      deviceExternalId: 'AP-SERIAL-1',
      radioExternalId: null,
      wlanExternalId: null,
      metricFamily: AP_REPORT_FAMILY,
      metricName,
      dimensions: {},
      ...overrides,
    },
    unit: 'bps',
    metricKind: 'gauge',
    points,
    gaps: [],
    ...extra,
  };
}

const build = (input: MetricSeries[]) =>
  buildInsightsFromHistory(input, { serialNumber: 'AP-SERIAL-1', start: START, end: END });

describe('splitMetricName', () => {
  it('splits a stored name into report key and slug', () => {
    expect(splitMetricName('throughputReport.download')).toEqual({
      reportKey: 'throughputReport',
      slug: 'download',
    });
  });

  it('keeps everything after the first dot, so a dotted slug survives', () => {
    expect(splitMetricName('noisePerRadio.r1.avg')).toEqual({
      reportKey: 'noisePerRadio',
      slug: 'r1.avg',
    });
  });

  it('rejects names with no usable split', () => {
    expect(splitMetricName('throughputReport')).toBeNull();
    expect(splitMetricName('.download')).toBeNull();
    expect(splitMetricName('throughputReport.')).toBeNull();
  });
});

describe('statNameForSlug', () => {
  it('restores the chart-facing names the charts key on', () => {
    // These are the dataKey values in APInsights.tsx; if this mapping breaks,
    // the series render as empty charts rather than as an error.
    expect(statNameForSlug('power_consumption')).toBe('Power Consumption');
    expect(statNameForSlug('tntuniqueusers')).toBe('tntUniqueUsers');
    expect(statNameForSlug('rss_upper')).toBe('Rss Upper');
    expect(statNameForSlug('cochannel')).toBe('CoChannel');
    expect(statNameForSlug('total')).toBe('Total');
    expect(statNameForSlug('r3')).toBe('R3');
  });

  it('falls back to the slug rather than dropping an unmapped series', () => {
    expect(statNameForSlug('some_future_stat')).toBe('some_future_stat');
  });
});

describe('buildInsightsFromHistory', () => {
  it('rebuilds a widget block keyed the way the charts expect', () => {
    const response = build([
      series('throughputReport.download', [point(0, 100), point(15, 200)]),
      series('throughputReport.upload', [point(0, 10), point(15, 20)]),
      series('throughputReport.total', [point(0, 110), point(15, 220)]),
    ]);

    expect(response.throughputReport).toHaveLength(1);
    const names = response.throughputReport![0].statistics.map((stat) => stat.statName);
    expect(names).toEqual(['Download', 'Total', 'Upload']);
  });

  it('emits values as strings, matching what the controller sends', () => {
    // transformReportData does parseFloat(point.value); a number here would still
    // work but would diverge from the live path for no reason.
    const response = build([series('throughputReport.total', [point(0, 110)])]);
    expect(response.throughputReport![0].statistics[0].values[0]).toEqual({
      timestamp: START.getTime(),
      value: '110',
    });
  });

  it('keeps separate bands as separate report blocks', () => {
    // Merging them would draw two radios' utilisation as one series.
    const response = build([
      series('channelUtilization5.cochannel', [point(0, 20)], { dimensions: { band: '5GHz' } }),
      series('channelUtilization5.cochannel', [point(0, 30)], { dimensions: { band: '6GHz' } }),
    ]);

    expect(response.channelUtilization5).toHaveLength(2);
    expect(response.channelUtilization5!.map((report) => report.band).sort()).toEqual([
      '5GHz',
      '6GHz',
    ]);
  });

  it('groups several widgets into their own response keys', () => {
    const response = build([
      series('throughputReport.total', [point(0, 1)]),
      series('apPowerConsumptionTimeseries.power_consumption', [point(0, 12000)]),
      series('countOfUniqueUsersReport.tntuniqueusers', [point(0, 4)]),
      series('noisePerRadio.r1', [point(0, -95)]),
    ]);

    expect(Object.keys(response)).toEqual(
      expect.arrayContaining([
        'throughputReport',
        'apPowerConsumptionTimeseries',
        'countOfUniqueUsersReport',
        'noisePerRadio',
      ])
    );
    expect(response.apPowerConsumptionTimeseries![0].statistics[0].statName).toBe(
      'Power Consumption'
    );
  });

  it('drops null points rather than zero-filling them', () => {
    // A collection gap is an absence. A zero would draw an idle AP.
    const response = build([
      series('throughputReport.total', [point(0, 100), point(15, null), point(30, 300)]),
    ]);
    const values = response.throughputReport![0].statistics[0].values;
    expect(values).toHaveLength(2);
    expect(values.map((v) => v.value)).toEqual(['100', '300']);
  });

  it('omits a series that has no usable points at all', () => {
    const response = build([series('throughputReport.total', [point(0, null)])]);
    expect(response.throughputReport).toBeUndefined();
  });

  it('ignores series from other metric families instead of coercing them', () => {
    const response = build([
      series('coverage', [point(0, 95)], { metricFamily: 'sle' }),
      series('throughputReport.total', [point(0, 1)]),
    ]);
    expect(Object.keys(response)).not.toContain('coverage');
    expect(response.throughputReport).toHaveLength(1);
  });

  it('carries the window bounds and the serial through the envelope', () => {
    const response = build([series('throughputReport.total', [point(0, 1)])]);
    expect(response.deviceSerialNo).toBe('AP-SERIAL-1');
    expect(response.throughputReport![0].fromTimeInMillis).toBe(START.getTime());
    expect(response.throughputReport![0].toTimeInMillis).toBe(END.getTime());
  });

  it('preserves the unit so charts label their axes correctly', () => {
    const response = build([
      series('apPowerConsumptionTimeseries.power_consumption', [point(0, 12000)], {}, {
        unit: 'mW',
      }),
    ]);
    // Milliwatts, not watts — the conversion belongs downstream, and inventing
    // a unit here would silently rescale the power chart.
    expect(response.apPowerConsumptionTimeseries![0].statistics[0].unit).toBe('mW');
  });

  it('returns an empty envelope for empty input rather than throwing', () => {
    const response = build([]);
    expect(response.deviceSerialNo).toBe('AP-SERIAL-1');
    expect(hasHistoricalInsights(response)).toBe(false);
  });
});

describe('hasHistoricalInsights', () => {
  it('is true when any widget carries values', () => {
    expect(hasHistoricalInsights(build([series('throughputReport.total', [point(0, 1)])]))).toBe(
      true
    );
  });

  it('is false for null and for an envelope with no series', () => {
    expect(hasHistoricalInsights(null)).toBe(false);
    expect(hasHistoricalInsights(build([]))).toBe(false);
  });
});
