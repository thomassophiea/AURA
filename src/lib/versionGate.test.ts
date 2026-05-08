import { describe, it, expect } from 'vitest';
import { APP_VERSION, CACHE_VERSION, getAppVersion, getCacheVersion } from './versionGate';

describe('APP_VERSION / CACHE_VERSION exports', () => {
  it('APP_VERSION is a non-empty string', () => {
    expect(typeof APP_VERSION).toBe('string');
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });

  it('CACHE_VERSION is a number', () => {
    expect(typeof CACHE_VERSION).toBe('number');
  });
});

describe('getAppVersion / getCacheVersion', () => {
  it('getAppVersion returns the APP_VERSION constant', () => {
    expect(getAppVersion()).toBe(APP_VERSION);
  });

  it('getCacheVersion returns the CACHE_VERSION constant', () => {
    expect(getCacheVersion()).toBe(CACHE_VERSION);
  });
});
