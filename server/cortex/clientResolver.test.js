import { describe, it, expect } from 'vitest';
import {
  normaliseMac,
  isRandomizedMac,
  macIdentityNote,
  isIpv4,
  dedupeByMac,
  resolveClient,
  summariseCandidate,
} from './clientResolver.js';

/**
 * Rows shaped like real MuTable output. The empty Hostname/Username strings are
 * not laziness — that is what the lab Gateway actually returns for most clients
 * on a PSK network, and resolution has to work anyway.
 */
const ROWS = [
  {
    MAC: '58:9A:3E:E8:1D:95',
    IP: '192.168.100.122',
    Hostname: '',
    Username: '',
    Manufacturer: 'Amazon Technologies Inc.',
    OsName: 'Amazon Kindle',
    OsClassName: 'Amazon Kindle',
    SSID: 'Skynet',
    ApName: 'AP5020-PVT-01',
    ApSerial: 'CV012408S-C0102',
    RadioID: 1,
    SiteName: 'PrimarySite',
    RoleName: 'Enterprise User',
    Rss: -48,
    SNR: 50,
    RFQI: 4,
    LastUpdate: 1789043162,
  },
  {
    MAC: 'A6:E1:F9:FB:E3:05', // locally-administered -> randomized
    IP: '192.168.100.140',
    Hostname: 'iPhone',
    Username: '',
    Manufacturer: 'Apple',
    OsName: 'iOS',
    SSID: 'Skynet',
    ApName: 'AP4020-PVT-05_MESH_RELAY',
    ApSerial: 'WF022448S-C0023',
    RadioID: 1,
    SiteName: 'PrimarySite',
    Rss: -86,
    SNR: 10,
    RFQI: 1,
    LastUpdate: 1789043100,
  },
  {
    MAC: 'FA:17:A6:56:F2:0E', // also randomized, also an iPhone -> ambiguity
    IP: '192.168.100.141',
    Hostname: 'iPhone',
    Username: '',
    Manufacturer: 'Apple',
    OsName: 'iOS',
    SSID: 'AURA_PSAE',
    ApName: 'AP5020-PVT-02',
    ApSerial: 'CV012408S-C0044',
    RadioID: 2,
    SiteName: 'AURA_LAB',
    Rss: -71,
    SNR: 29,
    RFQI: 2,
    LastUpdate: 1789043150,
  },
];

describe('MAC normalisation', () => {
  it('accepts the shapes operators actually type', () => {
    for (const input of [
      '58:9a:3e:e8:1d:95',
      '58-9A-3E-E8-1D-95',
      '589a3ee81d95',
      '58.9a.3e.e8.1d.95',
    ]) {
      expect(normaliseMac(input)).toBe('58:9A:3E:E8:1D:95');
    }
  });

  it('rejects anything that is not 12 hex digits', () => {
    expect(normaliseMac('58:9A:3E')).toBeNull();
    expect(normaliseMac('hello')).toBeNull();
    expect(normaliseMac(null)).toBeNull();
  });
});

describe('randomized MAC detection', () => {
  it('flags locally-administered addresses', () => {
    // Second hex digit 2/6/A/E => the locally-administered bit is set.
    for (const mac of ['A6:E1:F9:FB:E3:05', 'FA:17:A6:56:F2:0E', 'D6:18:EB:BA:08:CE', '82:57:D8:5D:6E:7A']) {
      expect(isRandomizedMac(mac)).toBe(true);
    }
  });

  it('does not flag real OUI addresses', () => {
    for (const mac of ['58:9A:3E:E8:1D:95', '44:61:32:26:AB:9C', '3C:06:30:36:E2:57', 'D0:57:7E:C4:49:1A']) {
      expect(isRandomizedMac(mac)).toBe(false);
    }
  });

  it('caveats identity for a randomized address and stays quiet for a real one', () => {
    expect(macIdentityNote('A6:E1:F9:FB:E3:05')).toMatch(/identifies this session rather than the device/);
    expect(macIdentityNote('58:9A:3E:E8:1D:95')).toBeNull();
  });

  it('never requires randomization to be disabled to function', () => {
    // The resolver must still resolve a randomized client completely.
    const res = resolveClient('FA:17:A6:56:F2:0E', ROWS);
    expect(res.status).toBe('resolved');
    expect(res.client.randomizedMac).toBe(true);
    expect(res.identityNote).toBeTruthy();
  });
});

