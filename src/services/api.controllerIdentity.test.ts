import { describe, it, expect, vi } from 'vitest';

// localStorage must be available before the apiService singleton is constructed.
// vi.hoisted runs before any imports are evaluated, so this shim lands in time.
const { localStorageMock } = vi.hoisted(() => {
  const store: Record<string, string> = {};
  const mock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });
  return { localStorageMock: mock };
});

import { apiService } from './api';

describe('parseOSOneSystemInfo hostname', () => {
  it('extracts Host Name from raw system info', () => {
    const raw = 'System Up Time: 1 day\nHost Name: xcc-lab-01\nCPU Utilization: 5.0';
    // @ts-expect-error - exercising the private parser directly
    const parsed = apiService.parseOSOneSystemInfo({ result: raw });
    expect(parsed.hostName).toBe('xcc-lab-01');
  });
});
