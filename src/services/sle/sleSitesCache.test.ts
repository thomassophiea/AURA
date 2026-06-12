import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readCachedSites, writeCachedSites } from './sleSitesCache';
import type { Site } from '../api';

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

const site = (id: string): Site => ({ id, name: id }) as Site;

beforeEach(() => installLocalStorageStub());

describe('sleSitesCache', () => {
  it('round-trips a site list per scope key', () => {
    writeCachedSites('org', [site('a'), site('b')]);
    expect(readCachedSites('org').map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('never persists an empty list (so blips cannot clear last-known-good)', () => {
    writeCachedSites('org', [site('a')]);
    writeCachedSites('org', []); // a transient empty fetch
    expect(readCachedSites('org').map((s) => s.id)).toEqual(['a']);
  });

  it('keeps scopes isolated and returns [] for unknown scope', () => {
    writeCachedSites('sg-1', [site('x')]);
    expect(readCachedSites('sg-2')).toEqual([]);
  });
});
