/**
 * Secret redaction for everything the MCP server returns.
 *
 * WHY A NAME PATTERN AND NOT A SCHEMA. The Gateway's own swagger omits most of
 * the secret fields its responses actually carry — `sharedSecret` (RADIUS),
 * `cpSharedKey` (captive portal), `faAuthKey`, `cbPassword` and the PSK inside
 * `privacy.WpaPskElement` are all live on the lab Gateway and none of them is
 * in the 390 published schemas. A schema-driven allowlist would leak them, so
 * redaction matches on the field NAME, anywhere in the tree, and fails toward
 * hiding: an over-redacted field costs a little context, a missed one hands a
 * Wi-Fi passphrase or RADIUS secret to whoever holds the connector.
 *
 * Booleans and numbers under a matching name are kept (`keyHexEncoded`,
 * `keySize`, `passwordExpiry: null`) — they describe a secret without being one.
 */

export const REDACTED = '[redacted]';

const SECRET_NAME = new RegExp(
  [
    'pass(word|phrase|wd)?$',
    'password',
    'passphrase',
    'secret',
    'psk',
    'presharedkey',
    'sharedkey',
    'authkey',
    'masterkey',
    'privatekey',
    'wepkey',
    'apikey',
    'token',
    'communit',
    'credential',
    '^key$',
    '^v3users$',
  ].join('|'),
  'i'
);

/**
 * Names that match the pattern but only describe a secret, or are containers
 * whose children are judged on their own (`WpaPskElement` holds both the PSK
 * and the harmless `keyHexEncoded`).
 */
const DESCRIPTIVE =
  /(type|size|method|expiry|encoded|length|format|mode|enabled|required|selection|element)$/i;

export function isSecretName(name) {
  return SECRET_NAME.test(name) && !DESCRIPTIVE.test(name);
}

/**
 * Deep-copy `value` with every secret-named field replaced by REDACTED.
 * Objects and arrays under a secret name are replaced whole: PEAP credentials,
 * SNMP v3 users and v2 communities are structured, and their inner field names
 * (`selection`, `custom`, `name`) do not look secret.
 */
export function redactSecrets(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (
      isSecretName(k) &&
      v !== null &&
      v !== '' &&
      typeof v !== 'boolean' &&
      typeof v !== 'number'
    ) {
      out[k] = REDACTED;
    } else {
      out[k] = redactSecrets(v, seen);
    }
  }
  return out;
}

/**
 * Mark a STRUCTURED network-sourced payload as untrusted. Cortex's `untrusted()`
 * stringifies (it fences single SSIDs and hostnames); a whole Gateway object
 * must keep its shape, so the marker wraps it instead.
 */
export function untrustedData(value) {
  if (value === null || value === undefined) return null;
  return { __untrusted__: true, value };
}
