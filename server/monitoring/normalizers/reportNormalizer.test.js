import { describe, it, expect } from 'vitest';

import { normalizeReportResponse, slugifyStatName } from './reportNormalizer.js';
import { METRIC_FAMILIES } from '../metricRegistry.js';
import { AP5020_INSIGHTS_3H } from '../../../src/test/fixtures/apInsights.fixture.ts';

const BASE = {
  monitoredSourceId: '11111111-1111-1111-1111-111111111111',
  metricFamily: METRIC_FAMILIES.AP_REPORT,
  orgId: 'org-1',
  siteGroupId: 'sg-1',
  siteId: 'site-1',
  deviceExternalId: 'CV012408S-C0078',
  collectedAt: new Date('2026-08-05T12:00:00.000Z'),
  retentionDays: 7,
};

describe('slugifyStatName', () => {
  it('lowercases and collapses whitespace', () => {
    expect(slugifyStatName('Power Consumption')).toBe('power_consumption');
  });

  it('trims the trailing space the controller emits on "Rss Base "', () => {
    expect(slugifyStatName('Rss Base ')).toBe('rss_base');
  });

  it('leaves already-simple names alone', () => {
    expect(slugifyStatName('Total')).toBe('total');
  });
});

describe('normalizeReportResponse', () => {
  it('returns no samples for an empty or malformed payload rather than throwing', () => {
    expect(normalizeReportResponse(null, BASE).samples).toEqual([]);
    expect(normalizeReportResponse({}, BASE).samples).toEqual([]);
    expect(normalizeReportResponse({ throughputReport: 'nope' }, BASE).samples).toEqual([]);
  });

  it('normalizes a minimal timeseries block', () => {
    const payload = {
      throughputReport: [
        {
          reportName: 'Throughput',
          reportType: 'Timeseries',
          band: 'all',
          statistics: [
            {
              statName: 'Total',
              unit: 'bps',
              values: [{ timestamp: 1785961920000, value: '42354' }],
            },
          ],
        },
      ],
    };

    const { samples } = normalizeReportResponse(payload, BASE);

    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      metricFamily: 'ap_report',
      metricName: 'throughputReport.total',
      numericValue: 42354,
      unit: 'bps',
      metricKind: 'gauge',
      qualityState: 'observed',
      deviceExternalId: 'CV012408S-C0078',
      siteId: 'site-1',
      orgId: 'org-1',
    });
    expect(samples[0].observedAt.toISOString()).toBe(new Date(1785961920000).toISOString());
    expect(samples[0].dimensions).toEqual({ band: 'all', reportType: 'Timeseries' });
  });

  it('preserves the source timestamp instead of collection time', () => {
    const payload = {
      throughputReport: [
        {
          reportName: 'Throughput',
          statistics: [{ statName: 'Total', unit: 'bps', values: [{ timestamp: 1, value: '5' }] }],
        },
      ],
    };
    const { samples } = normalizeReportResponse(payload, BASE);
    expect(samples[0].observedAt.getTime()).toBe(1);
    expect(samples[0].collectedAt).toEqual(BASE.collectedAt);
    expect(samples[0].qualityState).toBe('observed');
  });

  it('falls back to collection time and flags the quality limitation when no timestamp is supplied', () => {
    const payload = {
      throughputReport: [
        {
          reportName: 'Throughput',
          statistics: [{ statName: 'Total', unit: 'bps', values: [{ value: '5' }] }],
        },
      ],
    };
    const { samples } = normalizeReportResponse(payload, BASE);
    expect(samples[0].observedAt).toEqual(BASE.collectedAt);
    expect(samples[0].qualityState).toBe('collection_timestamped');
  });

  it('drops null-valued points so an outage stays a gap instead of becoming a zero', () => {
    const payload = {
      noisePerRadio: [
        {
          reportName: 'Noise',
          statistics: [
            {
              statName: 'Interference',
              unit: 'dBm',
              values: [
                { timestamp: 1, value: null },
                { timestamp: 2, value: 'null' },
                { timestamp: 3, value: '' },
                { timestamp: 4, value: '-92' },
              ],
            },
          ],
        },
      ],
    };
    const { samples, skipped } = normalizeReportResponse(payload, BASE);
    expect(samples).toHaveLength(1);
    expect(samples[0].numericValue).toBe(-92);
    expect(skipped.nullValues).toBe(3);
  });

  it('drops non-numeric values rather than coercing them to 0', () => {
    const payload = {
      throughputReport: [
        {
          reportName: 'Throughput',
          statistics: [
            { statName: 'Total', unit: 'bps', values: [{ timestamp: 1, value: 'N/A' }] },
          ],
        },
      ],
    };
    const { samples, skipped } = normalizeReportResponse(payload, BASE);
    expect(samples).toEqual([]);
    expect(skipped.nonNumeric).toBe(1);
  });

  it('classifies a percentage unit as a percentage, not a gauge', () => {
    const payload = {
      channelUtilization5: [
        {
          reportName: 'Channel Utilization',
          band: '5',
          statistics: [
            { statName: 'Total', unit: '%', values: [{ timestamp: 1, value: '37.5' }] },
          ],
        },
      ],
    };
    const { samples } = normalizeReportResponse(payload, BASE);
    expect(samples[0].metricKind).toBe('percentage');
    expect(samples[0].dimensions.band).toBe('5');
  });

  it('measures the retention window from the observation, not from collection time', () => {
    const observedAt = new Date('2026-08-04T00:00:00.000Z').getTime();
    const payload = {
      throughputReport: [
        {
          reportName: 'Throughput',
          statistics: [
            { statName: 'Total', unit: 'bps', values: [{ timestamp: observedAt, value: '5' }] },
          ],
        },
      ],
    };
    const { samples } = normalizeReportResponse(payload, { ...BASE, retentionDays: 7 });
    expect(samples[0].expiresAt.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('does not extend a backfilled point\'s life just because it was fetched late', () => {
    // Observed 6 days before this collection. Anchoring expiry to collection
    // time would keep it for 13 days from observation.
    const observedAt = BASE.collectedAt.getTime() - 6 * 24 * 60 * 60 * 1000;
    const payload = {
      throughputReport: [
        {
          reportName: 'Throughput',
          statistics: [
            { statName: 'Total', unit: 'bps', values: [{ timestamp: observedAt, value: '5' }] },
          ],
        },
      ],
    };
    const { samples } = normalizeReportResponse(payload, { ...BASE, retentionDays: 7 });
    const lifetimeDays =
      (samples[0].expiresAt.getTime() - observedAt) / (24 * 60 * 60 * 1000);
    expect(lifetimeDays).toBe(7);
    // Only one day of life left, not seven.
    const remainingDays =
      (samples[0].expiresAt.getTime() - BASE.collectedAt.getTime()) / (24 * 60 * 60 * 1000);
    expect(remainingDays).toBe(1);
  });

  it('gives a re-ingested point the same expiry every time, so overlap cannot extend it', () => {
    const observedAt = BASE.collectedAt.getTime() - 3 * 24 * 60 * 60 * 1000;
    const payload = {
      throughputReport: [
        {
          reportName: 'Throughput',
          statistics: [
            { statName: 'Total', unit: 'bps', values: [{ timestamp: observedAt, value: '5' }] },
          ],
        },
      ],
    };
    const first = normalizeReportResponse(payload, BASE).samples[0];
    const later = normalizeReportResponse(payload, {
      ...BASE,
      collectedAt: new Date(BASE.collectedAt.getTime() + 60 * 60 * 1000),
    }).samples[0];

    expect(later.expiresAt.getTime()).toBe(first.expiresAt.getTime());
  });

  it('separates same-named stats from different report blocks', () => {
    const payload = {
      throughputReport: [
        {
          reportName: 'Throughput',
          statistics: [{ statName: 'Total', unit: 'bps', values: [{ timestamp: 1, value: '5' }] }],
        },
      ],
      channelUtilization5: [
        {
          reportName: 'Channel Utilization',
          statistics: [{ statName: 'Total', unit: '%', values: [{ timestamp: 1, value: '5' }] }],
        },
      ],
    };
    const { samples } = normalizeReportResponse(payload, BASE);
    const names = samples.map((s) => s.metricName).sort();
    expect(names).toEqual(['channelUtilization5.total', 'throughputReport.total']);
  });

  it('ignores unknown top-level keys that are not report arrays', () => {
    const payload = {
      deviceSerialNo: 'CV012408S-C0078',
      macAddress: '18:49:F8:6C:1C:00',
      sysUptime: 12345,
      throughputReport: [
        {
          reportName: 'Throughput',
          statistics: [{ statName: 'Total', unit: 'bps', values: [{ timestamp: 1, value: '5' }] }],
        },
      ],
    };
    const { samples } = normalizeReportResponse(payload, BASE);
    expect(samples).toHaveLength(1);
  });

  describe('against the live XCC 10.18.1.0-011R capture', () => {
    const { samples, skipped } = normalizeReportResponse(AP5020_INSIGHTS_3H, BASE);

    it('produces samples from the real payload', () => {
      expect(samples.length).toBeGreaterThan(100);
    });

    it('reads power as mW, the unit the controller actually reports', () => {
      const power = samples.filter((s) => s.metricName.endsWith('.power_consumption'));
      expect(power.length).toBeGreaterThan(0);
      expect(power.every((s) => s.unit === 'mW')).toBe(true);
      // 18.67 W spike from the fixture, in the controller's native mW.
      expect(Math.max(...power.map((s) => s.numericValue))).toBeGreaterThan(10_000);
    });

    it('skips the all-null Interference / ClientData / Available series entirely', () => {
      const nulled = samples.filter((s) =>
        ['.interference', '.clientdata', '.available'].some((suffix) =>
          s.metricName.toLowerCase().endsWith(suffix)
        )
      );
      expect(nulled).toEqual([]);
      expect(skipped.nullValues).toBeGreaterThan(0);
    });

    it('gives every sample a finite numeric value and a real Date', () => {
      expect(samples.every((s) => Number.isFinite(s.numericValue))).toBe(true);
      expect(samples.every((s) => s.observedAt instanceof Date)).toBe(true);
      expect(samples.every((s) => !Number.isNaN(s.observedAt.getTime()))).toBe(true);
    });

    it('carries the device identity onto every sample', () => {
      expect(samples.every((s) => s.deviceExternalId === 'CV012408S-C0078')).toBe(true);
    });
  });
});
