import { describe, it, expect } from 'vitest';

import {
  snapshotToSamples,
  samplesToSnapshots,
  aggregateSnapshots,
  networkTrends,
} from './throughputStore.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const OPTIONS = { sourceId: 'src-a', retentionDays: 7, now: NOW };

const snapshot = (overrides = {}) => ({
  timestamp: NOW.getTime(),
  totalUpload: 1000,
  totalDownload: 2000,
  totalTraffic: 3000,
  clientCount: 12,
  avgPerClient: 250,
  networkBreakdown: [{ network: 'Corp', upload: 600, download: 1200, total: 1800, clients: 8 }],
  ...overrides,
});

describe('snapshotToSamples', () => {
  it('flattens the totals into one sample per metric', () => {
    const samples = snapshotToSamples(snapshot(), OPTIONS);
    const names = samples.map((s) => s.metricName);
    expect(names).toEqual(
      expect.arrayContaining([
        'totalUpload',
        'totalDownload',
        'totalTraffic',
        'clientCount',
        'avgPerClient',
      ])
    );
  });

  it('records the per-network breakdown as a dimension, not a name suffix', () => {
    const samples = snapshotToSamples(snapshot(), OPTIONS);
    const network = samples.filter((s) => s.metricName.startsWith('network.'));
    expect(network.length).toBe(4);
    expect(network.every((s) => s.dimensions.network === 'Corp')).toBe(true);
  });

  it('preserves the snapshot timestamp as the observation time', () => {
    const samples = snapshotToSamples(snapshot({ timestamp: 1785961920000 }), OPTIONS);
    expect(samples[0].observedAt.getTime()).toBe(1785961920000);
    expect(samples[0].qualityState).toBe('observed');
  });

  it('falls back to collection time and flags it when no timestamp is supplied', () => {
    const samples = snapshotToSamples(snapshot({ timestamp: undefined }), OPTIONS);
    expect(samples[0].observedAt).toEqual(NOW);
    expect(samples[0].qualityState).toBe('collection_timestamped');
  });

  it('stamps the retention expiry from the observation', () => {
    const samples = snapshotToSamples(snapshot(), OPTIONS);
    expect(samples[0].expiresAt.getTime()).toBe(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it('does not extend a late-pushed snapshot past the rolling window', () => {
    const observedAt = NOW.getTime() - 6 * 24 * 60 * 60 * 1000;
    const samples = snapshotToSamples(snapshot({ timestamp: observedAt }), OPTIONS);
    expect(samples[0].expiresAt.getTime()).toBe(observedAt + 7 * 24 * 60 * 60 * 1000);
  });

  it('drops non-numeric fields rather than storing them as zero', () => {
    const samples = snapshotToSamples(snapshot({ totalUpload: 'n/a', clientCount: null }), OPTIONS);
    const names = samples.map((s) => s.metricName);
    expect(names).not.toContain('totalUpload');
    expect(names).not.toContain('clientCount');
    expect(names).toContain('totalDownload');
  });

  it('ignores a breakdown entry with no network name', () => {
    const samples = snapshotToSamples(
      snapshot({ networkBreakdown: [{ upload: 1, download: 2, total: 3, clients: 4 }] }),
      OPTIONS
    );
    expect(samples.every((s) => !s.metricName.startsWith('network.'))).toBe(true);
  });

  it('produces nothing for an empty body instead of throwing', () => {
    expect(snapshotToSamples({}, OPTIONS)).toEqual([]);
    expect(snapshotToSamples(null, OPTIONS)).toEqual([]);
  });
});

describe('samplesToSnapshots', () => {
  it('round-trips a snapshot through the sample representation', () => {
    const original = snapshot();
    const samples = snapshotToSamples(original, OPTIONS);
    const [restored] = samplesToSnapshots(
      samples.map((s) => ({ ...s, numericValue: s.numericValue }))
    );

    expect(restored).toMatchObject({
      timestamp: original.timestamp,
      totalUpload: 1000,
      totalDownload: 2000,
      totalTraffic: 3000,
      clientCount: 12,
    });
    expect(restored.networkBreakdown).toEqual([
      { network: 'Corp', upload: 600, download: 1200, total: 1800, clients: 8 },
    ]);
  });

  it('groups samples from several snapshots by timestamp, in order', () => {
    const first = snapshotToSamples(snapshot({ timestamp: 1000, totalTraffic: 10 }), OPTIONS);
    const second = snapshotToSamples(snapshot({ timestamp: 2000, totalTraffic: 20 }), OPTIONS);
    const restored = samplesToSnapshots([...second, ...first]);

    expect(restored.map((s) => s.timestamp)).toEqual([1000, 2000]);
    expect(restored.map((s) => s.totalTraffic)).toEqual([10, 20]);
  });

  it('returns nothing for no samples', () => {
    expect(samplesToSnapshots([])).toEqual([]);
  });
});

describe('aggregateSnapshots', () => {
  it('averages and peaks across the snapshots present', () => {
    const result = aggregateSnapshots([
      { totalUpload: 100, totalDownload: 200, totalTraffic: 300, clientCount: 10 },
      { totalUpload: 300, totalDownload: 400, totalTraffic: 700, clientCount: 20 },
    ]);
    expect(result).toMatchObject({
      avgUpload: 200,
      avgTotal: 500,
      maxTotal: 700,
      avgClientCount: 15,
      snapshotCount: 2,
    });
  });

  it('does not let an outage window drag the average toward zero', () => {
    // Two observed snapshots; the hours in between were never collected and
    // contribute nothing rather than contributing zeros.
    const result = aggregateSnapshots([{ totalTraffic: 1000 }, { totalTraffic: 1000 }]);
    expect(result.avgTotal).toBe(1000);
  });

  it('returns explicit zeros with a zero count for an empty set', () => {
    expect(aggregateSnapshots([])).toMatchObject({ snapshotCount: 0, avgTotal: 0 });
  });
});

describe('networkTrends', () => {
  it('extracts one network across snapshots', () => {
    const snapshots = [
      {
        timestamp: 1,
        networkBreakdown: [
          { network: 'Corp', upload: 1, download: 2, total: 3, clients: 4 },
          { network: 'Guest', upload: 5, download: 6, total: 11, clients: 2 },
        ],
      },
      { timestamp: 2, networkBreakdown: [{ network: 'Corp', upload: 7, download: 8, total: 15, clients: 5 }] },
    ];
    expect(networkTrends(snapshots, 'Corp')).toEqual([
      { timestamp: 1, upload: 1, download: 2, total: 3, clients: 4 },
      { timestamp: 2, upload: 7, download: 8, total: 15, clients: 5 },
    ]);
  });

  it('omits snapshots where the network was absent rather than emitting zeros', () => {
    const snapshots = [
      { timestamp: 1, networkBreakdown: [{ network: 'Corp', upload: 1, download: 2, total: 3, clients: 4 }] },
      { timestamp: 2, networkBreakdown: [] },
    ];
    expect(networkTrends(snapshots, 'Corp')).toHaveLength(1);
  });

  it('returns nothing for an unknown network', () => {
    expect(networkTrends([{ timestamp: 1, networkBreakdown: [] }], 'Nope')).toEqual([]);
  });
});
