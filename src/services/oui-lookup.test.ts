import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVendor, getVendorIcon, batchLookupVendors, getShortVendor } from './oui-lookup';

describe('getVendorIcon', () => {
  it('matches major vendors to specific icons', () => {
    expect(getVendorIcon('Apple, Inc.')).toBe('🍎');
    expect(getVendorIcon('Samsung Electronics')).toBe('📱');
    expect(getVendorIcon('Dell Inc')).toBe('💻');
    expect(getVendorIcon('Hewlett Packard')).toBe('🖥️');
    expect(getVendorIcon('HP Enterprise')).toBe('🖥️');
    expect(getVendorIcon('Lenovo Group')).toBe('💻');
    expect(getVendorIcon('Microsoft Corporation')).toBe('🪟');
    expect(getVendorIcon('Cisco Systems')).toBe('🌐');
    expect(getVendorIcon('Intel Corporate')).toBe('🔷');
    expect(getVendorIcon('Google, Inc.')).toBe('🔍');
    expect(getVendorIcon('Amazon Technologies')).toBe('📦');
    expect(getVendorIcon('TP-Link Corporation')).toBe('📡');
    expect(getVendorIcon('Tplink Networks')).toBe('📡');
    expect(getVendorIcon('Raspberry Pi Trading')).toBe('🫐');
    expect(getVendorIcon('Nintendo Co Ltd')).toBe('🎮');
  });

  it('is case-insensitive', () => {
    expect(getVendorIcon('apple, inc.')).toBe('🍎');
    expect(getVendorIcon('CISCO SYSTEMS')).toBe('🌐');
    expect(getVendorIcon('Dell Inc')).toBe('💻');
  });

  it('falls back to a generic device icon for unknown vendors', () => {
    expect(getVendorIcon('Unknown Vendor')).toBe('📟');
    expect(getVendorIcon('Some Obscure Device Maker')).toBe('📟');
    expect(getVendorIcon('')).toBe('📟');
  });
});

describe('getShortVendor', () => {
  it('uses the abbreviation table for known long names', () => {
    expect(getShortVendor('Apple, Inc.')).toBe('Apple');
    expect(getShortVendor('Samsung Electronics Co.,Ltd')).toBe('Samsung');
    expect(getShortVendor('Hewlett Packard')).toBe('HP');
    expect(getShortVendor('Cisco Systems, Inc')).toBe('Cisco');
    expect(getShortVendor('Intel Corporate')).toBe('Intel');
    expect(getShortVendor('Microsoft Corporation')).toBe('Microsoft');
    expect(getShortVendor('Google, Inc.')).toBe('Google');
    expect(getShortVendor('Amazon Technologies Inc.')).toBe('Amazon');
    expect(getShortVendor('TP-Link Corporation Limited')).toBe('TP-Link');
    expect(getShortVendor('NETGEAR')).toBe('Netgear');
    expect(getShortVendor('Ubiquiti Networks Inc.')).toBe('Ubiquiti');
    expect(getShortVendor('Raspberry Pi Trading Ltd')).toBe('Raspberry Pi');
    expect(getShortVendor('Espressif Inc.')).toBe('Espressif');
  });

  it('returns "Unknown" for the canonical unknown sentinel', () => {
    expect(getShortVendor('Unknown Vendor')).toBe('Unknown');
  });

  it('falls back to first word for unmatched vendors', () => {
    expect(getShortVendor('SomeNewMaker AB')).toBe('SomeNewMaker');
    expect(getShortVendor('Acme Corp.')).toBe('Acme');
  });

  it('strips trailing comma/paren content from the first segment', () => {
    expect(getShortVendor('VendorOne, LLC')).toBe('VendorOne');
    expect(getShortVendor('VendorTwo (parent)')).toBe('VendorTwo');
  });
});

describe('getVendor — caching behaviour', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ vendor: 'Apple, Inc.' }),
        text: () => Promise.resolve(''),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns "Unknown Vendor" for empty / falsy input without hitting the network', async () => {
    expect(await getVendor('')).toBe('Unknown Vendor');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns "Unknown Vendor" for too-short MAC strings without hitting the network', async () => {
    expect(await getVendor('a:b')).toBe('Unknown Vendor');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('caches successful lookups by OUI — second call with same prefix is free', async () => {
    // Use a unique OUI per test since the module-level vendorCache persists
    // across tests in the same suite.
    const v1 = await getVendor('11:22:33:11:22:33');
    const v2 = await getVendor('11:22:33:99:88:77');
    expect(v1).toBe('Apple, Inc.');
    expect(v2).toBe('Apple, Inc.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles separator variations consistently for cache hits', async () => {
    // Use a unique OUI not exercised by other tests.
    await getVendor('44:55:66:11:22:33');
    await getVendor('44-55-66-11-22-33');
    await getVendor('445566112233');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns "Unknown Vendor" when the API responds with a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('boom'),
      })
    );
    expect(await getVendor('AA:BB:CC:DD:EE:FF')).toBe('Unknown Vendor');
  });

  it('returns "Unknown Vendor" when the network call rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await getVendor('AB:CD:EF:11:22:33')).toBe('Unknown Vendor');
  });
});

describe('batchLookupVendors', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        const macParam = new URL(url, 'http://test').searchParams.get('mac') ?? '';
        const oui = macParam.slice(0, 8).toLowerCase();
        const vendorMap: Record<string, string> = {
          '00:11:22': 'Vendor A',
          '00:33:44': 'Vendor B',
        };
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({ vendor: vendorMap[oui] ?? 'Unknown Vendor' }),
          text: () => Promise.resolve(''),
        });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a Map keyed by the input MAC strings', async () => {
    const macs = ['de:ad:be:ef:00:01', 'de:ad:be:ef:00:02'];
    const out = await batchLookupVendors(macs);
    expect(out).toBeInstanceOf(Map);
    expect(out.size).toBe(2);
    expect(out.get(macs[0])).toBeDefined();
    expect(out.get(macs[1])).toBeDefined();
  });

  it('handles empty input gracefully', async () => {
    const out = await batchLookupVendors([]);
    expect(out.size).toBe(0);
  });
});
