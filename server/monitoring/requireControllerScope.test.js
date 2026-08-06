import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import {
  createRequireControllerScope,
  extractBearerToken,
  clearValidationCache,
  validateTokenAgainstController,
} from './requireControllerScope.js';

const SOURCE_A = { id: 'src-a', baseUrl: 'https://ctrl-a.example.com', orgId: 'org-a' };
const SOURCE_B = { id: 'src-b', baseUrl: 'https://ctrl-b.example.com', orgId: 'org-b' };

function buildApp(overrides = {}) {
  const app = express();
  const middleware = createRequireControllerScope({
    listSourcesFn: async () => [SOURCE_A, SOURCE_B],
    validateFn: async () => ({ valid: true }),
    defaultControllerUrl: 'https://ctrl-a.example.com',
    ...overrides,
  });
  app.get('/scoped', middleware, (req, res) => res.json({ scope: req.monitoringScope }));
  return app;
}

beforeEach(() => {
  clearValidationCache();
});

describe('extractBearerToken', () => {
  it('reads a bearer token', () => {
    expect(extractBearerToken({ headers: { authorization: 'Bearer abcdefghij' } })).toBe(
      'abcdefghij'
    );
  });

  it('rejects a missing or malformed header', () => {
    expect(extractBearerToken({ headers: {} })).toBeNull();
    expect(extractBearerToken({ headers: { authorization: 'Basic abcdefghij' } })).toBeNull();
  });

  it('rejects an implausibly short token', () => {
    expect(extractBearerToken({ headers: { authorization: 'Bearer abc' } })).toBeNull();
  });
});

