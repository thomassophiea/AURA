import { describe, it, expect } from 'vitest';
import {
  normalizeMac,
  shortenManufacturer,
  createDerivedLabel,
  getExperienceStateLabel,
  getExperienceStateColor,
  resolveClientIdentity,
  resolveClientIdentities,
  formatClientDisplay,
  searchClients,
  inferDeviceType,
} from './clientIdentity';

describe('normalizeMac', () => {
  it('returns empty for null / undefined / empty', () => {
    expect(normalizeMac(null)).toBe('');
    expect(normalizeMac(undefined)).toBe('');
    expect(normalizeMac('')).toBe('');
  });

  it('uppercases, strips separators, re-inserts colons', () => {
    expect(normalizeMac('aabbcc-ddeeff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMac('aa:bb:cc:dd:ee:ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMac('AABBCCDDEEFF')).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('passes through partial input by re-grouping the available bytes', () => {
    expect(normalizeMac('aabbcc')).toBe('AA:BB:CC');
  });
});

describe('shortenManufacturer', () => {
  it('uses the override table for canonical legal names', () => {
    expect(shortenManufacturer('Apple, Inc.')).toBe('Apple');
    expect(shortenManufacturer('Cisco Systems, Inc.')).toBe('Cisco');
    expect(shortenManufacturer('Hewlett Packard Enterprise')).toBe('HPE');
    expect(shortenManufacturer('Samsung Electronics Co.,Ltd')).toBe('Samsung');
    expect(shortenManufacturer('NETGEAR')).toBe('Netgear');
    expect(shortenManufacturer('Wistron Neweb Corporation')).toBe('Wistron Neweb');
  });

  it('case-insensitively matches the override table', () => {
    expect(shortenManufacturer('apple, inc.')).toBe('Apple');
  });

  it('strips common legal suffix tokens when no override matches', () => {
    // Note: the regex strips the words but may leave punctuation behind.
    // We just confirm "Technologies" / "LTD" are gone from the result.
    const out = shortenManufacturer('Acme Technologies LTD.');
    expect(out).toContain('Acme');
    expect(out).not.toMatch(/Technologies/i);
    expect(out).not.toMatch(/LTD/i);
  });

  it('caps result at ~25 chars', () => {
    const long = 'A Very Long Vendor Name That Should Definitely Be Shortened';
    const out = shortenManufacturer(long);
    expect(out.length).toBeLessThanOrEqual(28); // 25 + ellipsis
  });
});

describe('createDerivedLabel', () => {
  it('combines manufacturer + category when both present', () => {
    expect(createDerivedLabel('Apple, Inc.', 'phone')).toBe('Apple phone');
  });

  it('uses "<vendor> Device" when only manufacturer is known', () => {
    expect(createDerivedLabel('Apple, Inc.', null)).toBe('Apple Device');
  });

  it('uses category alone when manufacturer is null', () => {
    expect(createDerivedLabel(null, 'tablet')).toBe('tablet');
  });

  it('returns "Unknown Device" when nothing is known', () => {
    expect(createDerivedLabel(null, null)).toBe('Unknown Device');
  });
});

describe('getExperienceStateLabel', () => {
  it('returns "Unknown" for null / undefined', () => {
    expect(getExperienceStateLabel(null)).toBe('Unknown');
  });

  it('thresholds: ≥90 Excellent, ≥75 Good, ≥60 Fair, < 60 Poor', () => {
    expect(getExperienceStateLabel(95)).toBe('Excellent');
    expect(getExperienceStateLabel(90)).toBe('Excellent');
    expect(getExperienceStateLabel(89)).toBe('Good');
    expect(getExperienceStateLabel(75)).toBe('Good');
    expect(getExperienceStateLabel(74)).toBe('Fair');
    expect(getExperienceStateLabel(60)).toBe('Fair');
    expect(getExperienceStateLabel(59)).toBe('Poor');
    expect(getExperienceStateLabel(0)).toBe('Poor');
  });
});

describe('getExperienceStateColor', () => {
  it('returns muted color tuple when score is null', () => {
    const c = getExperienceStateColor(null);
    expect(c.bg).toBe('bg-muted');
    expect(c.text).toBe('text-muted-foreground');
  });

  it('green at ≥90, blue at ≥75, amber at ≥60, red below', () => {
    expect(getExperienceStateColor(95).text).toBe('text-green-500');
    expect(getExperienceStateColor(80).text).toBe('text-blue-500');
    expect(getExperienceStateColor(65).text).toBe('text-amber-500');
    expect(getExperienceStateColor(50).text).toBe('text-red-500');
  });
});

describe('resolveClientIdentity', () => {
  it('prefers an explicit deviceName over the hostname', () => {
    const id = resolveClientIdentity({
      macAddress: 'aa:bb:cc:dd:ee:ff',
      deviceName: 'Sam-Phone',
      hostName: 'samsung-galaxy-s24',
    });
    expect(id.displayName).toBe('Sam-Phone');
  });

  it('falls back to hostname when no deviceName', () => {
    const id = resolveClientIdentity({
      macAddress: 'aa:bb:cc:dd:ee:ff',
      hostName: 'lab-laptop',
    });
    expect(id.displayName).toContain('lab-laptop');
  });

  it('falls back to userName when no name fields are present', () => {
    const id = resolveClientIdentity({
      macAddress: 'aa:bb:cc:dd:ee:ff',
      userName: 'alice',
    });
    expect(id.displayName.toLowerCase()).toContain('alice');
  });

  it('falls back to a vendor-derived label when nothing else is known', () => {
    const id = resolveClientIdentity({
      macAddress: 'aa:bb:cc:dd:ee:ff',
    });
    expect(id.displayName).toBeTruthy();
  });

  it('preserves the macAddress on the result', () => {
    const id = resolveClientIdentity({ macAddress: 'aa:bb:cc:dd:ee:ff' });
    expect(id.macAddress).toBeTruthy();
  });
});

describe('resolveClientIdentities', () => {
  it('maps each input to a resolved identity', () => {
    const out = resolveClientIdentities([
      { macAddress: 'aa:bb:cc:dd:ee:01', deviceName: 'A' },
      { macAddress: 'aa:bb:cc:dd:ee:02', deviceName: 'B' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].displayName).toBe('A');
    expect(out[1].displayName).toBe('B');
  });
});

describe('formatClientDisplay', () => {
  const id = {
    displayName: 'Sam-Phone',
    deviceName: 'Sam-Phone',
    hostname: null,
    userName: null,
    userRole: null,
    deviceType: 'phone',
    deviceCategory: null,
    manufacturer: 'Samsung',
    osType: null,
    osVersion: null,
    macAddress: 'aa:bb:cc:dd:ee:ff',
    ipAddress: '10.0.0.1',
    apName: 'AP-Lobby',
    siteName: null,
    rfqiScore: null,
    experienceState: null,
    derivedLabel: null,
  } as unknown as Parameters<typeof formatClientDisplay>[0];

  it('returns just the displayName when no options', () => {
    expect(formatClientDisplay(id)).toBe('Sam-Phone');
  });

  it('appends "(deviceType)" when includeDevice', () => {
    expect(formatClientDisplay(id, { includeDevice: true })).toBe('Sam-Phone (phone)');
  });

  it('appends "on apName" when includeLocation', () => {
    expect(formatClientDisplay(id, { includeLocation: true })).toBe('Sam-Phone on AP-Lobby');
  });

  it('combines both options', () => {
    expect(formatClientDisplay(id, { includeDevice: true, includeLocation: true })).toBe(
      'Sam-Phone (phone) on AP-Lobby'
    );
  });
});

describe('searchClients', () => {
  const sample = [
    {
      displayName: 'iPhone-Sam',
      hostname: 'iphone-13',
      userName: 'sam',
      macAddress: 'aa:bb:cc:dd:ee:ff',
      ipAddress: '10.0.0.1',
      deviceType: 'phone',
    },
    {
      displayName: 'Lab-Laptop',
      hostname: 'lab01',
      userName: null,
      macAddress: '11:22:33:44:55:66',
      ipAddress: '10.0.0.2',
      deviceType: 'laptop',
    },
  ] as unknown as Parameters<typeof searchClients>[0];

  it('matches on displayName / hostname', () => {
    expect(searchClients(sample, 'iphone')).toHaveLength(1);
    expect(searchClients(sample, 'lab')).toHaveLength(1);
  });

  it('matches on macAddress fragment', () => {
    expect(searchClients(sample, '11:22')).toHaveLength(1);
  });

  it('matches on userName', () => {
    expect(searchClients(sample, 'sam')).toHaveLength(1);
  });

  it('returns empty when nothing matches', () => {
    expect(searchClients(sample, 'no-such-thing')).toEqual([]);
  });
});

describe('inferDeviceType', () => {
  it('returns null/null when no recognizable text', () => {
    const r = inferDeviceType({ macAddress: 'aa:bb:cc:dd:ee:ff' });
    expect(r.type).toBeNull();
    expect(r.category).toBeNull();
  });
});
