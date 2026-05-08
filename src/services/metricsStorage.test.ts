import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist supabase mock so vi.mock factory can reference it.
const { supabaseFromSpy, fromImpl } = vi.hoisted(() => {
  const fromImpl = vi.fn();
  const supabaseFromSpy = vi.fn(fromImpl);
  return { supabaseFromSpy, fromImpl };
});

vi.mock('./supabaseClient', () => ({
  supabase: { from: supabaseFromSpy },
}));

import { MetricsStorageService, metricsStorage } from './metricsStorage';

beforeEach(() => {
  fromImpl.mockReset();
  supabaseFromSpy.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MetricsStorageService — singleton', () => {
  it('getInstance returns the same instance every time', () => {
    const a = MetricsStorageService.getInstance();
    const b = MetricsStorageService.getInstance();
    expect(a).toBe(b);
    expect(a).toBe(metricsStorage);
  });
});

describe('MetricsStorageService — periodic collection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('startPeriodicCollection invokes the callback immediately', () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    metricsStorage.startPeriodicCollection(15, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    metricsStorage.stopPeriodicCollection();
  });

  it('startPeriodicCollection invokes the callback again after intervalMinutes', () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    metricsStorage.startPeriodicCollection(15, cb);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(cb).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(cb).toHaveBeenCalledTimes(3);
    metricsStorage.stopPeriodicCollection();
  });

  it('startPeriodicCollection is idempotent — second call does not double-schedule', () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    metricsStorage.startPeriodicCollection(15, cb);
    metricsStorage.startPeriodicCollection(15, cb); // should warn + no-op
    expect(console.warn).toHaveBeenCalled();
    vi.advanceTimersByTime(15 * 60 * 1000);
    // Initial call + one tick = 2 (not 3 if double-scheduled).
    expect(cb).toHaveBeenCalledTimes(2);
    metricsStorage.stopPeriodicCollection();
  });

  it('stopPeriodicCollection cancels the interval', () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    metricsStorage.startPeriodicCollection(15, cb);
    metricsStorage.stopPeriodicCollection();
    vi.advanceTimersByTime(60 * 60 * 1000);
    // Only the immediate initial call.
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('startPeriodicCollection swallows callback errors and keeps the interval going', async () => {
    const cb = vi.fn().mockRejectedValue(new Error('upstream blew up'));
    metricsStorage.startPeriodicCollection(15, cb);
    // Initial collection error is logged via console.error
    await Promise.resolve(); // let the rejection settle
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(cb).toHaveBeenCalledTimes(2);
    metricsStorage.stopPeriodicCollection();
  });
});

// Builder for a chainable Supabase query mock that returns { data, error }.
const okSelect = (data: unknown[]) => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.gte = vi.fn().mockReturnValue(builder);
  builder.lte = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockResolvedValue({ data, error: null });
  builder.insert = vi.fn().mockResolvedValue({ error: null });
  builder.delete = vi.fn().mockReturnValue(builder);
  builder.lt = vi.fn().mockResolvedValue({ error: null });
  return builder;
};

describe('MetricsStorageService — saveServiceMetrics', () => {
  it('inserts a service metrics row', async () => {
    const builder = okSelect([]);
    fromImpl.mockReturnValue(builder);
    await metricsStorage.saveServiceMetrics({
      service_id: 'svc-1',
      service_name: 'WiFi',
      timestamp: '2026-05-08T00:00:00Z',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metrics: { reliability: 99 } as any,
    });
    expect(supabaseFromSpy).toHaveBeenCalledWith('service_metrics_snapshots');
    expect(builder.insert).toHaveBeenCalled();
  });

  it('logs (does not throw) when supabase returns an error', async () => {
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn().mockResolvedValue({ error: new Error('db down') });
    fromImpl.mockReturnValue(builder);
    await expect(
      metricsStorage.saveServiceMetrics({
        service_id: 'svc-1',
        service_name: 'WiFi',
        timestamp: '2026-05-08T00:00:00Z',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metrics: {} as any,
      })
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('MetricsStorageService — getServiceMetrics', () => {
  it('returns the data array on success', async () => {
    const builder = okSelect([{ service_id: 's', timestamp: 't' }]);
    fromImpl.mockReturnValue(builder);
    // The chain ends with .limit() in some queries but with .order() here —
    // override .order() to return the awaitable shape expected.
    builder.order = vi.fn().mockResolvedValue({ data: [{ service_id: 's' }], error: null });
    const out = await metricsStorage.getServiceMetrics(
      'svc-1',
      new Date('2026-05-01'),
      new Date('2026-05-08')
    );
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(1);
  });

  it('returns [] on supabase error', async () => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.gte = vi.fn().mockReturnValue(builder);
    builder.lte = vi.fn().mockReturnValue(builder);
    builder.order = vi.fn().mockResolvedValue({ data: null, error: new Error('boom') });
    fromImpl.mockReturnValue(builder);
    const out = await metricsStorage.getServiceMetrics('s', new Date(), new Date());
    expect(out).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('MetricsStorageService — checkConnection', () => {
  it('returns true on successful select', async () => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockResolvedValue({ data: [], error: null });
    fromImpl.mockReturnValue(builder);
    expect(await metricsStorage.checkConnection()).toBe(true);
  });

  it('returns false on supabase error', async () => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.limit = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('connection refused') });
    fromImpl.mockReturnValue(builder);
    expect(await metricsStorage.checkConnection()).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns false when supabase throws a hard error', async () => {
    fromImpl.mockImplementation(() => {
      throw new Error('client not configured');
    });
    expect(await metricsStorage.checkConnection()).toBe(false);
  });
});
