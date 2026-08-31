/**
 * WPA2-Personal key material for PPSK / MPSK identities.
 *
 * A PPSK identity is a passphrase bound to an SSID. The AP authenticator
 * (hostapd) derives the PMK itself during the 4-way handshake and, when several
 * keys are provisioned as a `wpa_psk_file`, tries each candidate PMK against the
 * handshake MIC — the entry that verifies IS the identity, tagged by `keyid`.
 * This was proven on real Campus OS AP hardware (AP5020, fw 10.20.1); see
 * docs/PPSK_HARDWARE_FINDINGS.md.
 *
 * Consequences for this module:
 *  - We render the PLAINTEXT passphrase into the key file — the AP needs it to
 *    derive the PMK. Passphrases are therefore stored recoverably-encrypted
 *    (ppskCrypto.js), never one-way hashed.
 *  - PMK derivation here (deriveePmk) is for display/verification and for a
 *    future RADIUS path; the file path does not need us to pre-derive it.
 *  - Cryptography is standards-correct PBKDF2-HMAC-SHA1, verified against the
 *    IEEE 802.11i Annex H.4.2 test vector. Do not improvise this.
 */

import crypto from 'crypto';

/** WPA2-Personal passphrase length bounds (IEEE 802.11i). */
export const MIN_PASSPHRASE = 8;
export const MAX_PASSPHRASE = 63;

/**
 * PMK = PBKDF2-HMAC-SHA1(passphrase, ssid, 4096, 256 bits).
 * Returns 64 lowercase hex chars. Verified: ("password","IEEE") →
 * f42c6fc52df0ebef9ebb4b90b38a5f902e83fe1b135a70e23aed762e9710a12e.
 */
export function derivePmk(passphrase, ssid) {
  if (typeof passphrase !== 'string' || typeof ssid !== 'string') {
    throw new Error('passphrase and ssid must be strings');
  }
  return crypto.pbkdf2Sync(passphrase, ssid, 4096, 32, 'sha1').toString('hex');
}

/**
 * Validate a WPA2-Personal passphrase. Returns null when valid, else a reason.
 * ASCII printable only — hostapd's key file is a line-oriented ASCII format and
 * a stray control char or newline would corrupt an unrelated entry.
 */
export function validatePassphrase(passphrase) {
  if (typeof passphrase !== 'string') return 'passphrase is required';
  if (passphrase.length < MIN_PASSPHRASE) return `passphrase must be at least ${MIN_PASSPHRASE} characters`;
  if (passphrase.length > MAX_PASSPHRASE) return `passphrase must be at most ${MAX_PASSPHRASE} characters`;
  // Printable ASCII 0x20–0x7e, matching hostapd's wpa_passphrase acceptance.
  if (!/^[\x20-\x7e]+$/.test(passphrase)) return 'passphrase must be printable ASCII';
  return null;
}

// Unambiguous charset (no 0/O/1/l/I) for generated keys an operator may read aloud.
const GEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generate a cryptographically-secure passphrase from the unambiguous alphabet.
 * Rejection-sampled so every character is uniform (no modulo bias).
 */
export function generatePassphrase(length = 16) {
  const n = Math.min(MAX_PASSPHRASE, Math.max(MIN_PASSPHRASE, length));
  const out = [];
  const max = 256 - (256 % GEN_ALPHABET.length);
  while (out.length < n) {
    for (const byte of crypto.randomBytes(n * 2)) {
      if (byte >= max) continue;
      out.push(GEN_ALPHABET[byte % GEN_ALPHABET.length]);
      if (out.length === n) break;
    }
  }
  return out.join('');
}

/**
 * Sanitize an identity name into a hostapd-safe `keyid`.
 *
 * `keyid` is echoed on AP-STA-CONNECTED and carried into accounting, and lives
 * on one whitespace-delimited line of the key file — so it must contain no
 * whitespace. Non-conforming characters collapse to '-'. Never empty.
 */
export function keyidFor(name) {
  const cleaned = String(name ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return cleaned || 'identity';
}

/** The wildcard MAC in a wpa_psk_file line: "any station may present this key". */
export const WILDCARD_MAC = '00:00:00:00:00:00';

/**
 * Render one enabled identity as a wpa_psk_file line:
 *   [vlanid=N] keyid=<id> 00:00:00:00:00:00 <passphrase>
 *
 * `id` is the keyid, `vlanId` optional per-key VLAN (proven present in the AP
 * binary), `passphrase` the plaintext the AP needs to derive the PMK. The
 * wildcard MAC is what makes identity come from the key, not a pre-registered
 * MAC — the whole point of PPSK.
 */
export function pskFileLine({ keyid, passphrase, vlanId = null }) {
  const parts = [];
  if (vlanId != null && Number.isInteger(vlanId)) parts.push(`vlanid=${vlanId}`);
  parts.push(`keyid=${keyidFor(keyid)}`);
  parts.push(WILDCARD_MAC);
  parts.push(passphrase);
  return parts.join(' ');
}

/**
 * Render a full wpa_psk_file body from a set of {keyid, passphrase, vlanId}
 * entries. This is the exact artifact the controller would push to the AP and
 * reload; operators can also apply it by hand for a lab bring-up. Caller passes
 * only the entries that should be live (enabled, unexpired, in scope).
 */
export function renderPskFile(entries) {
  const header =
    '# wpa_psk_file rendered by AURA PPSK — one WPA2-Personal WLAN, per-key identity.\n' +
    '# The AP matches the key against the 4-way-handshake MIC and tags the\n' +
    '# station with the matched keyid. Wildcard MAC = no MAC pre-registration.\n';
  const lines = entries.map(pskFileLine);
  return `${header}${lines.join('\n')}${lines.length ? '\n' : ''}`;
}
