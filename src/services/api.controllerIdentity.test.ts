import { describe, it, expect, vi, afterEach } from 'vitest';

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

describe('getControllerIdentity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns ok identity from /system/info', async () => {
    vi.spyOn(apiService, 'getOSOneInfo').mockResolvedValue({
      system: { raw: '', externalServices: [], uptime: '', cpuUtilization: 0, memoryFreePercent: 0, diskPartitions: [], ports: [], hostName: 'xcc-lab-01' },
      manufacturing: { raw: '', lockingId: '1A2B-3C4D' },
      timestamp: 0,
    } as any);

    const id = await apiService.getControllerIdentity('https://1.2.3.4');
    expect(id.status).toBe('ok');
    expect(id.hostname).toBe('xcc-lab-01');
    expect(id.lockingId).toBe('1A2B-3C4D');
    expect(typeof id.fetchedAt).toBe('string');
  });

  it('falls back to URL host when hostName missing', async () => {
    vi.spyOn(apiService, 'getOSOneInfo').mockResolvedValue({
      system: { raw: '', externalServices: [], uptime: '', cpuUtilization: 0, memoryFreePercent: 0, diskPartitions: [], ports: [] },
      manufacturing: { raw: '', lockingId: '' },
      timestamp: 0,
    } as any);

    const id = await apiService.getControllerIdentity('https://xcc.example.com:5825');
    expect(id.hostname).toBe('xcc.example.com');
    expect(id.status).toBe('ok');
  });

  it('returns unreachable on fetch failure', async () => {
    vi.spyOn(apiService, 'getOSOneInfo').mockRejectedValue(new Error('timeout'));
    const id = await apiService.getControllerIdentity('https://1.2.3.4');
    expect(id.status).toBe('unreachable');
    expect(id.hostname).toBe('1.2.3.4');
  });
});
