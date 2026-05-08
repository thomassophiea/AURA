import { describe, it, expect } from 'vitest';
import { lookupVendor, identifyClient, suggestDeviceType, OUI_DATABASE } from './ouiLookup';

describe('OUI_DATABASE', () => {
  it('contains entries with vendor and oui fields', () => {
    expect(OUI_DATABASE.length).toBeGreaterThan(0);
    for (const entry of OUI_DATABASE.slice(0, 10)) {
      expect(entry.oui).toMatch(/^[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}$/);
      expect(entry.vendor).toBeTruthy();
    }
  });
});

describe('lookupVendor', () => {
  it('returns the vendor for a known Apple OUI', () => {
    const apple = OUI_DATABASE.find((e) => e.vendor === 'Apple');
    if (!apple) throw new Error('Apple entry expected in OUI_DATABASE');
    expect(lookupVendor(`${apple.oui}:11:22:33`)).toBe('Apple');
  });

  it('is case-insensitive on the input MAC', () => {
    const apple = OUI_DATABASE.find((e) => e.vendor === 'Apple');
    if (!apple) throw new Error('Apple entry expected');
    expect(lookupVendor(apple.oui.toLowerCase() + ':11:22:33')).toBe('Apple');
  });

  it('accepts dash-separated MACs', () => {
    const apple = OUI_DATABASE.find((e) => e.vendor === 'Apple');
    if (!apple) throw new Error('Apple entry expected');
    expect(lookupVendor(apple.oui.replace(/:/g, '-') + '-11-22-33')).toBe('Apple');
  });

  it('returns null for an unknown OUI', () => {
    expect(lookupVendor('FE:DC:BA:11:22:33')).toBeNull();
  });

  it('returns null for empty / invalid input', () => {
    expect(lookupVendor('')).toBeNull();
    expect(lookupVendor('xx')).toBeNull();
  });
});

describe('identifyClient', () => {
  it('prefers a real hostname over OUI lookup', () => {
    expect(identifyClient('00:00:00:00:00:00', 'sams-iphone')).toBe('sams-iphone');
  });

  it('ignores hostname "unknown" / "" and falls through', () => {
    const apple = OUI_DATABASE.find((e) => e.vendor === 'Apple');
    if (!apple) throw new Error('Apple entry expected');
    expect(identifyClient(apple.oui + ':11:22:33', 'unknown')).toBe('Apple');
    expect(identifyClient(apple.oui + ':11:22:33', '')).toBe('Apple');
  });

  it('returns OUI vendor when no hostname', () => {
    const apple = OUI_DATABASE.find((e) => e.vendor === 'Apple');
    if (!apple) throw new Error('Apple entry expected');
    expect(identifyClient(apple.oui + ':11:22:33')).toBe('Apple');
  });

  it('falls through to manufacturer arg when OUI not in DB', () => {
    expect(identifyClient('FE:DC:BA:11:22:33', undefined, 'CustomBrand')).toBe('CustomBrand');
  });

  it('returns "Private Device" for a randomized (locally-administered) MAC', () => {
    // 0x82 = bit 1 set → locally administered
    expect(identifyClient('82:e4:22:47:f0:8f')).toBe('Private Device');
  });

  it('returns empty string when nothing identifies the client', () => {
    // 0x00 has bit 1 cleared → not locally administered → falls all the way through.
    // Use an OUI not in the database (00:00:01) to avoid lookupVendor success.
    expect(identifyClient('00:00:01:11:22:33', undefined, 'unknown')).toBe('');
  });
});

describe('suggestDeviceType', () => {
  it('returns "iOS Device" for Apple', () => {
    expect(suggestDeviceType('Apple, Inc.')).toBe('iOS Device');
  });

  it('returns "Android Device" for Samsung and Google', () => {
    expect(suggestDeviceType('Samsung Electronics')).toBe('Android Device');
    expect(suggestDeviceType('Google LLC')).toBe('Android Device');
  });

  it('returns "Windows Device" for Microsoft', () => {
    expect(suggestDeviceType('Microsoft Corporation')).toBe('Windows Device');
  });

  it('returns "Computer" for Intel', () => {
    expect(suggestDeviceType('Intel Corporate')).toBe('Computer');
  });

  it('returns "Network Equipment" for Cisco / TP-Link / Broadcom', () => {
    expect(suggestDeviceType('Cisco Systems')).toBe('Network Equipment');
    expect(suggestDeviceType('TP-Link')).toBe('Network Equipment');
    expect(suggestDeviceType('Broadcom Corp')).toBe('Network Equipment');
  });

  it('returns "Mobile Device" for Xiaomi / Huawei / Nokia', () => {
    expect(suggestDeviceType('Xiaomi Communications')).toBe('Mobile Device');
    expect(suggestDeviceType('Huawei Technologies')).toBe('Mobile Device');
    expect(suggestDeviceType('Nokia Corporation')).toBe('Mobile Device');
  });

  it('returns empty string for unknown vendors', () => {
    expect(suggestDeviceType('UnknownMaker AB')).toBe('');
    expect(suggestDeviceType('')).toBe('');
  });
});
