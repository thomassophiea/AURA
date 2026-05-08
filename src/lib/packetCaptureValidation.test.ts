import { describe, it, expect } from 'vitest';
import {
  validateMacAddress,
  formatMacAddress,
  validateIPv4Address,
  validateIPv6Address,
  validateIPAddress,
  validateCaptureDuration,
  validateTruncationSize,
} from './packetCaptureValidation';

describe('validateMacAddress', () => {
  it('rejects empty / non-string input', () => {
    expect(validateMacAddress('').valid).toBe(false);
    expect(validateMacAddress(undefined as unknown as string).valid).toBe(false);
  });

  it('accepts colon-separated, dash-separated, and unseparated forms', () => {
    expect(validateMacAddress('AA:BB:CC:DD:EE:FF').valid).toBe(true);
    expect(validateMacAddress('AA-BB-CC-DD-EE-FF').valid).toBe(true);
    expect(validateMacAddress('AABBCCDDEEFF').valid).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(validateMacAddress('aa:bb:cc:dd:ee:ff').valid).toBe(true);
  });

  it('rejects wrong-length MACs', () => {
    expect(validateMacAddress('AA:BB:CC').valid).toBe(false);
    expect(validateMacAddress('AABBCCDDEEFF11').valid).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(validateMacAddress('GG:BB:CC:DD:EE:FF').valid).toBe(false);
  });
});

describe('formatMacAddress', () => {
  it('normalizes and inserts colons', () => {
    expect(formatMacAddress('aabbccddeeff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(formatMacAddress('aa-bb-cc-dd-ee-ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(formatMacAddress('AA:BB:CC:DD:EE:FF')).toBe('AA:BB:CC:DD:EE:FF');
  });
});

describe('validateIPv4Address', () => {
  it('accepts valid dotted-quad IPv4', () => {
    expect(validateIPv4Address('10.0.0.1').valid).toBe(true);
    expect(validateIPv4Address('255.255.255.255').valid).toBe(true);
    expect(validateIPv4Address('0.0.0.0').valid).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(validateIPv4Address('').valid).toBe(false);
    expect(validateIPv4Address('not-an-ip').valid).toBe(false);
    expect(validateIPv4Address('10.0.0').valid).toBe(false);
    expect(validateIPv4Address('10.0.0.1.2').valid).toBe(false);
  });

  it('rejects out-of-range octets', () => {
    expect(validateIPv4Address('256.0.0.0').valid).toBe(false);
    expect(validateIPv4Address('10.0.0.999').valid).toBe(false);
  });
});

describe('validateIPv6Address', () => {
  it('accepts a valid IPv6', () => {
    expect(validateIPv6Address('fe80::1').valid).toBe(true);
    expect(validateIPv6Address('2001:db8:85a3:0:0:8a2e:370:7334').valid).toBe(true);
  });

  it('rejects malformed IPv6', () => {
    expect(validateIPv6Address('').valid).toBe(false);
    expect(validateIPv6Address('not-ipv6').valid).toBe(false);
    expect(validateIPv6Address('2001:db8:85a3:0:0:8a2e:370:7334:9999:9999').valid).toBe(false);
  });
});

describe('validateIPAddress', () => {
  it('accepts both IPv4 and IPv6', () => {
    expect(validateIPAddress('10.0.0.1').valid).toBe(true);
    expect(validateIPAddress('fe80::1').valid).toBe(true);
  });

  it('rejects strings that are neither', () => {
    const r = validateIPAddress('made-up');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/IPv4 or IPv6/);
  });
});

describe('validateCaptureDuration', () => {
  it('rejects non-numeric or NaN', () => {
    expect(validateCaptureDuration(NaN).valid).toBe(false);
    expect(validateCaptureDuration('5' as unknown as number).valid).toBe(false);
  });

  it('rejects below 1', () => {
    expect(validateCaptureDuration(0).valid).toBe(false);
  });

  it('rejects above 60', () => {
    expect(validateCaptureDuration(120).valid).toBe(false);
  });

  it('accepts the boundaries 1 and 60', () => {
    expect(validateCaptureDuration(1).valid).toBe(true);
    expect(validateCaptureDuration(60).valid).toBe(true);
  });
});

describe('validateTruncationSize', () => {
  it('rejects non-numeric / NaN', () => {
    expect(validateTruncationSize(NaN).valid).toBe(false);
  });

  it('rejects negative size', () => {
    expect(validateTruncationSize(-1).valid).toBe(false);
  });

  it('rejects above 65535', () => {
    expect(validateTruncationSize(70_000).valid).toBe(false);
  });

  it('accepts 0 (no truncation)', () => {
    expect(validateTruncationSize(0).valid).toBe(true);
  });

  it('accepts 65535 (max)', () => {
    expect(validateTruncationSize(65535).valid).toBe(true);
  });

  it('warns (still valid) for small truncation sizes 1..63', () => {
    const r = validateTruncationSize(40);
    expect(r.valid).toBe(true);
    expect(r.error).toMatch(/Warning/);
  });

  it('does not warn at 64', () => {
    const r = validateTruncationSize(64);
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });
});
