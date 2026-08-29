/**
 * Optional OIDC single sign-on (authorization-code flow).
 *
 * Entirely settings-driven: until an admin enables SSO with an issuer and
 * client in Administration, these routes answer 404/disabled and nothing about
 * the classic controller login changes. An SSO user gets an AURA session
 * cookie with the configured default role; their controller data plane is
 * served by the deployment's service account (the proxy injects it — see
 * server.js), so they never need controller credentials of their own.
 *
 * The id_token is verified locally: issuer discovery -> JWKS fetch -> RS256
 * signature via node:crypto, plus iss/aud/exp/nonce checks.
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import { getSetting, upsertLogin, audit } from './identityStore.js';
import { createSessionToken, sessionCookieHeader, readCookie } from './sessionService.js';

const STATE_COOKIE = 'aura_sso_state';
const STATE_TTL_MS = 10 * 60 * 1000;

const stateSecret = crypto.randomBytes(32);

function signState(data) {
  return crypto.createHmac('sha256', stateSecret).update(data).digest('base64url');
}

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`${url} answered ${resp.status}`);
  return resp.json();
}

async function discover(issuer) {
  const base = issuer.replace(/\/+$/, '');
  return fetchJson(`${base}/.well-known/openid-configuration`);
}

function b64urlJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** Verify an RS256 id_token against the issuer's JWKS. Returns claims. */
export async function verifyIdToken(idToken, { issuer, clientId, nonce, jwksUri, fetchJsonFn }) {
  const [headerB64, payloadB64, signatureB64] = idToken.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('malformed id_token');
  const header = b64urlJson(headerB64);
  const claims = b64urlJson(payloadB64);

  if (header.alg !== 'RS256') throw new Error(`unsupported id_token alg ${header.alg}`);

  const jwks = await (fetchJsonFn ?? fetchJson)(jwksUri);
  const jwk = (jwks.keys ?? []).find((k) => k.kid === header.kid && (k.alg ?? 'RS256') === 'RS256');
  if (!jwk) throw new Error('no matching JWKS key for id_token');

  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, 'base64url')
  );
  if (!valid) throw new Error('id_token signature invalid');

  const issNorm = (v) => String(v ?? '').replace(/\/+$/, '');
  if (issNorm(claims.iss) !== issNorm(issuer)) throw new Error('id_token issuer mismatch');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw new Error('id_token audience mismatch');
  if (!claims.exp || Date.now() / 1000 > claims.exp + 60) throw new Error('id_token expired');
  if (nonce && claims.nonce !== nonce) throw new Error('id_token nonce mismatch');
  return claims;
}

function callbackUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  return `${proto}://${req.headers.host}/api/auth/sso/callback`;
}

export function createSsoRouter() {
  const router = Router();

  // Public: does the login page offer an SSO button?
  router.get('/auth/sso/status', async (_req, res) => {
    const sso = await getSetting('sso');
    res.json({ enabled: Boolean(sso?.enabled && sso?.issuer && sso?.clientId) });
  });

  // Begin the flow: redirect to the IdP.
  router.get('/auth/sso/login', async (req, res) => {
    const sso = await getSetting('sso');
    if (!sso?.enabled || !sso.issuer || !sso.clientId) {
      return res.status(404).json({ error: 'SSO is not enabled' });
    }
    let discovery;
    try {
      discovery = await discover(sso.issuer);
    } catch (error) {
      return res.status(502).json({ error: `SSO issuer discovery failed: ${error.message}` });
    }

    const state = crypto.randomBytes(16).toString('base64url');
    const nonce = crypto.randomBytes(16).toString('base64url');
    const statePayload = Buffer.from(
      JSON.stringify({ state, nonce, exp: Date.now() + STATE_TTL_MS })
    ).toString('base64url');
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader(
      'Set-Cookie',
      `${STATE_COOKIE}=${statePayload}.${signState(statePayload)}; Path=/api/auth/sso; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`
    );

    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', sso.clientId);
    url.searchParams.set('redirect_uri', callbackUrl(req));
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    res.redirect(url.toString());
  });

  // Finish the flow: exchange the code, verify, issue an AURA session.
  router.get('/auth/sso/callback', async (req, res) => {
    const fail = (message) =>
      res
        .status(401)
        .send(`<p>SSO sign-in failed: ${message.replace(/</g, '&lt;')}. <a href="/">Back</a></p>`);

    try {
      const sso = await getSetting('sso');
      if (!sso?.enabled) return fail('SSO is not enabled');

      const stateCookie = readCookie(req, STATE_COOKIE);
      if (!stateCookie) return fail('missing state (cookies blocked?)');
      const [payloadB64, sig] = stateCookie.split('.');
      if (signState(payloadB64) !== sig) return fail('state cookie tampered');
      const statePayload = b64urlJson(payloadB64);
      if (Date.now() > statePayload.exp) return fail('state expired — try again');
      if (req.query.state !== statePayload.state) return fail('state mismatch');
      if (!req.query.code) return fail(String(req.query.error_description ?? 'no code returned'));

      const discovery = await discover(sso.issuer);
      const tokenResp = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(req.query.code),
          redirect_uri: callbackUrl(req),
          client_id: sso.clientId,
          client_secret: sso.clientSecret ?? '',
        }),
      });
      if (!tokenResp.ok) return fail(`token exchange answered ${tokenResp.status}`);
      const tokens = await tokenResp.json();
      if (!tokens.id_token) return fail('no id_token in token response');

      const claims = await verifyIdToken(tokens.id_token, {
        issuer: sso.issuer,
        clientId: sso.clientId,
        nonce: statePayload.nonce,
        jwksUri: discovery.jwks_uri,
      });

      const username = claims.email ?? claims.preferred_username ?? claims.sub;
      const user = await upsertLogin({
        username,
        source: 'sso',
        displayName: claims.name ?? null,
        email: claims.email ?? null,
        defaultRole: sso.defaultRole ?? 'viewer',
      });
      if (user.disabled) return fail('account disabled');

      const sessionToken = createSessionToken({
        username: user.username,
        role: user.role,
        source: 'sso',
      });
      res.setHeader('Set-Cookie', sessionCookieHeader(sessionToken, req));
      audit('auth.sso_login', { actor: user.username, source: 'sso' });
      res.redirect('/?sso=ok');
    } catch (error) {
      return fail(error.message);
    }
  });

  return router;
}
