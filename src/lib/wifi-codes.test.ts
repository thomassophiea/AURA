import { describe, it, expect } from 'vitest';
import {
  REASON_CODES,
  STATUS_CODES,
  getReasonCodeInfo,
  getStatusCodeInfo,
  isFailureReasonCode,
  isFailureStatusCode,
  ROAMING_ISSUES,
  ISSUE_DESCRIPTIONS,
} from './wifi-codes';

describe('REASON_CODES table', () => {
  it('has the documented standard 802.11 reason codes 0-37', () => {
    for (let i = 0; i <= 37; i++) {
      expect(REASON_CODES).toHaveProperty(String(i));
      expect(REASON_CODES[i].short).toBeTruthy();
      expect(REASON_CODES[i].description).toBeTruthy();
      expect(['info', 'warning', 'error']).toContain(REASON_CODES[i].severity);
    }
  });
});

describe('STATUS_CODES table', () => {
  it('has the success entry at code 0 with severity=success', () => {
    expect(STATUS_CODES[0].severity).toBe('success');
  });
});

describe('getReasonCodeInfo', () => {
  it('returns null for null / undefined', () => {
    expect(getReasonCodeInfo(undefined)).toBeNull();
    expect(getReasonCodeInfo(null)).toBeNull();
  });

  it('returns the table entry for a known code', () => {
    expect(getReasonCodeInfo(2)?.short).toBe('Auth Invalid');
    expect(getReasonCodeInfo(15)?.severity).toBe('error');
  });

  it('returns a synthesized "Code N / Unknown" entry for an unknown code', () => {
    const out = getReasonCodeInfo(9999);
    expect(out?.short).toBe('Code 9999');
    expect(out?.description).toContain('9999');
    expect(out?.severity).toBe('warning');
  });
});

describe('getStatusCodeInfo', () => {
  it('returns null for null / undefined', () => {
    expect(getStatusCodeInfo(undefined)).toBeNull();
    expect(getStatusCodeInfo(null)).toBeNull();
  });

  it('returns the table entry for code 0 (success)', () => {
    expect(getStatusCodeInfo(0)?.severity).toBe('success');
  });

  it('synthesizes for unknown codes', () => {
    expect(getStatusCodeInfo(8888)?.short).toBe('Code 8888');
  });
});

describe('isFailureReasonCode', () => {
  it('returns false for null / undefined / unknown', () => {
    expect(isFailureReasonCode(null)).toBe(false);
    expect(isFailureReasonCode(undefined)).toBe(false);
    expect(isFailureReasonCode(99_999)).toBe(false);
  });

  it('returns true for codes whose severity is "error"', () => {
    // Pick a few we asserted above as severity=error
    expect(isFailureReasonCode(15)).toBe(true); // 4-Way Timeout
    expect(isFailureReasonCode(14)).toBe(true); // MIC Failure
  });

  it('returns false for non-error severities', () => {
    expect(isFailureReasonCode(3)).toBe(false); // Leaving BSS — info
  });
});

describe('isFailureStatusCode', () => {
  it('returns false for null / undefined and for code 0 (success)', () => {
    expect(isFailureStatusCode(null)).toBe(false);
    expect(isFailureStatusCode(undefined)).toBe(false);
    expect(isFailureStatusCode(0)).toBe(false);
  });

  it('returns true for any non-zero code (per the implementation comment)', () => {
    expect(isFailureStatusCode(1)).toBe(true);
    expect(isFailureStatusCode(99)).toBe(true);
  });
});

describe('ROAMING_ISSUES + ISSUE_DESCRIPTIONS', () => {
  it('every ROAMING_ISSUES enum value has a matching ISSUE_DESCRIPTIONS entry', () => {
    for (const value of Object.values(ROAMING_ISSUES)) {
      expect(ISSUE_DESCRIPTIONS[value as keyof typeof ISSUE_DESCRIPTIONS]).toBeDefined();
      expect(ISSUE_DESCRIPTIONS[value as keyof typeof ISSUE_DESCRIPTIONS].title).toBeTruthy();
    }
  });
});
