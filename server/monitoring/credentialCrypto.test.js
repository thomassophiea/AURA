import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

import {
  encryptSecret,
  decryptSecret,
  parseCredentialKey,
  pseudonymize,
} from './credentialCrypto.js';

const KEY = crypto.randomBytes(32).toString('base64');
const OTHER_KEY = crypto.randomBytes(32).toString('base64');

describe('parseCredentialKey', () => {
  it('accepts a 32-byte base64 key', () => {
    expect(parseCredentialKey(KEY)).toHaveLength(32);
  });

  it('accepts a 64-character hex key', () => {
    expect(parseCredentialKey(crypto.randomBytes(32).toString('hex'))).toHaveLength(32);
  });

  it('rejects a missing key with actionable guidance', () => {
    expect(() => parseCredentialKey(undefined)).toThrow(/openssl rand/);
  });

  it('rejects a short key instead of padding it', () => {
    expect(() => parseCredentialKey(Buffer.from('too-short').toString('base64'))).toThrow(
      /32 bytes/
    );
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const envelope = encryptSecret('hunter2', KEY);
    expect(decryptSecret(envelope, KEY)).toBe('hunter2');
  });

  it('never stores the plaintext in the ciphertext', () => {
    const envelope = encryptSecret('hunter2', KEY);
    expect(envelope.ciphertext.toString('utf8')).not.toContain('hunter2');
    expect(envelope.ciphertext.toString('base64')).not.toContain('hunter2');
  });

  it('uses a fresh nonce per encryption so identical secrets differ on disk', () => {
    const a = encryptSecret('same', KEY);
    const b = encryptSecret('same', KEY);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('fails to decrypt with the wrong key rather than returning garbage', () => {
    const envelope = encryptSecret('hunter2', KEY);
    expect(() => decryptSecret(envelope, OTHER_KEY)).toThrow();
  });

  it('detects tampered ciphertext', () => {
    const envelope = encryptSecret('hunter2', KEY);
    envelope.ciphertext[0] ^= 0xff;
    expect(() => decryptSecret(envelope, KEY)).toThrow();
  });

  it('detects a tampered auth tag', () => {
    const envelope = encryptSecret('hunter2', KEY);
    envelope.authTag[0] ^= 0xff;
    expect(() => decryptSecret(envelope, KEY)).toThrow();
  });

  it('refuses to encrypt an empty secret', () => {
    expect(() => encryptSecret('', KEY)).toThrow(/empty/);
  });

  it('rejects an incomplete envelope', () => {
    expect(() => decryptSecret({ ciphertext: Buffer.from('x') }, KEY)).toThrow(/Incomplete/);
    expect(() => decryptSecret(null, KEY)).toThrow(/Incomplete/);
  });
});

describe('pseudonymize', () => {
  it('produces a stable pseudonym for the same MAC in any formatting', () => {
    const a = pseudonymize('AA:BB:CC:11:22:33', 'salt');
    const b = pseudonymize('aabb.cc11.2233', 'salt');
    expect(a).toBe(b);
  });

  it('produces different pseudonyms under different salts', () => {
    expect(pseudonymize('AA:BB:CC:11:22:33', 'salt-a')).not.toBe(
      pseudonymize('AA:BB:CC:11:22:33', 'salt-b')
    );
  });

  it('does not leak the original identifier', () => {
    const result = pseudonymize('AA:BB:CC:11:22:33', 'salt');
    expect(result).not.toContain('aabb');
    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });

  it('requires a salt', () => {
    expect(() => pseudonymize('AA:BB:CC:11:22:33', '')).toThrow(/salt/);
  });

  it('returns null for an absent identifier', () => {
    expect(pseudonymize(null, 'salt')).toBeNull();
  });
});