describe('validateTokenAgainstController cache', () => {
  const controller = 'https://ctrl-a.example.com';
  const ok = async () => ({ ok: true, status: 200, json: async () => [] });
  const unauthorized = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Unauthorized',
  });

  it('caches a successful validation so charts do not re-hit the controller', async () => {
    const fetchFn = vi.fn(ok);
    const token = 'a'.repeat(40);

    expect(await validateTokenAgainstController(token, controller, { fetchFn })).toEqual({
      valid: true,
    });
    expect(await validateTokenAgainstController(token, controller, { fetchFn })).toEqual({
      valid: true,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not let a token sharing a prefix and length reuse a cached verdict', async () => {
    // OAuth2 tokens from one issuer routinely share leading characters. Keying
    // the cache on a prefix would let this second token authenticate for free.
    const valid = `${'x'.repeat(12)}-valid-token-suffix`;
    const forged = `${'x'.repeat(12)}-FORGED-tokn-suffix`;
    expect(forged.length).toBe(valid.length);
    expect(forged.slice(0, 12)).toBe(valid.slice(0, 12));

    const fetchFn = vi.fn(async (_url, init) =>
      init.headers.Authorization === `Bearer ${valid}` ? ok() : unauthorized()
    );

    expect(await validateTokenAgainstController(valid, controller, { fetchFn })).toEqual({
      valid: true,
    });
    const result = await validateTokenAgainstController(forged, controller, { fetchFn });

    expect(result.valid).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('scopes the cache per controller, so a token valid on one is not valid on another', async () => {
    const token = 'b'.repeat(40);
    const fetchFn = vi.fn(async (url) => (url.startsWith(controller) ? ok() : unauthorized()));

    expect(await validateTokenAgainstController(token, controller, { fetchFn })).toEqual({
      valid: true,
    });
    const other = await validateTokenAgainstController(token, 'https://ctrl-b.example.com', {
      fetchFn,
    });
    expect(other.valid).toBe(false);
  });

  it('never caches a failure, so a brief controller outage cannot lock an operator out', async () => {
    const token = 'c'.repeat(40);
    let healthy = false;
    const fetchFn = vi.fn(async () => (healthy ? ok() : unauthorized()));

    expect((await validateTokenAgainstController(token, controller, { fetchFn })).valid).toBe(false);
    healthy = true;
    expect((await validateTokenAgainstController(token, controller, { fetchFn })).valid).toBe(true);
  });

  it('expires a cached verdict rather than trusting it forever', async () => {
    const token = 'd'.repeat(40);
    const fetchFn = vi.fn(ok);
    const start = 1_000_000;

    await validateTokenAgainstController(token, controller, { fetchFn, now: start });
    await validateTokenAgainstController(token, controller, { fetchFn, now: start + 30_000 });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await validateTokenAgainstController(token, controller, { fetchFn, now: start + 120_000 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

});

describe('createRequireControllerScope', () => {
  it('rejects a request with no token', async () => {
    await request(buildApp()).get('/scoped').expect(401);
  });

  it('rejects a token the controller does not accept', async () => {
    await request(buildApp({ validateFn: async () => ({ valid: false, status: 401 }) }))
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .expect(401);
  });

  it('scopes to the sources on the controller the caller authenticated against', async () => {
    const res = await request(buildApp())
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .set('X-Controller-URL', 'https://ctrl-b.example.com')
      .expect(200);
    expect(res.body.scope.sourceIds).toEqual(['src-b']);
  });

  it('never includes another controller\'s sources', async () => {
    const res = await request(buildApp())
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .set('X-Controller-URL', 'https://ctrl-a.example.com')
      .expect(200);
    expect(res.body.scope.sourceIds).not.toContain('src-b');
  });

  it('falls back to the default controller when no header is supplied', async () => {
    const res = await request(buildApp())
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .expect(200);
    expect(res.body.scope.sourceIds).toEqual(['src-a']);
  });

  it('normalizes the controller URL so a /management suffix still matches', async () => {
    const res = await request(buildApp())
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .set('X-Controller-URL', 'https://ctrl-a.example.com/management/')
      .expect(200);
    expect(res.body.scope.sourceIds).toEqual(['src-a']);
  });

  it('forbids a controller that is not a registered source, without confirming it exists', async () => {
    const res = await request(buildApp())
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .set('X-Controller-URL', 'https://ctrl-unknown.example.com')
      .expect(403);
    expect(JSON.stringify(res.body)).not.toContain('ctrl-unknown');
  });

  it('validates against the controller the caller named, not the default', async () => {
    const validateFn = vi.fn(async () => ({ valid: true }));
    await request(buildApp({ validateFn }))
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .set('X-Controller-URL', 'https://ctrl-b.example.com')
      .expect(200);
    expect(validateFn.mock.calls[0][1]).toBe('https://ctrl-b.example.com');
  });

  it('returns 503 when the monitoring store is unreachable, not 200 with empty data', async () => {
    await request(
      buildApp({
        listSourcesFn: async () => {
          throw new Error('connection terminated');
        },
      })
    )
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .expect(503);
  });

  it('does not leak the database error text', async () => {
    const res = await request(
      buildApp({
        listSourcesFn: async () => {
          throw new Error('password authentication failed for user "aura"');
        },
      })
    )
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .expect(503);
    expect(JSON.stringify(res.body)).not.toContain('password authentication');
  });

  it('caches a successful validation so charts do not re-hit the controller', async () => {
    const validateFn = vi.fn(async () => ({ valid: true }));
    const app = buildApp({ validateFn });
    await request(app).get('/scoped').set('Authorization', 'Bearer sometokenvalue').expect(200);
    await request(app).get('/scoped').set('Authorization', 'Bearer sometokenvalue').expect(200);
    // The middleware calls validateFn each time; caching lives inside the real
    // validator, so both calls are expected here.
    expect(validateFn).toHaveBeenCalledTimes(2);
  });

  it('rejects when no controller can be resolved at all', async () => {
    await request(buildApp({ defaultControllerUrl: undefined }))
      .get('/scoped')
      .set('Authorization', 'Bearer sometokenvalue')
      .expect(400);
  });
});
