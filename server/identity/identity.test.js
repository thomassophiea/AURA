/**
 * Identity layer security behavior: session token integrity, RBAC decisions,
 * and OIDC id_token verification. These guard the trust boundary, so they get
 * real cryptographic tests rather than mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('./identityStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getUser: vi.fn().mockResolvedValue(null),
    upsertLogin: vi.fn(),
    audit: vi.fn(),
  };
});
vi.mock('../monitoring/requireControllerScope.js', () => ({
  extractBearerToken: (req) => {
    const h = req.headers?.authorization ?? '';
    return h.startsWith('Bearer ') ? h.slice(7) : null;
  },
  validateTokenAgainstController: vi.fn().mockResolvedValue({ valid: true }),
}));

import { createSessionToken, verifySessionToken } from './sessionService.js';
import { requireRole } from './identityRouter.js';
import { verifyIdToken } from './ssoRouter.js';
import { getUser } from './identityStore.js';
import { validateTokenAgainstController } from '../monitoring/requireControllerScope.js';

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  return res;
}

describe('session tokens', () => {
  it('round-trips a payload', () => {
    const token = createSessionToken({ username: 'alice', role: 'operator', source: 'controller' });
    const payload = verifySessionToken(token);
    expect(payload).toMatchObject({ username: 'alice', role: 'operator' });
  });

  it('rejects tampered payloads and garbage', () => {
    const token = createSessionToken({ username: 'alice', role: 'viewer', source: 'controller' });
    const [body, sig] = token.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ username: 'alice', role: 'admin', exp: Date.now() + 10000 })
    ).toString('base64url');
    expect(verifySessionToken(`${forgedBody}.${sig}`)).toBeNull();
    expect(verifySessionToken('nonsense')).toBeNull();
    expect(verifySessionToken(`${body}.AAAA`)).toBeNull();
  });
});

describe('requireRole', () => {
  beforeEach(() => vi.mocked(getUser).mockResolvedValue(null));

  const reqWith = (cookie) => ({ headers: cookie ? { cookie } : {} });

  it('lets bearer-token API clients through, tagged as api-client', async () => {
    const req = {
      headers: {
        authorization: 'Bearer real-controller-token',
        'x-controller-url': 'https://controller.test',
      },
    };
    const res = mockRes();
    const next = vi.fn();
    await requireRole('operator')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.auraActor).toBe('api-client');
  });

  it('refuses anonymous callers with neither session nor bearer', async () => {
    const res = mockRes();
    const next = vi.fn();
    await requireRole('operator')(reqWith(null), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('refuses a bearer the controller rejects — Bearer-shaped is not enough', async () => {
    vi.mocked(validateTokenAgainstController).mockResolvedValueOnce({ valid: false });
    const req = {
      headers: {
        authorization: 'Bearer forged-nonsense',
        'x-controller-url': 'https://controller.test',
      },
    };
    const res = mockRes();
    const next = vi.fn();
    await requireRole('operator')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('refuses a viewer session on an operator route', async () => {
    const token = createSessionToken({ username: 'v', role: 'viewer', source: 'controller' });
    const res = mockRes();
    const next = vi.fn();
    await requireRole('operator')(reqWith(`aura_session=${token}`), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('accepts an operator session and names the actor', async () => {
    const token = createSessionToken({ username: 'op', role: 'operator', source: 'controller' });
    const req = reqWith(`aura_session=${token}`);
    const next = vi.fn();
    await requireRole('operator')(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.auraActor).toBe('op');
  });

  it('enforces the STORED role over the cookie snapshot (demotion takes effect)', async () => {
    vi.mocked(getUser).mockResolvedValue({ username: 'x', role: 'viewer', disabled: false });
    const token = createSessionToken({ username: 'x', role: 'admin', source: 'controller' });
    const res = mockRes();
    const next = vi.fn();
    await requireRole('admin')(reqWith(`aura_session=${token}`), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('refuses a disabled account regardless of role', async () => {
    vi.mocked(getUser).mockResolvedValue({ username: 'x', role: 'admin', disabled: true });
    const token = createSessionToken({ username: 'x', role: 'admin', source: 'controller' });
    const res = mockRes();
    const next = vi.fn();
    await requireRole('viewer')(reqWith(`aura_session=${token}`), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe('verifyIdToken', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
  const jwks = { keys: [jwk] };
  const fetchJsonFn = async () => jwks;

  function makeToken(claims, { kid = 'k1' } = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = crypto
      .sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey)
      .toString('base64url');
    return `${header}.${payload}.${signature}`;
  }

  const goodClaims = () => ({
    iss: 'https://idp.example.com',
    aud: 'aura-client',
    sub: 'user-1',
    email: 'alice@example.com',
    nonce: 'n1',
    exp: Math.floor(Date.now() / 1000) + 600,
  });
  const opts = {
    issuer: 'https://idp.example.com',
    clientId: 'aura-client',
    nonce: 'n1',
    jwksUri: 'https://idp.example.com/jwks',
    fetchJsonFn,
  };

  it('accepts a valid RS256 token', async () => {
    const claims = await verifyIdToken(makeToken(goodClaims()), opts);
    expect(claims.email).toBe('alice@example.com');
  });

  it('rejects a bad signature', async () => {
    const token = makeToken(goodClaims());
    const tampered = token.slice(0, -6) + 'AAAAAA';
    await expect(verifyIdToken(tampered, opts)).rejects.toThrow(/signature/);
  });

  it('rejects issuer, audience, expiry, and nonce mismatches', async () => {
    await expect(
      verifyIdToken(makeToken({ ...goodClaims(), iss: 'https://evil.example.com' }), opts)
    ).rejects.toThrow(/issuer/);
    await expect(
      verifyIdToken(makeToken({ ...goodClaims(), aud: 'other-app' }), opts)
    ).rejects.toThrow(/audience/);
    await expect(
      verifyIdToken(makeToken({ ...goodClaims(), exp: Math.floor(Date.now() / 1000) - 3600 }), opts)
    ).rejects.toThrow(/expired/);
    await expect(
      verifyIdToken(makeToken({ ...goodClaims(), nonce: 'wrong' }), opts)
    ).rejects.toThrow(/nonce/);
  });

  it('rejects unknown keys and non-RS256 algorithms', async () => {
    await expect(verifyIdToken(makeToken(goodClaims(), { kid: 'other' }), opts)).rejects.toThrow(
      /JWKS/
    );
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(goodClaims())).toString('base64url');
    await expect(verifyIdToken(`${noneHeader}.${payload}.x`, opts)).rejects.toThrow(/alg/);
  });
});
