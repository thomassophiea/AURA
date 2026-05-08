import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock metricsStorage to a no-op so singleton import doesn't trigger side effects.
vi.mock('./metricsStorage', () => ({
  metricsStorage: {
    addSnapshot: vi.fn(),
    getSnapshots: vi.fn(() => []),
  },
}));

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-07T15:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

import {
  aiBaselineService,
  recordNetworkMetrics,
  getAIBaselineThresholds,
} from './aiBaselineService';

beforeEach(() => {
  // Reset singleton state between tests.
  aiBaselineService.clearData();
});

describe('aiBaselineService — sample lifecycle', () => {
  it('starts with zero samples, "none" confidence', () => {
    expect(aiBaselineService.getSampleCount()).toBe(0);
    expect(aiBaselineService.getConfidenceLevel()).toBe('none');
  });

  it('addSample appends a valid sample and persists it', async () => {
    aiBaselineService.addSample({
      timestamp: Date.now(),
      rfqi: 75,
      channelUtilization: 30,
      clientCount: 12,
      apOnlineCount: 5,
    });
    expect(aiBaselineService.getSampleCount()).toBe(1);

    // Debounced save fires after 1s.
    await vi.advanceTimersByTimeAsync(1100);
    expect(localStorage.getItem('edge_ai_baseline_v1')).toBeTruthy();
  });

  it('addSample skips invalid samples (no rfqi number)', () => {
    aiBaselineService.addSample({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rfqi: 'oops' as any,
      channelUtilization: 30,
      clientCount: 12,
      apOnlineCount: 5,
      timestamp: Date.now(),
    });
    expect(aiBaselineService.getSampleCount()).toBe(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('recordSnapshot adds a sample with computed timestamp', () => {
    aiBaselineService.recordSnapshot({
      rfqi: 80,
      channelUtilization: 25,
      clientCount: 30,
      apOnlineCount: 10,
    });
    expect(aiBaselineService.getSampleCount()).toBe(1);
    const range = aiBaselineService.getTimeRange();
    expect(range.earliest).toBeTruthy();
  });

  it('exposes time range earliest/latest from samples', () => {
    aiBaselineService.addSample({
      timestamp: Date.parse('2026-05-01T00:00:00Z'),
      rfqi: 80,
      channelUtilization: 0,
      clientCount: 1,
      apOnlineCount: 1,
    });
    aiBaselineService.addSample({
      timestamp: Date.parse('2026-05-07T00:00:00Z'),
      rfqi: 70,
      channelUtilization: 0,
      clientCount: 1,
      apOnlineCount: 1,
    });
    const range = aiBaselineService.getTimeRange();
    expect(range.earliest).toBe(Date.parse('2026-05-01T00:00:00Z'));
    expect(range.latest).toBe(Date.parse('2026-05-07T00:00:00Z'));
  });

  it('getSamples filters by start/end time range', () => {
    aiBaselineService.addSample({
      timestamp: 100,
      rfqi: 80,
      channelUtilization: 0,
      clientCount: 1,
      apOnlineCount: 1,
    });
    aiBaselineService.addSample({
      timestamp: 500,
      rfqi: 70,
      channelUtilization: 0,
      clientCount: 1,
      apOnlineCount: 1,
    });
    expect(aiBaselineService.getSamples(50, 200)).toHaveLength(1);
    expect(aiBaselineService.getSamples(0, 1000)).toHaveLength(2);
  });
});

describe('aiBaselineService — confidence', () => {
  const addN = (n: number) => {
    for (let i = 0; i < n; i++) {
      aiBaselineService.addSample({
        timestamp: Date.now() + i,
        rfqi: 75,
        channelUtilization: 30,
        clientCount: 10,
        apOnlineCount: 4,
      });
    }
  };

  it('< 10 samples → low', () => {
    addN(5);
    expect(aiBaselineService.getConfidenceLevel()).toBe('low');
    expect(aiBaselineService.getConfidenceDescription()).toMatch(/Learning/);
  });

  it('10-49 samples → moderate', () => {
    addN(20);
    expect(aiBaselineService.getConfidenceLevel()).toBe('moderate');
    expect(aiBaselineService.getConfidenceDescription()).toMatch(/Building/);
  });

  it('≥ 50 samples → high', () => {
    addN(60);
    expect(aiBaselineService.getConfidenceLevel()).toBe('high');
    expect(aiBaselineService.getConfidenceDescription()).toMatch(/High confidence/);
  });
});

describe('aiBaselineService — thresholds + summary', () => {
  it('calculateBaseline returns defaults when no samples', () => {
    const out = aiBaselineService.calculateBaseline();
    expect(out.confidence).toBe(0);
    expect(out.sampleSize).toBe(0);
    expect(out.rfqiTarget).toBe(75);
  });

  it('calculateBaseline returns thresholds derived from samples', () => {
    for (let i = 0; i < 30; i++) {
      aiBaselineService.addSample({
        timestamp: Date.now() + i,
        rfqi: 80,
        channelUtilization: 30,
        clientCount: 25,
        apOnlineCount: 5,
        retryRate: 5,
        latencyMs: 25,
      });
    }
    const out = aiBaselineService.calculateBaseline();
    expect(out.sampleSize).toBe(30);
    expect(out.confidence).toBeGreaterThan(0);
  });

  it('getThresholds returns cached when within max age', () => {
    aiBaselineService.addSample({
      timestamp: Date.now(),
      rfqi: 80,
      channelUtilization: 0,
      clientCount: 1,
      apOnlineCount: 1,
    });
    const first = aiBaselineService.getThresholds(60_000);
    const second = aiBaselineService.getThresholds(60_000);
    // Same lastUpdated => returned the cached object
    expect(first.lastUpdated).toBe(second.lastUpdated);
  });

  it('getSummary surfaces counts/averages/range', () => {
    aiBaselineService.addSample({
      timestamp: Date.now(),
      rfqi: 90,
      channelUtilization: 0,
      clientCount: 100,
      apOnlineCount: 1,
    });
    aiBaselineService.addSample({
      timestamp: Date.now() + 1000,
      rfqi: 70,
      channelUtilization: 0,
      clientCount: 50,
      apOnlineCount: 1,
    });
    const sum = aiBaselineService.getSummary();
    expect(sum.sampleCount).toBe(2);
    expect(sum.avgRfqi).toBe(80);
    expect(sum.avgClientCount).toBe(75);
  });

  it('clearData wipes samples and removes the storage key', () => {
    aiBaselineService.addSample({
      timestamp: Date.now(),
      rfqi: 80,
      channelUtilization: 0,
      clientCount: 1,
      apOnlineCount: 1,
    });
    aiBaselineService.clearData();
    expect(aiBaselineService.getSampleCount()).toBe(0);
    expect(localStorage.getItem('edge_ai_baseline_v1')).toBeNull();
  });
});

describe('aiBaselineService — exported helpers', () => {
  it('recordNetworkMetrics() proxies through to recordSnapshot', () => {
    recordNetworkMetrics({
      rfqi: 70,
      clientCount: 5,
      apOnlineCount: 2,
    });
    expect(aiBaselineService.getSampleCount()).toBe(1);
  });

  it('getAIBaselineThresholds() returns thresholds via getThresholds()', () => {
    expect(getAIBaselineThresholds()).toBeDefined();
  });
});
