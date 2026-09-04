import { describe, it, expect } from 'vitest';
import { computePlanHash, signValidationToken, verifyValidationToken } from './validationToken.js';

describe('computePlanHash', () => {
  it('is stable for identical input', () => {
    const plan = { action: 'create_wlan', wlanName: 'Guest', vlanId: 40 };
    expect(computePlanHash(plan)).toBe(computePlanHash({ ...plan }));
  });

  it('changes when any field changes', () => {
    const a = computePlanHash({ action: 'create_wlan', wlanName: 'Guest', vlanId: 40 });
    const b = computePlanHash({ action: 'create_wlan', wlanName: 'Guest', vlanId: 41 });
    expect(a).not.toBe(b);
  });
});

describe('signValidationToken / verifyValidationToken', () => {
  it('round-trips a valid token', () => {
    const hash = computePlanHash({ a: 1 });
    const { token, expiresAt } = signValidationToken(hash);
    expect(typeof token).toBe('string');
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const verified = verifyValidationToken(token);
    expect(verified).not.toBeNull();
    expect(verified.planHash).toBe(hash);
  });

  it('rejects a tampered signature', () => {
    const { token } = signValidationToken(computePlanHash({ a: 1 }));
    const [body] = token.split('.');
    const tampered = `${body}.deadbeef`;
    expect(verifyValidationToken(tampered)).toBeNull();
  });

  it('rejects a tampered body (plan hash swapped after signing)', () => {
    const { token } = signValidationToken(computePlanHash({ a: 1 }));
    const [, signature] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ planHash: 'evil', expiresAt: Date.now() + 100000 })).toString(
      'base64url'
    );
    expect(verifyValidationToken(`${forgedBody}.${signature}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const { token } = signValidationToken(computePlanHash({ a: 1 }), -1000);
    expect(verifyValidationToken(token)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyValidationToken(null)).toBeNull();
    expect(verifyValidationToken('')).toBeNull();
    expect(verifyValidationToken('no-dot-here')).toBeNull();
  });
});
