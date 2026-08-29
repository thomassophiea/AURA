/**
 * Route-level tests for the config restore endpoint, focused on the
 * controller-mismatch guard: a snapshot remembers the controller it was
 * captured from (`sourceBaseUrl`), and applying it to a different one must
 * be refused rather than silently written.
 *
 * Auth (`requireRole`) and persistence (`audit`, `getSnapshot`,
 * `captureCurrentSections`) are mocked so this exercises only the router's
 * own logic; `computeRestorePlan` is the real (pure) implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';

vi.mock('../identity/identityRouter.js', () => ({
  requireRole: () => (req, _res, next) => {
    req.auraActor = 'tester';
    req.auraActorSource = 'test';
    next();
  },
}));

vi.mock('../identity/identityStore.js', () => ({
  audit: vi.fn(),
}));

vi.mock('./configSnapshotService.js', async () => {
  const actual = await vi.importActual('./configSnapshotService.js');
  return {
    ...actual,
    getSnapshot: vi.fn(),
    captureCurrentSections: vi.fn(),
  };
});

const { createConfigRouter } = await import('./configRouter.js');
const { getSnapshot, captureCurrentSections } = await import('./configSnapshotService.js');

/** Minimal in-process HTTP driver so the router is exercised as Express runs it. */
async function request(app, { method = 'GET', path, body = null }) {
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

const CURRENT_SECTIONS = {
  wlans: [],
  networks: [],
  aaaPolicies: [],
  profiles: [],
  sites: [],
};

const TARGET_SECTIONS = {
  wlans: [{ id: 'w1', serviceName: 'Corp', vlan: 10 }],
  networks: [],
  aaaPolicies: [],
  profiles: [],
  sites: [],
};

function buildApp({ sourceBaseUrl, sessionBaseUrl, write = vi.fn().mockResolvedValue({ ok: true, status: 200, data: null }) }) {
  getSnapshot.mockResolvedValue({
    id: 5,
    sourceBaseUrl,
    sections: TARGET_SECTIONS,
  });
  captureCurrentSections.mockResolvedValue({ sections: CURRENT_SECTIONS, failures: [] });

  const session = { baseUrl: sessionBaseUrl, write };
  const app = express();
  app.use('/api', createConfigRouter({ sessionFactory: () => session }));
  return { app, session };
}

describe('POST /api/config/restore — controller mismatch guard', () => {
  const originalEnabled = process.env.CONFIG_RESTORE_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.CONFIG_RESTORE_ENABLED;
    else process.env.CONFIG_RESTORE_ENABLED = originalEnabled;
  });

  it('matching source: apply proceeds and writes through the session', async () => {
    process.env.CONFIG_RESTORE_ENABLED = 'true';
    const { app, session } = buildApp({
      sourceBaseUrl: 'https://ctrl-a.example',
      sessionBaseUrl: 'https://ctrl-a.example',
    });

    const res = await request(app, {
      method: 'POST',
      path: '/api/config/restore',
      body: { snapshotId: 5, confirm: '5' },
    });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(false);
    expect(session.write).toHaveBeenCalled();
    expect(res.body.applied.some((r) => r.op === 'create' && r.ok)).toBe(true);
  });

  it('apply throws unexpectedly: responds 500 without hanging, raw error not forwarded', async () => {
    process.env.CONFIG_RESTORE_ENABLED = 'true';
    const { app, session } = buildApp({
      sourceBaseUrl: 'https://ctrl-a.example',
      sessionBaseUrl: 'https://ctrl-a.example',
      write: vi.fn().mockRejectedValue(new Error('socket hang up: some internal detail')),
    });

    const res = await request(app, {
      method: 'POST',
      path: '/api/config/restore',
      body: { snapshotId: 5, confirm: '5' },
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('restore failed');
    expect(JSON.stringify(res.body)).not.toContain('some internal detail');
    expect(session.write).toHaveBeenCalled();
  });

  it('mismatched source + confirm + enabled: rejects with 409 and never writes', async () => {
    process.env.CONFIG_RESTORE_ENABLED = 'true';
    const { app, session } = buildApp({
      sourceBaseUrl: 'https://ctrl-b.example',
      sessionBaseUrl: 'https://ctrl-a.example',
    });

    const res = await request(app, {
      method: 'POST',
      path: '/api/config/restore',
      body: { snapshotId: 5, confirm: '5' },
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/different controller/i);
    expect(res.body.snapshotSource).toBe('https://ctrl-b.example');
    expect(res.body.target).toBe('https://ctrl-a.example');
    expect(res.body.plan).toBeDefined();
    expect(session.write).not.toHaveBeenCalled();
  });

  it('unknown source (no sourceBaseUrl) + confirm + enabled: rejects with 409 and never writes', async () => {
    process.env.CONFIG_RESTORE_ENABLED = 'true';
    const { app, session } = buildApp({
      sourceBaseUrl: null,
      sessionBaseUrl: 'https://ctrl-a.example',
    });

    const res = await request(app, {
      method: 'POST',
      path: '/api/config/restore',
      body: { snapshotId: 5, confirm: '5' },
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no recorded source controller/i);
    expect(res.body.plan).toBeDefined();
    expect(session.write).not.toHaveBeenCalled();
  });

  it('unknown source, dry run: plan is returned with a refusal warning', async () => {
    const { app, session } = buildApp({
      sourceBaseUrl: null,
      sessionBaseUrl: 'https://ctrl-a.example',
    });

    const res = await request(app, {
      method: 'POST',
      path: '/api/config/restore',
      body: { snapshotId: 5 },
    });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.warning).toMatch(/no recorded source controller/i);
    expect(session.write).not.toHaveBeenCalled();
  });

  it('mismatched source, dry run: plan is returned with a warning naming both URLs', async () => {
    const { app, session } = buildApp({
      sourceBaseUrl: 'https://ctrl-b.example',
      sessionBaseUrl: 'https://ctrl-a.example',
    });

    const res = await request(app, {
      method: 'POST',
      path: '/api/config/restore',
      body: { snapshotId: 5 },
    });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.warning).toContain('https://ctrl-b.example');
    expect(res.body.warning).toContain('https://ctrl-a.example');
    expect(res.body.plan).toBeDefined();
    expect(session.write).not.toHaveBeenCalled();
  });

  it('matching source, dry run: warning is null', async () => {
    const { app } = buildApp({
      sourceBaseUrl: 'https://ctrl-a.example',
      sessionBaseUrl: 'https://ctrl-a.example',
    });

    const res = await request(app, {
      method: 'POST',
      path: '/api/config/restore',
      body: { snapshotId: 5 },
    });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.warning).toBeNull();
  });
});
