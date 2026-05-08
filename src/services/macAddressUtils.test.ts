import { describe, it, expect } from 'vitest';
import {
  isRandomizedMac,
  isLocallyAdministered,
  getMacAddressInfo,
  formatMacAddress,
} from './macAddressUtils';

describe('isRandomizedMac', () => {
  it('returns true for second-octet 2/6/A/E (locally administered indicator chars)', () => {
    expect(isRandomizedMac('82:e4:22:47:f0:8f')).toBe(true);
    expect(isRandomizedMac('5e:9b:a8:8a:55:a6')).toBe(true);
    expect(isRandomizedMac('AA:bb:cc:dd:ee:ff')).toBe(true);
    expect(isRandomizedMac('66:11:22:33:44:55')).toBe(true);
  });

  it('is case-insensitive on the indicator char', () => {
    expect(isRandomizedMac('aa-bb-cc-dd-ee-ff')).toBe(true);
    expect(isRandomizedMac('Aa:Bb:Cc:Dd:Ee:Ff')).toBe(true);
  });

  it('accepts both colon and dash separators', () => {
    expect(isRandomizedMac('82-e4-22-47-f0-8f')).toBe(true);
    expect(isRandomizedMac('82e422-47f08f')).toBe(true);
  });

  it('returns false for globally-unique manufacturer MACs', () => {
    expect(isRandomizedMac('00:11:22:33:44:55')).toBe(false);
    expect(isRandomizedMac('a4:b1:c1:d1:e1:f1')).toBe(false);
    expect(isRandomizedMac('FF:FF:FF:FF:FF:FF')).toBe(false);
  });

  it('returns false for invalid / empty inputs', () => {
    expect(isRandomizedMac(null)).toBe(false);
    expect(isRandomizedMac(undefined)).toBe(false);
    expect(isRandomizedMac('')).toBe(false);
    expect(isRandomizedMac('z')).toBe(false);
  });
});

describe('isLocallyAdministered', () => {
  it('returns true when bit 1 of first octet is set', () => {
    // 0x02 = 00000010 — bit 1 set
    expect(isLocallyAdministered('02:00:00:00:00:00')).toBe(true);
    // 0x82 = 10000010 — bit 1 set
    expect(isLocallyAdministered('82:e4:22:47:f0:8f')).toBe(true);
    // 0xAA = 10101010 — bit 1 set
    expect(isLocallyAdministered('AA:BB:CC:DD:EE:FF')).toBe(true);
  });

  it('returns false when bit 1 is clear', () => {
    // 0x00, 0x01, 0x04, 0x08 — bit 1 clear
    expect(isLocallyAdministered('00:11:22:33:44:55')).toBe(false);
    expect(isLocallyAdministered('04:00:00:00:00:00')).toBe(false);
    expect(isLocallyAdministered('a4:b1:c1:d1:e1:f1')).toBe(false);
  });

  it('returns false for empty / invalid inputs', () => {
    expect(isLocallyAdministered(null)).toBe(false);
    expect(isLocallyAdministered(undefined)).toBe(false);
    expect(isLocallyAdministered('')).toBe(false);
    expect(isLocallyAdministered('a')).toBe(false);
  });
});

describe('getMacAddressInfo', () => {
  it('flags a randomized MAC with appropriate explanation', () => {
    const info = getMacAddressInfo('82:e4:22:47:f0:8f');
    expect(info.isRandomized).toBe(true);
    expect(info.isLocallyAdministered).toBe(true);
    expect(info.isMulticast).toBe(false);
    expect(info.explanation).toMatch(/randomized/i);
    expect(info.formatted).toBe('82:e4:22:47:f0:8f');
  });

  it('flags a globally unique MAC', () => {
    const info = getMacAddressInfo('00:11:22:33:44:55');
    expect(info.isRandomized).toBe(false);
    expect(info.isLocallyAdministered).toBe(false);
    expect(info.isMulticast).toBe(false);
    expect(info.explanation).toMatch(/globally unique/i);
  });

  it('detects multicast (bit 0 of first octet set) and appends to explanation', () => {
    // 0x01 = bit 0 set, bit 1 clear → multicast + globally unique
    const info = getMacAddressInfo('01:00:5e:00:00:01');
    expect(info.isMulticast).toBe(true);
    expect(info.isLocallyAdministered).toBe(false);
    expect(info.explanation).toMatch(/multicast/i);
  });

  it('handles randomized + multicast in the same address', () => {
    // 0x83 = 10000011 → both bit 0 and bit 1 set
    const info = getMacAddressInfo('83:00:00:00:00:00');
    expect(info.isLocallyAdministered).toBe(true);
    expect(info.isMulticast).toBe(true);
  });

  it('returns the empty / invalid sentinel for missing input', () => {
    const empty = getMacAddressInfo(undefined);
    expect(empty.isRandomized).toBe(false);
    expect(empty.isLocallyAdministered).toBe(false);
    expect(empty.formatted).toBe('');
    expect(empty.explanation).toMatch(/invalid/i);

    const tooShort = getMacAddressInfo('a');
    expect(tooShort.explanation).toMatch(/invalid/i);
  });
});

describe('formatMacAddress', () => {
  it('default separator is colon', () => {
    expect(formatMacAddress('001122334455')).toBe('00:11:22:33:44:55');
    expect(formatMacAddress('00-11-22-33-44-55')).toBe('00:11:22:33:44:55');
  });

  it('custom separator is honored', () => {
    expect(formatMacAddress('001122334455', '-')).toBe('00-11-22-33-44-55');
    expect(formatMacAddress('001122334455', '.')).toBe('00.11.22.33.44.55');
  });

  it('returns empty string for null / undefined', () => {
    expect(formatMacAddress(null)).toBe('');
    expect(formatMacAddress(undefined)).toBe('');
  });

  it('returns the original input unchanged when length is wrong', () => {
    expect(formatMacAddress('00:11:22')).toBe('00:11:22'); // too short
    expect(formatMacAddress('001122334455667788')).toBe('001122334455667788'); // too long
  });

  it('preserves case of input characters', () => {
    expect(formatMacAddress('AABBCCDDEEFF')).toBe('AA:BB:CC:DD:EE:FF');
    expect(formatMacAddress('aabbccddeeff')).toBe('aa:bb:cc:dd:ee:ff');
  });
});
