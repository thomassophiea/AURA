import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createSystemRouter } from './systemRouter.js';
import { loadMonitoringConfig } from '../monitoring/config.js';

const CONFIG = loadMonitoringConfig({ DATABASE_URL: 'postgres://localhost/aura' });

/**
 * The router runs several probes concurrently against one query function, so
 * the fake dispatches on the SQL text rather than on call order.
 */
function makeQueryFn({ stamp = 'production', newestAgeSeconds = 30, oldestDays = 3 } = {}) {
  return vi.fn(async (sql) => {
    if (sql.includes('environment_identity')) {
      return { rows: [{ environment: stamp, stamped_at: new Date('2026-08-07T00:00:00Z') }] };
    }
    if (sql.includes('schema_migrations')) {
      return {
        rows: [
          { name: '0001_monitoring.sql', applied_at: new Date() },
          { name: '0002_timerange_indexes.sql', applied_at: new Date() },
          { name: '0003_environment_identity.sql', applied_at: new Date() },
        ],
      };
    }
    if (sql.includes('max(observed_at)')) {
      return {
        rows: [{ newest: new Date(Date.now() - newestAgeSeconds * 1000), total: '1200' }],
      };
    }
    if (sql.includes('min(observed_at)')) {
      return {
        rows: [{ oldest: new Date(Date.now() - oldestDays * 86_400_000), overdue: '0' }],
      };
    }
    return { rows: [{}] };
  });
}

function makeApp(overrides = {}) {
  const app = express();
  app.use(
    '/api',
    createSystemRouter({
      config: CONFIG,
      dirname: '/nonexistent',
      deps: {
        queryFn: makeQueryFn(),
        probeCwpFn: async () => ({ status: 'ok', service: 'os-one-cwp', commit: 'abc1234' }),
        probeGatewayFn: async () => ({ status: 'reachable', httpStatus: 401, host: 'gw.example' }),
        ...overrides,
      },
    })
  );
  return app;
}

let saved;

beforeEach(() => {
  saved = { ...process.env };
  process.env.AURA_ENVIRONMENT = 'production';
  process.env.DATABASE_URL = 'postgres://localhost/aura';
  process.env.CAMPUS_CONTROLLER_URL = 'https://gw.example';
});

afterEach(() => {
  process.env = saved;
});

describe('GET /api/v1/system/version', () => {
  it('reports the environment identity', async () => {
    const res = await request(makeApp()).get('/api/v1/system/version');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      environment: 'production',
      label: 'Production Demo',
      shortLabel: 'PROD DEMO',
      role: 'web',
    });
  });

  it('falls back to the Railway commit when no version.json exists', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = 'abcdef1234567890';
    const res = await request(makeApp()).get('/api/v1/system/version');
    expect(res.body.commit).toBe('abcdef1');
    expect(res.body.source).toBe('railway-env');
  });
});

describe('GET /api/v1/system/health', () => {
  it('is 503 with databaseEnvironment failing when the stamp disagrees', async () => {
    const res = await request(makeApp({ queryFn: makeQueryFn({ stamp: 'integration' }) })).get(
      '/api/v1/system/health'
    );
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.failing).toContain('databaseEnvironment');
    expect(res.body.databaseEnvironment).toMatchObject({
      declared: 'production',
      databaseEnvironment: 'integration',
      matches: false,
    });
  });

  it('flags a stale collector', async () => {
    const res = await request(
      makeApp({ queryFn: makeQueryFn({ newestAgeSeconds: 86_400 }) })
    ).get('/api/v1/system/health');
    expect(res.status).toBe(503);
    expect(res.body.failing).toContain('collector');
    expect(res.body.components.collector.status).toBe('stale');
  });

  it('flags cleanup as behind when history outruns the retention window', async () => {
    const res = await request(makeApp({ queryFn: makeQueryFn({ oldestDays: 30 }) })).get(
      '/api/v1/system/health'
    );
    expect(res.body.failing).toContain('cleanup');
    expect(res.body.components.cleanup.status).toBe('behind');
  });

  it('flags an unreachable portal', async () => {
    const res = await request(
      makeApp({ probeCwpFn: async () => ({ status: 'unreachable' }) })
    ).get('/api/v1/system/health');
    expect(res.body.failing).toContain('cwp');
  });
});

describe('GET /api/v1/system/dependencies', () => {
  it('reports schema state and dependency detail', async () => {
    const res = await request(makeApp()).get('/api/v1/system/dependencies');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.database.schema).toMatchObject({
      status: 'ok',
      count: 3,
      latest: '0003_environment_identity.sql',
    });
    expect(res.body.dependencies.gateway.status).toBe('reachable');
    expect(res.body.dependencies.cwp.status).toBe('ok');
  });

  it('reports configuration as names and presence only, never values', async () => {
    process.env.DATABASE_URL = 'postgres://user:hunter2@db.internal/railway';
    process.env.CWP_INTERNAL_API_TOKEN = 'super-secret-token-value';
    const res = await request(makeApp()).get('/api/v1/system/dependencies');

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('hunter2');
    expect(body).not.toContain('super-secret-token-value');
    expect(res.body.configuration.present).toContain('DATABASE_URL');
    expect(res.body.configuration.present).toContain('CWP_INTERNAL_API_TOKEN');
  });

  it('names the missing required variables', async () => {
    delete process.env.CAMPUS_CONTROLLER_URL;
    const res = await request(makeApp()).get('/api/v1/system/dependencies');
    expect(res.body.configuration.ok).toBe(false);
    expect(res.body.configuration.missingRequired).toContain('CAMPUS_CONTROLLER_URL');
  });

  it('keeps answering when the database is unreachable', async () => {
    const res = await request(
      makeApp({
        queryFn: vi.fn(async () => {
          throw new Error('ECONNREFUSED 10.0.0.1:5432');
        }),
      })
    ).get('/api/v1/system/dependencies');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.database.reason).toBe('unreachable');
  });
});