describe('dedupe', () => {
  it('collapses samples to one row per MAC, keeping the newest', () => {
    const rows = [
      { MAC: 'AA:BB:CC:DD:EE:FF', LastUpdate: 100, Rss: -70 },
      { MAC: 'aa:bb:cc:dd:ee:ff', LastUpdate: 200, Rss: -60 },
    ];
    const out = dedupeByMac(rows);
    expect(out).toHaveLength(1);
    expect(out[0].Rss).toBe(-60);
  });

  it('ignores rows with no MAC', () => {
    expect(dedupeByMac([{ Rss: -50 }])).toHaveLength(0);
  });
});

describe('resolution', () => {
  it('resolves an exact MAC', () => {
    const res = resolveClient('58:9A:3E:E8:1D:95', ROWS);
    expect(res.status).toBe('resolved');
    expect(res.matchedOn).toBe('exact MAC');
    expect(res.client.ssid).toBe('Skynet');
  });

  it('resolves a partial MAC — operators quote the last four digits', () => {
    const res = resolveClient('1D:95', ROWS);
    expect(res.status).toBe('resolved');
    expect(res.matchedOn).toMatch(/partial MAC/);
    expect(res.client.mac).toBe('58:9A:3E:E8:1D:95');
  });

  it('resolves by IP', () => {
    const res = resolveClient('192.168.100.122', ROWS);
    expect(res.status).toBe('resolved');
    expect(res.matchedOn).toBe('IP address');
  });

  it('resolves by device description when no hostname is published', () => {
    const res = resolveClient('kindle', ROWS);
    expect(res.status).toBe('resolved');
    expect(res.matchedOn).toBe('device manufacturer/OS');
  });

  it('presents candidates rather than guessing when several match', () => {
    // Two iPhones. Picking one produces a confident diagnosis of the wrong
    // device, which is worse than one extra question.
    const res = resolveClient('iPhone', ROWS);
    expect(res.status).toBe('ambiguous');
    expect(res.totalMatches).toBe(2);
    expect(res.candidates).toHaveLength(2);
    expect(res.candidates.every((c) => c.mac)).toBe(true);
  });

  it('says not_found for an unknown client instead of inventing one', () => {
    const res = resolveClient('11:22:33:44:55:66', ROWS);
    expect(res.status).toBe('not_found');
    expect(res.client).toBeUndefined();
    expect(res.note).toMatch(/does not appear|No client with that MAC/i);
  });

  it('explains that a missing randomized MAC may simply have rotated', () => {
    const res = resolveClient('AE:11:22:33:44:55', ROWS);
    expect(res.status).toBe('not_found');
    expect(res.identityNote).toMatch(/randomized/);
  });

  it('does not fall back to a name match when a full MAC is given', () => {
    // A MAC is unambiguous; degrading to a fuzzy name match would be worse.
    const res = resolveClient('00:00:00:00:00:01', ROWS);
    expect(res.status).toBe('not_found');
    expect(res.matchedOn).toBe('exact MAC');
  });

  it('returns not_found for an empty query rather than the first client', () => {
    expect(resolveClient('', ROWS).status).toBe('not_found');
    expect(resolveClient(null, ROWS).status).toBe('not_found');
  });
});

describe('UI scope narrowing', () => {
  it('disambiguates two iPhones using the selected site', () => {
    const res = resolveClient('iPhone', ROWS, { siteName: 'AURA_LAB' });
    expect(res.status).toBe('resolved');
    expect(res.client.mac).toBe('FA:17:A6:56:F2:0E');
    expect(res.scopeApplied.siteName).toBe('AURA_LAB');
  });

  it('disambiguates using the selected WLAN', () => {
    const res = resolveClient('iPhone', ROWS, { ssid: 'AURA_PSAE' });
    expect(res.status).toBe('resolved');
    expect(res.client.ssid).toBe('AURA_PSAE');
  });

  it('ignores a scope that would eliminate every candidate', () => {
    // Over-narrowing to nothing is worse than answering in a wider scope and
    // saying so, so an empty narrowing is dropped rather than applied.
    const res = resolveClient('iPhone', ROWS, { siteName: 'NoSuchSite' });
    expect(res.status).toBe('ambiguous');
    expect(res.scopeApplied.siteName).toBeUndefined();
  });
});

describe('candidate summary', () => {
  it('suppresses placeholder signal values', () => {
    const s = summariseCandidate({ MAC: 'AA:BB:CC:DD:EE:FF', Rss: 0, SNR: -10000, RFQI: 3 });
    expect(s.rss).toBeNull();
    expect(s.snr).toBeNull();
    expect(s.rfqi).toBe(3);
  });
});

describe('helpers', () => {
  it('recognises IPv4', () => {
    expect(isIpv4('192.168.1.1')).toBe(true);
    expect(isIpv4('not.an.ip.addr')).toBe(false);
  });
});
