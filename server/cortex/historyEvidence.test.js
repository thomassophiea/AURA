import { describe, it, expect, vi } from 'vitest';
import { summarise, CLIENT_HISTORY_UNAVAILABLE } from './historyEvidence.js';

/**
 * The Gateway's report API serves one duration — 3H — so "it was fine
 * yesterday" is unanswerable from live telemetry. AURA's collector has 30 days
 * of it (measured: 70,366 samples/day). These guard the two things most likely
 * to go wrong quietly: field names, and empty-vs-absent.
 */
describe('summarise', () => {
  it('summarises a real metric series', () => {
    expect(summarise([5, 9, 7])).toEqual({ count: 3, min: 5, median: 7, p90: 8.6, max: 9 });
  });

  it('returns null for an empty series rather than zeros', () => {
    // Zeros would read as a real measurement of nothing.
    expect(summarise([])).toBeNull();
  });

  it('drops nulls and NaN instead of coercing them', () => {
    expect(summarise([null, NaN, undefined])).toBeNull();
    expect(summarise([3, null, 5])).toMatchObject({ count: 2, min: 3, max: 5 });
  });

  it('does not treat a string as a number', () => {
    expect(summarise(['7'])).toBeNull();
  });
});

describe('per-client history', () => {
  it('states plainly that it is not collected, and why', () => {
    // Silence would let a caller infer history was checked and found nothing.
    expect(CLIENT_HISTORY_UNAVAILABLE).toMatch(/MONITORING_PERSIST_CLIENT_IDENTIFIERS/);
    expect(CLIENT_HISTORY_UNAVAILABLE).toMatch(/pseudonymised/);
    expect(CLIENT_HISTORY_UNAVAILABLE).toMatch(/not raw MACs/);
  });
});

describe('mapSampleRow field contract', () => {
  it('reads numericValue and metricName, not value/metric_name', async () => {
    // Guessing `value` produced NaN for every point, so a fully populated
    // window reported "no data". This pins the names the repository emits.
    vi.resetModules();
    vi.doMock('../monitoring/sampleRepository.js', () => ({
      queryHistory: async () => ({
        points: [
          { metricName: 'channelUtilization5.cochannel', numericValue: 5 },
          { metricName: 'channelUtilization5.cochannel', numericValue: 9 },
          // A row shaped the way the code used to guess must contribute nothing.
          { metric_name: 'ignored', value: 999 },
        ],
        truncated: false,
        effectiveStart: null,
      }),
      getEarliestObservedAt: async () => new Date('2026-08-29T00:00:00Z'),
      queryLatest: async () => [],
    }));
    vi.doMock('../monitoring/sourceRepository.js', () => ({
      listSources: async () => [],
      normalizeBaseUrl: (u) => u,
    }));
    const { historyWindow } = await import('./historyEvidence.js');
    const r = await historyWindow({
      sourceIds: ['s1'],
      start: new Date('2026-09-10T09:00:00Z'),
      end: new Date('2026-09-10T12:00:00Z'),
    });
    expect(r.ok).toBe(true);
    expect(r.metrics['channelUtilization5.cochannel']).toMatchObject({ count: 2, min: 5, max: 9 });
    expect(r.metrics.ignored).toBeUndefined();
    expect(r.meta.neverCollected).toBe(false);
    expect(r.meta.earliestAvailable).toBe('2026-08-29T00:00:00.000Z');
    vi.doUnmock('../monitoring/sampleRepository.js');
    vi.doUnmock('../monitoring/sourceRepository.js');
  });

  it('reports neverCollected when nothing has ever been stored', async () => {
    // "No data in this window" and "nothing was ever collected" are different
    // answers and the UI renders them differently.
    vi.resetModules();
    vi.doMock('../monitoring/sampleRepository.js', () => ({
      queryHistory: async () => ({ points: [], truncated: false, effectiveStart: null }),
      getEarliestObservedAt: async () => null,
      queryLatest: async () => [],
    }));
    vi.doMock('../monitoring/sourceRepository.js', () => ({
      listSources: async () => [],
      normalizeBaseUrl: (u) => u,
    }));
    const { historyWindow } = await import('./historyEvidence.js');
    const r = await historyWindow({ sourceIds: ['s1'], start: new Date(), end: new Date() });
    expect(r.ok).toBe(true);
    expect(r.meta.neverCollected).toBe(true);
    expect(r.metrics).toEqual({});
    vi.doUnmock('../monitoring/sampleRepository.js');
    vi.doUnmock('../monitoring/sourceRepository.js');
  });
});

describe('findVanishedDevices', () => {
  const withLatest = (rows) => {
    vi.resetModules();
    vi.doMock('../monitoring/sampleRepository.js', () => ({
      queryHistory: async () => ({ points: [], truncated: false, effectiveStart: null }),
      getEarliestObservedAt: async () => new Date(),
      queryLatest: async () => rows,
    }));
    vi.doMock('../monitoring/sourceRepository.js', () => ({
      listSources: async () => [],
      normalizeBaseUrl: (u) => u,
    }));
  };

  it('finds a device in history that is gone from live inventory', async () => {
    // The measured case: AP5010-LAB read "critical", then vanished from
    // inventory entirely, leaving the fleet looking perfect.
    withLatest([
      { deviceExternalId: 'CV012408S-C0044', observedAt: new Date().toISOString() },
      { deviceExternalId: 'WM012243W-30032', observedAt: new Date().toISOString() },
    ]);
    const { findVanishedDevices } = await import('./historyEvidence.js');
    const r = await findVanishedDevices({
      sourceIds: ['s1'],
      liveDeviceIds: ['CV012408S-C0044'],
      days: 7,
    });
    expect(r.ok).toBe(true);
    expect(r.vanished.map((d) => d.deviceExternalId)).toEqual(['WM012243W-30032']);
  });

  it('ignores a device last seen outside the lookback', async () => {
    const old = new Date(Date.now() - 30 * 24 * 3600e3).toISOString();
    withLatest([{ deviceExternalId: 'OLD-AP', observedAt: old }]);
    const { findVanishedDevices } = await import('./historyEvidence.js');
    const r = await findVanishedDevices({ sourceIds: ['s1'], liveDeviceIds: [], days: 7 });
    expect(r.vanished).toEqual([]);
  });

  it('matches serials case-insensitively', async () => {
    withLatest([{ deviceExternalId: 'cv012408s-c0044', observedAt: new Date().toISOString() }]);
    const { findVanishedDevices } = await import('./historyEvidence.js');
    const r = await findVanishedDevices({
      sourceIds: ['s1'],
      liveDeviceIds: ['CV012408S-C0044'],
      days: 7,
    });
    expect(r.vanished).toEqual([]);
  });

  it('reports unavailability rather than an empty result with no source', async () => {
    vi.resetModules();
    const { findVanishedDevices } = await import('./historyEvidence.js');
    const r = await findVanishedDevices({ sourceIds: [], liveDeviceIds: ['x'] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no monitoring source/);
  });
});
