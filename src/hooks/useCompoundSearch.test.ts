import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompoundSearch } from './useCompoundSearch';

const KEY = 'cs-test';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface Row {
  name: string;
  mac: string;
  vendor?: string | null;
}

const rows: Row[] = [
  { name: 'AP-001', mac: '00:11:22:aa:bb:cc', vendor: 'Extreme' },
  { name: 'AP-002', mac: '00:11:22:dd:ee:ff', vendor: 'Cisco' },
  { name: 'AP-Lobby-3', mac: 'aa:bb:cc:11:22:33', vendor: 'Extreme' },
  { name: 'switch-core-1', mac: 'ff:ee:dd:00:00:01', vendor: null },
];

const config = {
  storageKey: KEY,
  fields: [(r: Row) => r.name, (r: Row) => r.mac, (r: Row) => r.vendor],
};

describe('useCompoundSearch', () => {
  it('initializes empty when sessionStorage is clean', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    expect(result.current.query).toBe('');
    expect(result.current.tokens).toEqual([]);
    expect(result.current.hasActiveSearch).toBe(false);
  });

  it('rehydrates the query from sessionStorage', () => {
    sessionStorage.setItem(KEY, 'lobby');
    const { result } = renderHook(() => useCompoundSearch(config));
    expect(result.current.query).toBe('lobby');
    expect(result.current.hasActiveSearch).toBe(true);
  });

  it('setQuery persists the value back to sessionStorage', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('AP'));
    expect(sessionStorage.getItem(KEY)).toBe('AP');
  });

  it('clearSearch resets query to empty and persists empty string', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('lobby'));
    act(() => result.current.clearSearch());
    expect(result.current.query).toBe('');
    expect(sessionStorage.getItem(KEY)).toBe('');
  });

  it('tokenizes whitespace-separated tokens, lowercased', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('  AP  Lobby  '));
    expect(result.current.tokens).toEqual(['ap', 'lobby']);
  });

  it('filterRows returns all rows when no search is active', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    expect(result.current.filterRows(rows).length).toBe(rows.length);
  });

  it('single-token search matches across configured fields', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('lobby'));
    const out = result.current.filterRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('AP-Lobby-3');
  });

  it('search is case-insensitive', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('CISCO'));
    expect(result.current.filterRows(rows).map((r) => r.name)).toEqual(['AP-002']);
  });

  it('multi-token search uses AND across fields', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('extreme lobby'));
    const out = result.current.filterRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('AP-Lobby-3');
  });

  it('no rows match when one token is unmatchable', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('extreme nonexistent'));
    expect(result.current.filterRows(rows)).toHaveLength(0);
  });

  it('handles null/undefined extractor returns', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('switch'));
    const out = result.current.filterRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('switch-core-1');
  });

  it('matches partial substrings inside field values', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('aa:bb'));
    const out = result.current.filterRows(rows);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it('whitespace-only query is treated as inactive', () => {
    const { result } = renderHook(() => useCompoundSearch(config));
    act(() => result.current.setQuery('   '));
    expect(result.current.tokens).toEqual([]);
    expect(result.current.hasActiveSearch).toBe(false);
    expect(result.current.filterRows(rows)).toHaveLength(rows.length);
  });
});
