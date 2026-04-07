import { describe, it, expect } from 'vitest';
import { validateEnterpriseAuthRequirements, isEnterpriseAuth } from './wlanAuthValidation';

describe('isEnterpriseAuth', () => {
  it('returns false for open', () => expect(isEnterpriseAuth('open')).toBe(false));
  it('returns false for wpa2Personal', () => expect(isEnterpriseAuth('wpa2Personal')).toBe(false));
  it('returns true for wpa2Enterprise', () => expect(isEnterpriseAuth('wpa2Enterprise')).toBe(true));
  it('returns true for wpa3Enterprise', () => expect(isEnterpriseAuth('wpa3Enterprise')).toBe(true));
  it('returns true for dot1x', () => expect(isEnterpriseAuth('dot1x')).toBe(true));
  it('returns true for ENTERPRISE (API value)', () => expect(isEnterpriseAuth('ENTERPRISE')).toBe(true));
  it('returns true for wpa2-enterprise (UI hyphenated value)', () => expect(isEnterpriseAuth('wpa2-enterprise')).toBe(true));
});

describe('validateEnterpriseAuthRequirements', () => {
  it('returns null for open without AAA', () => {
    expect(validateEnterpriseAuthRequirements('open', '')).toBeNull();
  });
  it('returns null for WPA2-personal without AAA', () => {
    expect(validateEnterpriseAuthRequirements('wpa2Personal', '')).toBeNull();
  });
  it('returns error for WPA2-enterprise without AAA', () => {
    expect(validateEnterpriseAuthRequirements('wpa2Enterprise', '')).toBe(
      'AAA policy is required for enterprise authentication modes'
    );
  });
  it('returns null for WPA2-enterprise with AAA selected', () => {
    expect(validateEnterpriseAuthRequirements('wpa2Enterprise', 'policy-123')).toBeNull();
  });
  it('returns error for dot1x without AAA', () => {
    expect(validateEnterpriseAuthRequirements('dot1x', '')).toBe(
      'AAA policy is required for enterprise authentication modes'
    );
  });
});
