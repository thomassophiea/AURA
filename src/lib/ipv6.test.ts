import { describe, expect, it } from 'vitest';

import { ipv6List, primaryIpv6 } from './ipv6';

// The live controller shape this module exists for (station A6:E1:F9:FB:E3:05):
const CONTROLLER_ARRAY = [
  'fe80::8b:f413:bae7:13a1',
  '2603:9001:2000:3706:894:3921:6f5f:5e8d',
  '2603:9001:2000:3706:9173:a82b:549e:eb4b',
];

describe('ipv6List', () => {
  it('passes a controller array through', () => {
    expect(ipv6List(CONTROLLER_ARRAY)).toEqual(CONTROLLER_ARRAY);
  });

  it('wraps a legacy string value', () => {
    expect(ipv6List('2001:db8::1')).toEqual(['2001:db8::1']);
  });

  it('drops empty and non-string entries', () => {
    expect(ipv6List(['', '2001:db8::1', null, 42, '  '])).toEqual(['2001:db8::1']);
  });

  it('is empty for the empty array most stations report', () => {
    expect(ipv6List([])).toEqual([]);
  });

  it('is empty for null, undefined and blank strings', () => {
    expect(ipv6List(null)).toEqual([]);
    expect(ipv6List(undefined)).toEqual([]);
    expect(ipv6List('')).toEqual([]);
  });
});

describe('primaryIpv6', () => {
  it('prefers the first global address over link-local', () => {
    expect(primaryIpv6(CONTROLLER_ARRAY)).toBe('2603:9001:2000:3706:894:3921:6f5f:5e8d');
  });

  it('falls back to link-local when that is all there is', () => {
    expect(primaryIpv6(['fe80::1'])).toBe('fe80::1');
  });

  it('is null when the station has no IPv6', () => {
    expect(primaryIpv6([])).toBeNull();
    expect(primaryIpv6(undefined)).toBeNull();
  });

  it('handles a plain string value', () => {
    expect(primaryIpv6('2001:db8::1')).toBe('2001:db8::1');
  });
});
