import { describe, it, expect } from 'vitest';
import { redactSecrets, isSecretName, REDACTED } from './redact.js';

describe('redactSecrets', () => {
  it('redacts the secret fields the live Gateway returns, at any depth', () => {
    const out = redactSecrets({
      privacy: { WpaPskElement: { presharedKey: 'p', keyHexEncoded: false } },
      authenticationRadiusServers: [{ sharedSecret: 's', ip: '10.0.0.1' }],
      cpSharedKey: 'k',
      faAuthKey: 'f',
      cbPassword: 'c',
      peapPassword: { selection: 'custom', custom: 'x' },
      snmpConfig: { v2Communities: { ro: 'public' }, v3Users: [{ name: 'u', authPassword: 'a' }] },
      key: 'appkey',
    });
    expect(out.privacy.WpaPskElement).toEqual({ presharedKey: REDACTED, keyHexEncoded: false });
    expect(out.authenticationRadiusServers[0]).toEqual({ sharedSecret: REDACTED, ip: '10.0.0.1' });
    expect(out.cpSharedKey).toBe(REDACTED);
    expect(out.faAuthKey).toBe(REDACTED);
    expect(out.cbPassword).toBe(REDACTED);
    expect(out.peapPassword).toBe(REDACTED);
    expect(out.snmpConfig.v2Communities).toBe(REDACTED);
    expect(out.snmpConfig.v3Users).toBe(REDACTED);
    expect(out.key).toBe(REDACTED);
  });

  it('keeps descriptive fields, nulls and non-secret names', () => {
    const input = {
      keySize: 2048,
      passwordExpiry: null,
      token_type: 'bearer',
      authenticationType: 'PAP',
      ssid: 'Skynet',
      keyHexEncoded: true,
    };
    expect(redactSecrets(input)).toEqual(input);
    expect(isSecretName('authenticationType')).toBe(false);
  });

  it('does not mutate its input', () => {
    const input = { presharedKey: 'p' };
    redactSecrets(input);
    expect(input.presharedKey).toBe('p');
  });
});
