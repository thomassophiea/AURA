import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useOperationalContext,
  getOperationalContext,
  setOperationalContext,
  DEFAULT_PROFILES,
} from './useOperationalContext';

const STORAGE_KEY = 'aura_operational_context_v1';

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
  // Reset module-level state to defaults via the imperative setter.
  setOperationalContext({
    mode: 'AI_INSIGHTS',
    siteId: null,
    apId: null,
    clientId: null,
    timeRange: '24h',
    dateFrom: null,
    dateTo: null,
    timeCursor: null,
    cursorLocked: false,
    environmentProfile: DEFAULT_PROFILES.CAMPUS,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useOperationalContext', () => {
  it('initializes with module-level default state', () => {
    const { result } = renderHook(() => useOperationalContext());
    expect(result.current.ctx.mode).toBe('AI_INSIGHTS');
    expect(result.current.ctx.timeRange).toBe('24h');
    expect(result.current.ctx.cursorLocked).toBe(false);
  });

  it('setMode("AI_INSIGHTS") clears site/ap/client', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() => result.current.selectSite('site-1'));
    expect(result.current.ctx.siteId).toBe('site-1');
    act(() => result.current.setMode('AI_INSIGHTS'));
    expect(result.current.ctx.mode).toBe('AI_INSIGHTS');
    expect(result.current.ctx.siteId).toBeNull();
  });

  it('selectSite sets mode=SITE and clears apId/clientId', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() => result.current.selectSite('site-2'));
    expect(result.current.ctx.mode).toBe('SITE');
    expect(result.current.ctx.siteId).toBe('site-2');
    expect(result.current.ctx.apId).toBeNull();
    expect(result.current.ctx.clientId).toBeNull();
  });

  it('selectAP sets mode=AP, optionally updates siteId', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() => result.current.selectAP('ap-1', 'site-3'));
    expect(result.current.ctx.mode).toBe('AP');
    expect(result.current.ctx.apId).toBe('ap-1');
    expect(result.current.ctx.siteId).toBe('site-3');
  });

  it('selectClient sets mode=CLIENT, optionally updates ap/site', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() => result.current.selectClient('c-1', 'ap-2', 'site-4'));
    expect(result.current.ctx.mode).toBe('CLIENT');
    expect(result.current.ctx.clientId).toBe('c-1');
    expect(result.current.ctx.apId).toBe('ap-2');
    expect(result.current.ctx.siteId).toBe('site-4');
  });

  it('setTimeRange updates timeRange + persists to localStorage', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() => result.current.setTimeRange('1h'));
    expect(result.current.ctx.timeRange).toBe('1h');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.timeRange).toBe('1h');
  });

  it('setTimeCursor only takes effect when cursor is unlocked', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() => result.current.toggleCursorLock()); // → locked
    act(() => result.current.setTimeCursor(12345));
    expect(result.current.ctx.timeCursor).toBeNull();
    act(() => result.current.toggleCursorLock()); // → unlocked
    act(() => result.current.setTimeCursor(99999));
    expect(result.current.ctx.timeCursor).toBe(99999);
  });

  it('toggleCursorLock flips cursorLocked', () => {
    const { result } = renderHook(() => useOperationalContext());
    expect(result.current.ctx.cursorLocked).toBe(false);
    act(() => result.current.toggleCursorLock());
    expect(result.current.ctx.cursorLocked).toBe(true);
  });

  it('setEnvironmentProfile swaps the profile', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() => result.current.setEnvironmentProfile(DEFAULT_PROFILES.RETAIL));
    expect(result.current.ctx.environmentProfile.id).toBe('RETAIL');
  });

  it('resetContext returns to defaults', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() => result.current.selectSite('site-99'));
    expect(result.current.ctx.siteId).toBe('site-99');
    act(() => result.current.resetContext());
    expect(result.current.ctx.siteId).toBeNull();
    expect(result.current.ctx.mode).toBe('AI_INSIGHTS');
  });

  it('updateContext applies arbitrary partial updates', () => {
    const { result } = renderHook(() => useOperationalContext());
    act(() =>
      result.current.updateContext({
        siteId: 's',
        timeRange: '7d',
      })
    );
    expect(result.current.ctx.siteId).toBe('s');
    expect(result.current.ctx.timeRange).toBe('7d');
  });

  it('module-level getOperationalContext returns current state', () => {
    setOperationalContext({ siteId: 'imp-1' });
    expect(getOperationalContext().siteId).toBe('imp-1');
  });

  it('two hook instances stay in sync via the listener bus', () => {
    const a = renderHook(() => useOperationalContext());
    const b = renderHook(() => useOperationalContext());
    act(() => a.result.current.selectSite('shared-site'));
    expect(b.result.current.ctx.siteId).toBe('shared-site');
  });
});

describe('DEFAULT_PROFILES', () => {
  it('exposes 7 known profile ids with full numeric thresholds', () => {
    const ids = Object.keys(DEFAULT_PROFILES);
    expect(ids.sort()).toEqual(
      ['AI_BASELINE', 'RETAIL', 'WAREHOUSE', 'DISTRIBUTION', 'HQ', 'CAMPUS', 'CUSTOM'].sort()
    );
    for (const profile of Object.values(DEFAULT_PROFILES)) {
      expect(typeof profile.rfqiTarget).toBe('number');
      expect(typeof profile.channelUtilizationPct).toBe('number');
      expect(typeof profile.noiseFloorDbm).toBe('number');
      expect(typeof profile.clientDensity).toBe('number');
      expect(typeof profile.latencyP95Ms).toBe('number');
      expect(typeof profile.retryRatePct).toBe('number');
    }
  });
});
