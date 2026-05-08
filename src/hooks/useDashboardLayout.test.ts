import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardLayout } from './useDashboardLayout';

const STORAGE_KEY = 'dashboard_layout';

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
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDashboardLayout', () => {
  it('initializes with all default widgets when no storage', () => {
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.widgets.length).toBeGreaterThanOrEqual(9);
    expect(result.current.widgets[0].id).toBe('NetworkHealth');
    expect(result.current.widgets[0].locked).toBe(true);
  });

  it('persists widget changes to localStorage', () => {
    const { result } = renderHook(() => useDashboardLayout());
    act(() => result.current.toggleWidget('TopAPs'));
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    const w = persisted.find((x: { id: string }) => x.id === 'TopAPs');
    expect(w.visible).toBe(false);
  });

  it('toggleWidget flips visibility for non-locked widgets', () => {
    const { result } = renderHook(() => useDashboardLayout());
    const before = result.current.widgets.find((w) => w.id === 'TopAPs')!.visible;
    act(() => result.current.toggleWidget('TopAPs'));
    const after = result.current.widgets.find((w) => w.id === 'TopAPs')!.visible;
    expect(after).toBe(!before);
  });

  it('toggleWidget refuses to flip a locked widget', () => {
    const { result } = renderHook(() => useDashboardLayout());
    const before = result.current.widgets.find((w) => w.id === 'NetworkHealth')!.visible;
    act(() => result.current.toggleWidget('NetworkHealth'));
    const after = result.current.widgets.find((w) => w.id === 'NetworkHealth')!.visible;
    expect(after).toBe(before);
  });

  it('moveWidget reorders the widget array', () => {
    const { result } = renderHook(() => useDashboardLayout());
    const initialIds = result.current.widgets.map((w) => w.id);
    act(() => result.current.moveWidget(1, 3));
    const reorderedIds = result.current.widgets.map((w) => w.id);
    expect(reorderedIds).not.toEqual(initialIds);
    expect(reorderedIds[3]).toBe(initialIds[1]);
  });

  it('resetToDefault restores the original widget list', () => {
    const { result } = renderHook(() => useDashboardLayout());
    act(() => result.current.toggleWidget('TopAPs'));
    expect(result.current.widgets.find((w) => w.id === 'TopAPs')!.visible).toBe(false);
    act(() => result.current.resetToDefault());
    expect(result.current.widgets.find((w) => w.id === 'TopAPs')!.visible).toBe(true);
  });

  it('visibleWidgets only contains widgets with visible=true', () => {
    const { result } = renderHook(() => useDashboardLayout());
    act(() => result.current.toggleWidget('TopAPs'));
    expect(result.current.visibleWidgets.find((w) => w.id === 'TopAPs')).toBeUndefined();
  });

  it('rehydrates persisted layout, dropping unknown ids', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'NetworkHealth', name: 'X', visible: true, locked: true },
        { id: 'TopClients', name: 'Y', visible: false },
        { id: 'GhostWidget', name: 'Ghost', visible: true },
      ])
    );
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.widgets.find((w) => w.id === 'GhostWidget')).toBeUndefined();
    expect(result.current.widgets.find((w) => w.id === 'TopClients')!.visible).toBe(false);
  });

  it('rehydration appends any new default widgets that were missing', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'NetworkHealth', name: 'NH', visible: true, locked: true }])
    );
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.widgets.length).toBeGreaterThanOrEqual(9);
    expect(result.current.widgets.find((w) => w.id === 'TopAPs')).toBeDefined();
  });

  it('rehydration normalizes name from defaults (renames are not persisted)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'TopAPs', name: 'OLD-NAME', visible: true }])
    );
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.widgets.find((w) => w.id === 'TopAPs')!.name).toBe('Top Access Points');
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json');
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.widgets.length).toBeGreaterThanOrEqual(9);
    expect(console.error).toHaveBeenCalled();
  });
});
