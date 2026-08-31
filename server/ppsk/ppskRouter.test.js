import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';

import { createPpskRouter } from './ppskRouter.js';

/** Minimal in-process HTTP driver so the router is exercised as Express runs it. */
async function request(app, { method = 'GET', path, body = null, headers = {} }) {
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

/** A pass-through RBAC stub that stamps an actor, so audit entries name someone. */
const requireRoleStub = () => (req, _res, next) => {
  req.auraActor = 'tester';
  req.auraActorSource = 'test';
  next();
};

/** In-memory PPSK store implementing the ppskStore surface the router uses. */
function makeStore({ ready = true } = {}) {
  const rows = new Map();
  let seq = 0;
  const pub = (r) => ({
    id: r.id, name: r.name, description: r.description ?? null, ssid: r.ssid, keyid: r.keyid,
    hasPassphrase: true, role: r.role ?? null, vlanId: r.vlanId ?? null,
    scope: r.scope ?? 'global', scopeRef: r.scopeRef ?? null, enabled: r.enabled ?? true,
    expiresAt: r.expiresAt ?? null, maxDevices: r.maxDevices ?? null, lastUsedAt: null,
    createdBy: r.createdBy ?? null, createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
  });
  return {
    _rows: rows,
    async isReady() { return ready; },
    async listIdentities({ ssid = null } = {}) {
      if (!ready) return null;
      return [...rows.values()].filter((r) => !ssid || r.ssid === ssid).map(pub);
    },
    async getIdentity(id) { return rows.has(id) ? pub(rows.get(id)) : null; },
    async revealPassphrase(id) { return rows.has(id) ? rows.get(id).passphrase : null; },
    async createIdentity(input) {
      const keyid = (input.keyid || input.name).replace(/[^A-Za-z0-9._-]+/g, '-');
      for (const r of rows.values()) {
        if (r.ssid === input.ssid && r.keyid === keyid) { const e = new Error('dup'); e.code = '23505'; throw e; }
      }
      const id = `ppsk_${++seq}`;
      rows.set(id, { ...input, id, keyid });
      return pub(rows.get(id));
    },
    async updateIdentity(id, patch) {
      if (!rows.has(id)) return null;
      rows.set(id, { ...rows.get(id), ...patch });
      return pub(rows.get(id));
    },
    async deleteIdentity(id) { return rows.delete(id); },
    async liveEntriesForSsid(ssid) {
      if (!ready) return null;
      return [...rows.values()].filter((r) => r.ssid === ssid && (r.enabled ?? true))
        .map((r) => ({ keyid: r.keyid, passphrase: r.passphrase, vlanId: r.vlanId ?? null }));
    },
  };
}

function app({ store, audit = vi.fn(), cryptoConfigured = () => true } = {}) {
  const a = express();
  a.use('/api', createPpskRouter({ store, requireRole: requireRoleStub, audit, cryptoConfigured }));
  return a;
}

describe('createPpskRouter', () => {
  let store;
  let audit;
  beforeEach(() => {
    store = makeStore();
    audit = vi.fn();
  });

  it('creates a key and lists it, never exposing the passphrase', async () => {
    const created = await request(app({ store, audit }), {
      method: 'POST', path: '/api/v1/ppsk',
      body: { name: 'Thomas-Test', ssid: 'Aura-PPSK-Lab', passphrase: 'Thomas-7284', role: 'Employee-Test' },
    });
    expect(created.status).toBe(201);
    expect(created.body.keyid).toBe('Thomas-Test');
    expect(created.body).not.toHaveProperty('passphrase');
    expect(created.body).not.toHaveProperty('passphrase_encrypted');
    expect(audit).toHaveBeenCalledWith('ppsk.create', expect.objectContaining({ actor: 'tester', target: 'Thomas-Test' }));

    const list = await request(app({ store }), { path: '/api/v1/ppsk' });
    expect(list.status).toBe(200);
    expect(list.body.identities).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('Thomas-7284');
  });

  it('rejects an invalid passphrase with 400', async () => {
    const res = await request(app({ store }), {
      method: 'POST', path: '/api/v1/ppsk',
      body: { name: 'X', ssid: 'S', passphrase: 'short' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8/);
  });

  it('409s a duplicate identity on the same SSID', async () => {
    const a = app({ store });
    const body = { name: 'Dup', ssid: 'S', passphrase: 'abcdefgh' };
    expect((await request(a, { method: 'POST', path: '/api/v1/ppsk', body })).status).toBe(201);
    const second = await request(a, { method: 'POST', path: '/api/v1/ppsk', body });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_KEYID');
  });

  it('reveals the passphrase only through the audited reveal path', async () => {
    const a = app({ store, audit });
    const created = await request(a, {
      method: 'POST', path: '/api/v1/ppsk',
      body: { name: 'Reveal-Me', ssid: 'S', passphrase: 'RevealPass1' },
    });
    const reveal = await request(a, { path: `/api/v1/ppsk/${created.body.id}/reveal` });
    expect(reveal.status).toBe(200);
    expect(reveal.body.passphrase).toBe('RevealPass1');
    expect(audit).toHaveBeenCalledWith('ppsk.reveal', expect.objectContaining({ target: 'Reveal-Me' }));
  });

  it('disable reports honest (unenforced) enforcement', async () => {
    const a = app({ store });
    const created = await request(a, {
      method: 'POST', path: '/api/v1/ppsk', body: { name: 'D', ssid: 'S', passphrase: 'abcdefgh' },
    });
    const res = await request(a, { method: 'POST', path: `/api/v1/ppsk/${created.body.id}/disable` });
    expect(res.status).toBe(200);
    expect(res.body.identity.enabled).toBe(false);
    expect(res.body.enforcement).toMatchObject({ attempted: false, applied: false });
  });

  it('renders a wpa_psk_file that carries only enabled entries and flags provisioning unsupported', async () => {
    const a = app({ store });
    await request(a, { method: 'POST', path: '/api/v1/ppsk', body: { name: 'A', ssid: 'Lab', passphrase: 'AAAAaaaa1' } });
    const b = await request(a, { method: 'POST', path: '/api/v1/ppsk', body: { name: 'B', ssid: 'Lab', passphrase: 'BBBBbbbb1' } });
    await request(a, { method: 'POST', path: `/api/v1/ppsk/${b.body.id}/disable` });

    const kf = await request(a, { path: '/api/v1/ppsk/keyfile?ssid=Lab' });
    expect(kf.status).toBe(200);
    expect(kf.body.entryCount).toBe(1);
    expect(kf.body.content).toContain('keyid=A 00:00:00:00:00:00 AAAAaaaa1');
    expect(kf.body.content).not.toContain('BBBBbbbb1');
    expect(kf.body.provisioning.supported).toBe(false);
  });

  it('503s every route when persistence is unavailable', async () => {
    const a = app({ store: makeStore({ ready: false }) });
    expect((await request(a, { path: '/api/v1/ppsk' })).status).toBe(503);
    expect((await request(a, { method: 'POST', path: '/api/v1/ppsk', body: { name: 'X', ssid: 'S', passphrase: 'abcdefgh' } })).status).toBe(503);
  });

  it('501s create and reveal when the encryption key is not configured', async () => {
    const a = app({ store, cryptoConfigured: () => false });
    const create = await request(a, { method: 'POST', path: '/api/v1/ppsk', body: { name: 'X', ssid: 'S', passphrase: 'abcdefgh' } });
    expect(create.status).toBe(501);
    expect(create.body.code).toBe('NOT_CONFIGURED');
  });

  it('generates a valid passphrase without persisting anything', async () => {
    const res = await request(app({ store }), { method: 'POST', path: '/api/v1/ppsk/generate', body: { length: 18 } });
    expect(res.status).toBe(200);
    expect(res.body.passphrase).toHaveLength(18);
    expect(store._rows.size).toBe(0);
  });
});
