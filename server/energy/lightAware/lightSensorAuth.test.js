import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createLightSensorAuth, tokensMatch } from './lightSensorAuth.js';

function app(env, getSession = () => null) {
  const auth = createLightSensorAuth({ env, getSession });
  const a = express();
  a.post('/report', auth.requireSensorToken, express.json(), (_req, res) => res.json({ ok: true }));
  a.get('/states', auth.requireReader, (_req, res) => res.json({}));
  return a;
}

describe('POST light-sensor report auth', () => {
  it('fails closed with 503 in production when no token is configured', async () => {
    const res = await request(app({ NODE_ENV: 'production' }))
      .post('/report')
      .send({ serial: 'SN1', state: 'dark', data: 1 });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/LIGHT_SENSOR_TOKEN/);
  });

  it('rejects a missing or wrong token with 401', async () => {
    const env = { NODE_ENV: 'production', LIGHT_SENSOR_TOKEN: 's3cret-token' };
    expect((await request(app(env)).post('/report').send({ serial: 'SN1' })).status).toBe(401);
    expect(
      (await request(app(env)).post('/report').set('X-Light-Token', 's3cret-tokeX').send({ serial: 'SN1' }))
        .status
    ).toBe(401);
  });

  it('accepts the right token', async () => {
    const env = { NODE_ENV: 'production', LIGHT_SENSOR_TOKEN: 's3cret-token' };
    const res = await request(app(env))
      .post('/report')
      .set('X-Light-Token', 's3cret-token')
      .send({ serial: 'SN1' });
    expect(res.status).toBe(200);
  });

  it('stays open outside production when no token is set (local bench)', async () => {
    const res = await request(app({ NODE_ENV: 'development' })).post('/report').send({ serial: 'SN1' });
    expect(res.status).toBe(200);
  });

  it('compares tokens in constant time over digests', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
    expect(tokensMatch('', 'abc')).toBe(false);
    expect(tokensMatch('abc', '')).toBe(false);
  });
});

describe('GET light-sensor states auth', () => {
  it('rejects an anonymous caller', async () => {
    expect((await request(app({})).get('/states')).status).toBe(401);
  });

  it('accepts a Bearer token or a valid AURA session cookie', async () => {
    expect(
      (await request(app({})).get('/states').set('Authorization', 'Bearer abcdefghij')).status
    ).toBe(200);
    expect((await request(app({}, () => ({ username: 'op' }))).get('/states')).status).toBe(200);
  });
});
