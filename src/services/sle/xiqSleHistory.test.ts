import { describe, it, expect, beforeEach, vi } from 'vitest';
import { attachXiqHistory } from './xiqSleHistory';
import type { SLEMetric } from '../../types/sle';

function installLocalStorageStub() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
}

const sle = (id: string, rate: number): SLEMetric => ({
  id,
  name: id,
  scope: 'wireless',
  successRate: rate,
  status: 'good',
  unit: 'percent',
  totalUserMinutes: 10,
  affectedUserMinutes: 0,
  timeSeries: [],
  classifiers: [],
  description: '',
});

beforeEach(() => installLocalStorageStub());

describe('attachXiqHistory', () => {
  it('seeds a single point on first capture', () => {
    const out = attachXiqHistory('sg:all', [sle('coverage', 90)], 1000);
    expect(out[0].timeSeries).toHaveLength(1);
    expect(out[0].timeSeries[0].successRate).toBe(90);
  });

  it('accumulates points across captures spaced beyond the dedup window', () => {
    attachXiqHistory('sg:all', [sle('coverage', 90)], 1000);
    const out = attachXiqHistory('sg:all', [sle('coverage', 80)], 1000 + 60_000);
    expect(out[0].timeSeries).toHaveLength(2);
    expect(out[0].timeSeries.map((p) => p.successRate)).toEqual([90, 80]);
  });

  it('collapses rapid re-loads within the dedup window into one point', () => {
    attachXiqHistory('sg:all', [sle('coverage', 90)], 1000);
    const out = attachXiqHistory('sg:all', [sle('coverage', 85)], 1000 + 5_000);
    expect(out[0].timeSeries).toHaveLength(1);
    expect(out[0].timeSeries[0].successRate).toBe(85); // replaced, not appended
  });

  it('keeps history separate per site context', () => {
    attachXiqHistory('sg:siteA', [sle('coverage', 90)], 1000);
    const b = attachXiqHistory('sg:siteB', [sle('coverage', 50)], 2000);
    expect(b[0].timeSeries).toHaveLength(1);
    expect(b[0].timeSeries[0].successRate).toBe(50);
  });
});
