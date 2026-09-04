/**
 * Signed WLAN provisioning tokens.
 *
 * A validation token proves that a provisioning request refers to the exact
 * plan that was validated: it is an HMAC-SHA256-signed payload carrying the
 * plan hash and an expiry, mirroring the signed-cookie pattern in
 * server/identity/sessionService.js. There is no server-side token registry —
 * the signature plus the caller-supplied plan hash is the whole proof, so
 * verification is a pure function (no DB round-trip) and fails closed if
 * SESSION_SECRET rotates or the token expires.
 *
 * Any edit to the intent after validation changes the plan hash, which no
 * longer matches the token's embedded hash — re-validation is required. This
 * is the mechanism behind "any edit to the transcript, interpreted fields,
 * scope, or planned changes invalidates previous validation" in the product
 * spec.
 */

import crypto from 'node:crypto';

const VALIDATION_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn(
    '[Cortex] ⚠  SESSION_SECRET not set — validation tokens will not survive a restart. ' +
      'Set it in the environment for durable tokens.'
  );
}

function sign(data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/** Stable SHA-256 hash of a canonicalized WLAN configuration plan. */
export function computePlanHash(canonicalPlan) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalPlan)).digest('hex');
}

/** Sign a { planHash } payload into a bearer-safe token string. */
export function signValidationToken(planHash, ttlMs = VALIDATION_TOKEN_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  const body = Buffer.from(JSON.stringify({ planHash, expiresAt })).toString('base64url');
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(expiresAt).toISOString() };
}

/**
 * Verify a token; returns { planHash, expiresAt } or null.
 * Fails closed on a malformed token, a bad signature, or an expired one.
 */
export function verifyValidationToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.planHash || !payload.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}
