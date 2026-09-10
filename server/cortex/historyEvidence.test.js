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

describe('clientPseudonym', () => {
  const on = { persistClientIdentifiers: true, clientPseudonymSalt: 'a-salt' };

  it('refuses to compute one when collection is off', async () => {
    const { clientPseudonym } = await import('./historyEvidence.js');
    const r = clientPseudonym('AA:BB:CC:DD:EE:01', {
      config: { persistClientIdentifiers: false, clientPseudonymSalt: 'a-salt' },
    });
    expect(r.ok).toBe(false);
    expect(r.pseudonym).toBeNull();
    expect(r.reason).toMatch(/MONITORING_PERSIST_CLIENT_IDENTIFIERS/);
  });

  it('refuses when the flag is on but no salt is configured', async () => {
    const { clientPseudonym } = await import('./historyEvidence.js');
    const r = clientPseudonym('AA:BB:CC:DD:EE:01', {
      config: { persistClientIdentifiers: true, clientPseudonymSalt: null },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects something that is not a MAC', async () => {
    const { clientPseudonym } = await import('./historyEvidence.js');
    expect(clientPseudonym('not-a-mac', { config: on }).ok).toBe(false);
    // An IPv4 address strips to twelve hex digits and must not pass as a MAC.
    expect(clientPseudonym('192.168.100.122', { config: on }).ok).toBe(false);
  });

  it('is deterministic and format-insensitive', async () => {
    const { clientPseudonym } = await import('./historyEvidence.js');
    const a = clientPseudonym('AA:BB:CC:DD:EE:01', { config: on });
    const b = clientPseudonym('aa-bb-cc-dd-ee-01', { config: on });
    expect(a.ok).toBe(true);
    expect(a.pseudonym).toMatch(/^[0-9a-f]{32}$/);
    // Written by the collector from one format and looked up from another, so
    // a normalisation difference here would silently return "no history".
    expect(b.pseudonym).toBe(a.pseudonym);
  });

  it('matches the pseudonym the collector actually stores', async () => {
    // The write and read paths hash independently. If they ever diverge, every
    // client lookup returns an empty window and reads as "nothing was wrong".
    const { clientPseudonym } = await import('./historyEvidence.js');
    const { collectClients } = await import('../monitoring/collectors/clientCollector.js');
    const collected = await collectClients({
      session: { get: async () => ({ ok: true }) },
      source: { id: 'src-1' },
      config: { ...on, retentionDays: 7 },
      now: new Date(),
      evidenceFn: () => ({
        clients: async () => ({
          ok: true,
          rows: [{ MAC: 'AA:BB:CC:DD:EE:01', Rss: -60, SNR: 30, LastUpdate: 1_757_000_000 }],
          error: null,
        }),
      }),
    });
    const stored = collected.samples[0].clientExternalId;
    expect(clientPseudonym('AA:BB:CC:DD:EE:01', { config: on }).pseudonym).toBe(stored);
  });
});

describe('clientHistoryWindow', () => {
  it('says why rather than returning an empty window when collection is off', async () => {
    const { clientHistoryWindow } = await import('./historyEvidence.js');
    const r = await clientHistoryWindow({
      sourceIds: ['s1'],
      mac: 'AA:BB:CC:DD:EE:01',
      start: new Date(),
      end: new Date(),
      config: { persistClientIdentifiers: false, clientPseudonymSalt: null },
    });
    expect(r.ok).toBe(false);
    expect(r.meta.collected).toBe(false);
    expect(r.error).toMatch(/not being collected/);
  });

  it('queries by pseudonym and never sends a MAC to the database', async () => {
    vi.resetModules();
    const seen = [];
    vi.doMock('../monitoring/sampleRepository.js', () => ({
      queryHistory: async (args) => {
        seen.push(args);
        return {
          points: [{ metricName: 'rss', numericValue: -70 }],
          truncated: false,
          effectiveStart: null,
        };
      },
      getEarliestObservedAt: async () => new Date('2026-09-09T00:00:00Z'),
      queryLatest: async () => [],
    }));
    vi.doMock('../monitoring/sourceRepository.js', () => ({
      listSources: async () => [],
      normalizeBaseUrl: (u) => u,
    }));
    const { clientHistoryWindow } = await import('./historyEvidence.js');
    const r = await clientHistoryWindow({
      sourceIds: ['s1'],
      mac: 'AA:BB:CC:DD:EE:01',
      start: new Date(),
      end: new Date(),
      config: { persistClientIdentifiers: true, clientPseudonymSalt: 'a-salt' },
    });
    expect(r.ok).toBe(true);
    expect(r.metrics.rss).toMatchObject({ count: 1, median: -70 });
    expect(seen).toHaveLength(1);
    expect(seen[0].clientExternalId).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(seen[0])).not.toContain('AA:BB:CC:DD:EE:01');
    expect(seen[0].metricFamily).toBe('client');
    vi.doUnmock('../monitoring/sampleRepository.js');
    vi.doUnmock('../monitoring/sourceRepository.js');
  });
});
