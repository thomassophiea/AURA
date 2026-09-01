/**
 * WPA3-Personal (SAE) credential material for Private SAE identities.
 *
 * A Private SAE credential is a passphrase bound to an SSID on the SAE AKM. Like
 * PPSK (server/ppsk/pmk.js) the AP derives the key itself — for SAE the PT
 * (password element) via hunting-and-pecking / H2E during the SAE handshake — so
 * we render the PLAINTEXT passphrase into a `sae_password` set and store it
 * recoverably-encrypted (ppskCrypto.js), never one-way hashed.
 *
 * The `sae_password` file is a line-oriented `|`-delimited format the AP already
 * understands (evidence: `Assigned VLAN ID %d from sae_password`, requirements
 * doc E1). Because `|` is the field separator and the whole line is one record,
 * a passphrase must never contain `|`, and must be printable ASCII with no
 * control characters — a stray one would corrupt an unrelated credential.
 *
 * SAE has no 8-char floor the way WPA2-Personal does, but a short SAE password
 * is still guessable offline against a captured Commit; we require a strong
 * minimum (MIN_PASSPHRASE) for generated and accepted credentials. The 63-char
 * ceiling matches the PPSK/WPA-Personal input bound and keeps one credential on
 * one file line.
 */

import crypto from 'crypto';

/** SAE passphrase length bounds for Private SAE credentials. */
export const MIN_PASSPHRASE = 20;
export const MAX_PASSPHRASE = 63;

/** The default WLAN this credential set is provisioned onto. */
export const DEFAULT_SSID = 'AURA_PSAE';
/** The default AKM — one table can also express migrated WPA2-PPSK credentials. */
export const DEFAULT_AKM = 'wpa3-sae';
export const VALID_AKMS = new Set(['wpa3-sae', 'wpa2-psk']);

/**
 * Validate a Private SAE passphrase. Returns null when valid, else a reason.
 * Printable ASCII 0x20–0x7e, excluding '|' (the sae_password field separator).
 */
export function validatePassphrase(passphrase) {
  if (typeof passphrase !== 'string') return 'passphrase is required';
  if (passphrase.length < MIN_PASSPHRASE) return `passphrase must be at least ${MIN_PASSPHRASE} characters`;
  if (passphrase.length > MAX_PASSPHRASE) return `passphrase must be at most ${MAX_PASSPHRASE} characters`;
  if (passphrase.includes('|')) return "passphrase must not contain '|' (the sae_password field separator)";
  // Printable ASCII only — the sae_password file is a line-oriented ASCII format.
  if (!/^[\x20-\x7e]+$/.test(passphrase)) return 'passphrase must be printable ASCII';
  return null;
}

// Unambiguous printable-ASCII alphabet (no 0/O/1/l/I, no '|') for generated SAE
// passwords an operator may read aloud or a guest may type from a QR fallback.
const GEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generate a cryptographically-secure SAE passphrase from the unambiguous
 * alphabet. Rejection-sampled so every character is uniform (no modulo bias).
 * Length is clamped into [MIN_PASSPHRASE, MAX_PASSPHRASE]; default is a strong
 * 24 characters (~137 bits from this alphabet).
 */
export function generatePassphrase(length = 24) {
  const n = Math.min(MAX_PASSPHRASE, Math.max(MIN_PASSPHRASE, Number(length) || MIN_PASSPHRASE));
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
 * Sanitize a credential name into an AP-safe `keyid`.
 *
 * `keyid` is the trailing `id=` field of a sae_password line (and is echoed on
 * AP-STA-CONNECTED), so it must contain no whitespace and none of the field
 * separators '|' or '='. Non-conforming characters collapse to '-'. Never empty.
 */
export function keyidFor(name) {
  const cleaned = String(name ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return cleaned || 'credential';
}

/** Canonicalize a MAC to lowercase colon-separated form, or '' if not a MAC. */
export function canonicalMac(mac) {
  const hex = String(mac || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12) return '';
  return hex.replace(/(.{2})(?=.)/g, '$1:');
}

/**
 * Render one sae_password line for a credential + optional bound MAC:
 *   sae_password=<passphrase>[|mac=<mac>][|vlanid=<N>][|id=<keyid>]
 *
 * `|mac=` is the selector the AP uses to pick the password by station, and is
 * included only when a bound MAC is passed. `|vlanid=` is omitted when VLAN is
 * unset. A credential with no binding renders a wildcard line (no mac=).
 *
 * `|id=` (SAE Password Identifier) is OFF by default (`emitId=false`) and should
 * stay off for any real deployment: no native client OS (Windows, macOS, iOS,
 * iPadOS, Android, ChromeOS) can present a Password Identifier, and an AP that
 * advertises one breaks native association — proven on hardware 2026-09-01
 * (macOS returned err -3912 at association until `id=` was removed; pure MAC
 * binding then connected cleanly). It is exposed only as an opt-in for
 * wpa_supplicant-level diagnostics. Identity mapping (keyid ↔ station) is carried
 * out of band by the controller (requirements R3), never as an on-air identifier.
 */
export function saePasswordLine({ keyid, passphrase, mac = null, vlanId = null, emitId = false }) {
  let line = `sae_password=${passphrase}`;
  if (mac) line += `|mac=${mac}`;
  if (vlanId != null && Number.isInteger(vlanId)) line += `|vlanid=${vlanId}`;
  if (emitId) line += `|id=${keyidFor(keyid)}`;
  return line;
}

/**
 * Render a full sae_password file body from a set of live credentials. Each
 * credential is preceded by a `# keyid=<keyid> [vlan=<N>]` comment (the operator/
 * controller identity mapping — a full-line comment, so hostapd ignores it) and
 * contributes one wildcard line when it has no bindings, or one line per bound
 * MAC. This is the exact artifact the controller would push to the AP; operators
 * can also apply it by hand for a lab bring-up. Caller passes only credentials
 * that should be live (enabled, unexpired, in scope), each as
 * { keyid, passphrase, vlanId, macs: string[] }. `emitId` defaults to false — see
 * saePasswordLine for why an on-air identifier must not be used in production.
 */
export function renderSaePasswordFile(entries, { emitId = false } = {}) {
  const header =
    '# sae_password file rendered by AURA Private SAE — one WPA3-Personal (SAE)\n' +
    '# WLAN, per-user credentials. The AP selects a credential by station MAC\n' +
    '# pre-Commit (mac=); a wildcard credential (no mac=) is offered for enrollment.\n' +
    '# id= (SAE Password Identifier) is OFF: no native client OS can present one and\n' +
    '# advertising it breaks native association (proven on hardware 2026-09-01).\n' +
    '# keyid is carried as a per-credential comment for the identity mapping instead.\n';
  const lines = [];
  for (const e of entries) {
    const macs = Array.isArray(e.macs) ? e.macs.filter(Boolean) : [];
    lines.push(`# keyid=${keyidFor(e.keyid)}${e.vlanId != null && Number.isInteger(e.vlanId) ? ` vlan=${e.vlanId}` : ''}`);
    if (macs.length === 0) {
      lines.push(saePasswordLine({ keyid: e.keyid, passphrase: e.passphrase, vlanId: e.vlanId ?? null, emitId }));
    } else {
      for (const mac of macs) {
        lines.push(saePasswordLine({ keyid: e.keyid, passphrase: e.passphrase, mac, vlanId: e.vlanId ?? null, emitId }));
      }
    }
  }
  return `${header}${lines.join('\n')}${lines.length ? '\n' : ''}`;
}
