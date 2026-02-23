import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cacheService, CACHE_TTL } from './cache';

describe('Cache Service', () => {
  beforeEach(() => {
    // Start with a clean slate before every test
    cacheService.clearAll();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Basic set / get
  // ---------------------------------------------------------------------------
  describe('set() and get()', () => {
    it('returns the value that was set', () => {
      cacheService.set('key1', 'hello', CACHE_TTL.SHORT);
      expect(cacheService.get('key1')).toBe('hello');
    });

    it('works for object values', () => {
      const payload = { id: 1, name: 'AURA' };
      cacheService.set('obj', payload, CACHE_TTL.SHORT);
      expect(cacheService.get('obj')).toEqual(payload);
    });

    it('works for array values', () => {
      const list = [1, 2, 3];
      cacheService.set('list', list, CACHE_TTL.SHORT);
      expect(cacheService.get('list')).toEqual(list);
    });

    it('works for number values', () => {
      cacheService.set('num', 42, CACHE_TTL.SHORT);
      expect(cacheService.get<number>('num')).toBe(42);
    });

    it('works for boolean values', () => {
      cacheService.set('flag', false, CACHE_TTL.SHORT);
      expect(cacheService.get<boolean>('flag')).toBe(false);
    });

    it('overwrites a previously set value for the same key', () => {
      cacheService.set('dup', 'first', CACHE_TTL.SHORT);
      cacheService.set('dup', 'second', CACHE_TTL.SHORT);
      expect(cacheService.get('dup')).toBe('second');
    });
  });

  // ---------------------------------------------------------------------------
  // Cache miss — key never set
  // ---------------------------------------------------------------------------
  describe('get() for keys that were never set', () => {
    it('returns null for an unknown key', () => {
      expect(cacheService.get('does-not-exist')).toBeNull();
    });

    it('returns null for an empty-string key that was never set', () => {
      expect(cacheService.get('')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // TTL / expiry
  // ---------------------------------------------------------------------------
  describe('TTL expiry', () => {
    it('returns the value when retrieved before the TTL expires', () => {
      const ttl = 5000; // 5 seconds
      cacheService.set('ttl-key', 'alive', ttl);

      // Advance time to just before expiry
      vi.advanceTimersByTime(ttl - 1);

      expect(cacheService.get('ttl-key')).toBe('alive');
    });

    it('returns null when retrieved just after the TTL boundary (expired)', () => {
      const ttl = 5000;
      cacheService.set('ttl-key', 'alive', ttl);

      // The cache uses age > ttl (strict), so advance one extra ms past the boundary
      vi.advanceTimersByTime(ttl + 1);

      expect(cacheService.get('ttl-key')).toBeNull();
    });

    it('returns null when retrieved after the TTL has elapsed', () => {
      const ttl = 1000; // 1 second
      cacheService.set('expired', 'value', ttl);

      vi.advanceTimersByTime(ttl + 1);

      expect(cacheService.get('expired')).toBeNull();
    });

    it('removes the expired entry from the cache (no stale data)', () => {
      const ttl = 2000;
      cacheService.set('stale', 'old', ttl);

      vi.advanceTimersByTime(ttl + 1);

      // First call triggers deletion
      expect(cacheService.get('stale')).toBeNull();
      // Stats should reflect the removal
      expect(cacheService.getStats().keys).not.toContain('stale');
    });

    it('handles multiple keys with different TTLs independently', () => {
      cacheService.set('short', 'a', 1000);
      cacheService.set('long', 'b', 10000);

      vi.advanceTimersByTime(1001);

      expect(cacheService.get('short')).toBeNull();
      expect(cacheService.get('long')).toBe('b');
    });

    it('uses the CACHE_TTL constants correctly', () => {
      cacheService.set('c', 'val', CACHE_TTL.SHORT); // 60 000 ms

      // Just before expiry
      vi.advanceTimersByTime(CACHE_TTL.SHORT - 1);
      expect(cacheService.get('c')).toBe('val');

      // Just after expiry
      vi.advanceTimersByTime(2); // total elapsed = CACHE_TTL.SHORT + 1
      expect(cacheService.get('c')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Cache invalidation — clear(key)
  // ---------------------------------------------------------------------------
  describe('clear()', () => {
    it('removes a specific key from the cache', () => {
      cacheService.set('to-delete', 'bye', CACHE_TTL.SHORT);
      cacheService.clear('to-delete');
      expect(cacheService.get('to-delete')).toBeNull();
    });

    it('does not affect other keys when clearing one key', () => {
      cacheService.set('keep', 'here', CACHE_TTL.SHORT);
      cacheService.set('remove', 'gone', CACHE_TTL.SHORT);

      cacheService.clear('remove');

      expect(cacheService.get('keep')).toBe('here');
      expect(cacheService.get('remove')).toBeNull();
    });

    it('is a no-op for a key that does not exist', () => {
      // Should not throw
      expect(() => cacheService.clear('ghost')).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Cache invalidation — clearAll()
  // ---------------------------------------------------------------------------
  describe('clearAll()', () => {
    it('removes all entries from the cache', () => {
      cacheService.set('a', 1, CACHE_TTL.SHORT);
      cacheService.set('b', 2, CACHE_TTL.SHORT);
      cacheService.set('c', 3, CACHE_TTL.SHORT);

      cacheService.clearAll();

      expect(cacheService.get('a')).toBeNull();
      expect(cacheService.get('b')).toBeNull();
      expect(cacheService.get('c')).toBeNull();
    });

    it('reports size 0 after clearAll()', () => {
      cacheService.set('x', 'val', CACHE_TTL.SHORT);
      cacheService.clearAll();

      expect(cacheService.getStats().size).toBe(0);
    });

    it('is safe to call on an already-empty cache', () => {
      expect(() => cacheService.clearAll()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getStats()
  // ---------------------------------------------------------------------------
  describe('getStats()', () => {
    it('reflects the current number of entries', () => {
      cacheService.set('s1', 'v1', CACHE_TTL.SHORT);
      cacheService.set('s2', 'v2', CACHE_TTL.SHORT);

      expect(cacheService.getStats().size).toBe(2);
    });

    it('includes the keys of stored entries', () => {
      cacheService.set('alpha', 1, CACHE_TTL.SHORT);
      cacheService.set('beta', 2, CACHE_TTL.SHORT);

      const { keys } = cacheService.getStats();
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
    });

    it('starts at size 0 after clearAll()', () => {
      cacheService.set('temp', 'data', CACHE_TTL.SHORT);
      cacheService.clearAll();

      expect(cacheService.getStats().size).toBe(0);
      expect(cacheService.getStats().keys).toHaveLength(0);
    });
  });
});
