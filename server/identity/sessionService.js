/**
 * Signed AURA session cookies.
 *
 * A session is an HMAC-SHA256-signed payload in an httpOnly cookie — no
 * server-side session table, so a redeploy costs nothing but a re-login. The
 * signing secret comes from SESSION_SECRET; without one, a per-boot random
 * secret is used (sessions then expire on restart, which is safe, just less
 * convenient — production sets the env var).
 */

import crypto from 'node:crypto';

export const SESSION_COOKIE = 'aura_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn(
    '[Identity] ⚠  SESSION_SECRET not set — sessions will not survive a restart. ' +
      'Set it in the environment for durable sessions.'
  );
}

function sign(data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/** Create a session token for { username, role, source }. */
export function createSessionToken(payload) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + SESSION_TTL_MS })
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** Verify a token; returns the payload or null. */
export function verifySessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = sign(body);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Minimal cookie parsing — the app deliberately has no cookie middleware. */
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function sessionCookieHeader(token, req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return (
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; ` +
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`
  );
}

export function clearSessionCookieHeader(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

/** The verified session on a request, or null. */
export function getSession(req) {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? verifySessionToken(token) : null;
}
