/**
 * AES-256-GCM encryption for controller credentials at rest.
 *
 * The collector needs durable credentials to poll a controller while nobody is
 * logged in. The rest of AURA deliberately never persists passwords
 * (`tenantService.saveControllerCredentials` stores only a username), so this
 * is the one place secrets are written down — and it does so authenticated and
 * encrypted, with the key held only in the environment.
 *
 * Ciphertext never leaves the server. The monitoring API exposes credentials as
 * write-only: they can be set, never read back.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

/**
 * Decode MONITORING_CREDENTIAL_KEY. Accepts base64 or hex; must decode to
 * exactly 32 bytes so a truncated key fails loudly rather than weakening the
 * cipher silently.
 */
export function parseCredentialKey(raw) {
  if (!raw) {
    throw new Error(
      'MONITORING_CREDENTIAL_KEY is not set. Generate one with: openssl rand -base64 32'
    );
  }
  const candidates = [];
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === KEY_BYTES * 2) {
    candidates.push(Buffer.from(raw, 'hex'));
  }
  candidates.push(Buffer.from(raw, 'base64'));

  const key = candidates.find((buf) => buf.length === KEY_BYTES);
  if (!key) {
    throw new Error(
      `MONITORING_CREDENTIAL_KEY must decode to ${KEY_BYTES} bytes (base64 or hex). ` +
        'Generate one with: openssl rand -base64 32'
    );
  }
  return key;
}

/**
 * @param {string} plaintext
 * @param {string} keyMaterial Raw MONITORING_CREDENTIAL_KEY value.
 * @returns {{ ciphertext: Buffer, nonce: Buffer, authTag: Buffer }}
 */
export function encryptSecret(plaintext, keyMaterial) {
  if (typeof plaintext !== 'string' || plaintext === '') {
    throw new Error('Cannot encrypt an empty secret.');
  }
  const key = parseCredentialKey(keyMaterial);
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag() };
}

/**
 * @param {{ ciphertext: Buffer, nonce: Buffer, authTag: Buffer }} envelope
 * @param {string} keyMaterial
 * @returns {string}
 */
export function decryptSecret(envelope, keyMaterial) {
  const { ciphertext, nonce, authTag } = envelope ?? {};
  if (!ciphertext || !nonce || !authTag) {
    throw new Error('Incomplete credential envelope; cannot decrypt.');
  }
  const key = parseCredentialKey(keyMaterial);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(nonce));
  decipher.setAuthTag(Buffer.from(authTag));
  // A wrong key or tampered ciphertext throws here rather than returning garbage.
  return Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]).toString(
    'utf8'
  );
}

/**
 * Pseudonymize a client identifier (MAC / username) before it is persisted.
 * Only used when MONITORING_PERSIST_CLIENT_IDENTIFIERS is explicitly enabled.
 */
export function pseudonymize(identifier, salt) {
  if (!salt) throw new Error('A pseudonymization salt is required.');
  if (!identifier) return null;
  const normalized = String(identifier).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHmac('sha256', salt).update(normalized).digest('hex').slice(0, 32);
}
