/**
 * Application-level encryption for PPSK passphrases.
 *
 * The wpa_psk_file path needs the plaintext passphrase back (the AP derives the
 * PMK), so we cannot one-way hash it — it must be recoverable. That makes the
 * encryption key the whole security boundary: a leaked database without the key
 * yields nothing usable.
 *
 * AES-256-GCM, random 12-byte IV per record, 16-byte auth tag. The stored form
 * is `v1:<base64(iv|tag|ciphertext)>`. The key comes from PPSK_ENCRYPTION_KEY
 * (any non-empty string; folded to 32 bytes with SHA-256 so operators may use a
 * passphrase, but its real entropy is what matters — use a 32-byte random hex).
 *
 * When PPSK_ENCRYPTION_KEY is unset the module is NOT configured: the router
 * refuses to create or reveal keys (501 NOT_CONFIGURED) rather than storing a
 * secret it cannot protect. Metadata-only operations still work.
 */

import crypto from 'crypto';

const VERSION = 'v1';

/** True when a passphrase-encryption key is available in this process. */
export function isCryptoConfigured() {
  return Boolean(process.env.PPSK_ENCRYPTION_KEY);
}

function key() {
  const raw = process.env.PPSK_ENCRYPTION_KEY;
  if (!raw) throw new Error('PPSK_ENCRYPTION_KEY is not set');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/** Encrypt a plaintext passphrase to the stored `v1:...` form. */
export function encryptPassphrase(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString('base64')}`;
}

/** Decrypt a stored `v1:...` value back to the plaintext passphrase. */
export function decryptPassphrase(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(`${VERSION}:`)) {
    throw new Error('unrecognized ciphertext format');
  }
  const buf = Buffer.from(stored.slice(VERSION.length + 1), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
