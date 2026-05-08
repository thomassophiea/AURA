import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock tenantService so the dynamic import inside loadData() resolves to a stub.
vi.mock('./tenantService', () => ({
  tenantService: {
    getControllerUrl: vi.fn(() => null),
  },
}));

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
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { simpleServiceMapping } from './simpleServiceMapping';

// The service is a singleton — its internal state persists across imports.
// We rely on the absence of a controller URL (mocked to null) so loadData()
// short-circuits without firing real network requests, yet still flips
// `loaded=true` so subsequent calls take the fallback path deterministically.

describe('simpleServiceMapping.getServiceDetails', () => {
  it('returns N/A placeholders for an empty serviceId', async () => {
    const out = await simpleServiceMapping.getServiceDetails('');
    expect(out).toEqual({ ssid: 'N/A', networkName: 'N/A', vlan: 'N/A' });
  });

  it('returns "Service <8-char>" fallback for an unknown id when no data loaded', async () => {
    const out = await simpleServiceMapping.getServiceDetails('abcdef0123-def');
    expect(out.ssid).toBe('Service abcdef01');
    expect(out.networkName).toBe('Service abcdef01');
    expect(out.vlan).toBe('N/A');
  });
});

describe('simpleServiceMapping.getRoleName', () => {
  it('returns "N/A" for empty roleId', async () => {
    expect(await simpleServiceMapping.getRoleName('')).toBe('N/A');
  });

  it('returns "Role <8-char>" fallback for an unknown id', async () => {
    expect(await simpleServiceMapping.getRoleName('zyxwvuts-rest')).toBe('Role zyxwvuts');
  });
});

describe('simpleServiceMapping.getStatus', () => {
  it('reports loaded=true after the first failed/empty load attempt', () => {
    // After previous getServiceDetails / getRoleName, loaded is now true.
    const status = simpleServiceMapping.getStatus();
    expect(status.loaded).toBe(true);
    expect(typeof status.servicesCount).toBe('number');
    expect(typeof status.rolesCount).toBe('number');
  });
});
