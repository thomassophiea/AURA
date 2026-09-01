import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';

import { createPrivateSaeRouter } from './saeRouter.js';
import { canonicalMac } from './saeCredential.js';

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

const GOOD_PASS = 'pass-word-value-1234'; // 20 chars — meets the SAE minimum

/** In-memory Private SAE store implementing the surface the router uses. */
function makeStore({ ready = true } = {}) {
  const rows = new Map();
  const bindings = new Map(); // credentialId -> Map(mac -> binding)
  let seq = 0;
  let bseq = 0;
  const pub = (r) => ({
    id: r.id, name: r.name, description: r.description ?? null, email: r.email ?? null,
    ssid: r.ssid, keyid: r.keyid, hasPassphrase: true, akm: r.akm ?? 'wpa3-sae',
    role: r.role ?? null, vlanId: r.vlanId ?? null, usage: r.usage ?? 'multi',
    scope: r.scope ?? 'global', scopeRef: r.scopeRef ?? null, enabled: r.enabled ?? true,
    expiresAt: r.expiresAt ?? null, maxDevices: r.maxDevices ?? null, notify: r.notify ?? false,
    storeLocally: r.storeLocally ?? false, bindingCount: (bindings.get(r.id)?.size ?? 0),
    lastUsedAt: null, createdBy: r.createdBy ?? null,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  });
  return {
    _rows: rows,
    async isReady() { return ready; },
    async listCredentials({ ssid = null } = {}) {
      if (!ready) return null;
      return [...rows.values()].filter((r) => !ssid || r.ssid === ssid).map(pub);
    },
    async getCredential(id) { return rows.has(id) ? pub(rows.get(id)) : null; },
    async revealPassphrase(id) { return rows.has(id) ? rows.get(id).passphrase : null; },
    async createCredential(input) {
      const keyid = (input.keyid || input.name).replace(/[^A-Za-z0-9._-]+/g, '-');
      for (const r of rows.values()) {
        if (r.ssid === input.ssid && r.keyid === keyid) { const e = new Error('dup'); e.code = '23505'; throw e; }
      }
      const id = `psae_${++seq}`;
      rows.set(id, { ...input, id, keyid });
      bindings.set(id, new Map());
      return pub(rows.get(id));
    },
    async updateCredential(id, patch) {
      if (!rows.has(id)) return null;
      rows.set(id, { ...rows.get(id), ...patch });
      return pub(rows.get(id));
    },
    async deleteCredential(id) { bindings.delete(id); return rows.delete(id); },
    async listBindings(id) {
      return [...(bindings.get(id)?.values() ?? [])];
    },
    async countBindings(id) { return bindings.get(id)?.size ?? 0; },
    async upsertBinding(id, mac) {
      const canonical = canonicalMac(mac);
      const m = bindings.get(id) ?? new Map();
      bindings.set(id, m);
      const existed = m.has(canonical);
      const binding = { id: `psaeb_${++bseq}`, credentialId: id, mac: canonical, boundAt: '2026-09-01T00:00:00.000Z', lastSeen: '2026-09-01T00:00:00.000Z' };
      m.set(canonical, binding);
      return { created: !existed, binding };
    },
    async deleteBinding(id, mac) {
      const canonical = canonicalMac(mac);
      return Boolean(bindings.get(id)?.delete(canonical));
    },
    async liveEntriesForSsid(ssid) {
      if (!ready) return null;
      return [...rows.values()].filter((r) => r.ssid === ssid && (r.enabled ?? true))
        .map((r) => ({
          keyid: r.keyid, passphrase: r.passphrase, vlanId: r.vlanId ?? null,
          macs: [...(bindings.get(r.id)?.keys() ?? [])],
        }));
    },
  };
}

function app({ store, audit = vi.fn(), cryptoConfigured = () => true } = {}) {
  const a = express();
  a.use('/api', createPrivateSaeRouter({ store, requireRole: requireRoleStub, audit, cryptoConfigured }));
  return a;
}

describe('createPrivateSaeRouter', () => {
  let store;
  let audit;
  beforeEach(() => {
    store = makeStore();
    audit = vi.fn();
  });

  it('creates a credential and lists it, never exposing the passphrase', async () => {
    const created = await request(app({ store, audit }), {
      method: 'POST', path: '/api/v1/private-sae',
      body: { name: 'Thomas-Test', passphrase: GOOD_PASS, role: 'Employee-Test' },
    });
    expect(created.status).toBe(201);
    expect(created.body.keyid).toBe('Thomas-Test');
    expect(created.body.ssid).toBe('AURA_PSAE'); // default SSID
    expect(created.body.akm).toBe('wpa3-sae'); // default AKM
    expect(created.body.enforcement).toMatchObject({ attempted: false, applied: false });
    expect(created.body).not.toHaveProperty('passphrase');
    expect(audit).toHaveBeenCalledWith('sae.create', expect.objectContaining({ actor: 'tester', target: 'Thomas-Test' }));

    const list = await request(app({ store }), { path: '/api/v1/private-sae' });
    expect(list.status).toBe(200);
    expect(list.body.credentials).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(GOOD_PASS);
  });

  it('rejects a too-short passphrase with 400 (SAE minimum)', async () => {
    const res = await request(app({ store }), {
      method: 'POST', path: '/api/v1/private-sae',
      body: { name: 'X', passphrase: 'short' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 20/);
  });

  it('409s a duplicate identity on the same SSID', async () => {
    const a = app({ store });
    const body = { name: 'Dup', ssid: 'S', passphrase: GOOD_PASS };
    expect((await request(a, { method: 'POST', path: '/api/v1/private-sae', body })).status).toBe(201);
    const second = await request(a, { method: 'POST', path: '/api/v1/private-sae', body });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_KEYID');
  });

  it('reveals the passphrase only through the audited reveal path', async () => {
    const a = app({ store, audit });
    const created = await request(a, {
      method: 'POST', path: '/api/v1/private-sae',
      body: { name: 'Reveal-Me', passphrase: GOOD_PASS },
    });
    const reveal = await request(a, { path: `/api/v1/private-sae/${created.body.id}/reveal` });
    expect(reveal.status).toBe(200);
    expect(reveal.body.passphrase).toBe(GOOD_PASS);
    expect(audit).toHaveBeenCalledWith('sae.reveal', expect.objectContaining({ target: 'Reveal-Me' }));
  });

  it('disable reports honest (unenforced) enforcement', async () => {
    const a = app({ store });
    const created = await request(a, {
      method: 'POST', path: '/api/v1/private-sae', body: { name: 'D', passphrase: GOOD_PASS },
    });
    const res = await request(a, { method: 'POST', path: `/api/v1/private-sae/${created.body.id}/disable` });
    expect(res.status).toBe(200);
    expect(res.body.credential.enabled).toBe(false);
    expect(res.body.enforcement).toMatchObject({ attempted: false, applied: false });
  });

  it('renders a native-safe sae_password file: wildcard, mac-bound, vlan ordering, no on-air id', async () => {
    const a = app({ store });
    // Wildcard credential (no binding), no VLAN.
    await request(a, { method: 'POST', path: '/api/v1/private-sae', body: { name: 'Solo', ssid: 'Lab', passphrase: 'AAAA-value-solo-1234' } });
    // Bound credential with a VLAN and two enrolled MACs.
    const shared = await request(a, { method: 'POST', path: '/api/v1/private-sae', body: { name: 'Shared', ssid: 'Lab', passphrase: 'BBBB-value-shar-1234', vlanId: 40 } });
    await request(a, { method: 'POST', path: `/api/v1/private-sae/${shared.body.id}/enroll`, body: { mac: 'A4:83:E7:2C:19:D0' } });
    await request(a, { method: 'POST', path: `/api/v1/private-sae/${shared.body.id}/enroll`, body: { mac: 'B4:83:E7:2C:19:D1' } });
    // Disabled credential must not appear.
    const off = await request(a, { method: 'POST', path: '/api/v1/private-sae', body: { name: 'Off', ssid: 'Lab', passphrase: 'CCCC-value-offf-1234' } });
    await request(a, { method: 'POST', path: `/api/v1/private-sae/${off.body.id}/disable` });

    const kf = await request(a, { path: '/api/v1/private-sae/keyfile?ssid=Lab' });
    expect(kf.status).toBe(200);
    expect(kf.body.provisioning.supported).toBe(false);
    // Wildcard line: no |mac=; keyid carried as a comment, never as an on-air id.
    expect(kf.body.content).toContain('sae_password=AAAA-value-solo-1234');
    expect(kf.body.content).toContain('# keyid=Solo');
    // Bound lines: one per MAC, mac then vlanid, no id (native-client-safe).
    expect(kf.body.content).toContain('sae_password=BBBB-value-shar-1234|mac=a4:83:e7:2c:19:d0|vlanid=40');
    expect(kf.body.content).toContain('sae_password=BBBB-value-shar-1234|mac=b4:83:e7:2c:19:d1|vlanid=40');
    expect(kf.body.content).not.toContain('|id='); // proven on hardware: id= breaks native association
    // Disabled credential excluded.
    expect(kf.body.content).not.toContain('CCCC-value-offf-1234');
  });

  it('enrolls a MAC and refuses a new one past maxDevices with 409', async () => {
    const a = app({ store, audit });
    const created = await request(a, {
      method: 'POST', path: '/api/v1/private-sae',
      body: { name: 'Capped', passphrase: GOOD_PASS, maxDevices: 1 },
    });
    const first = await request(a, { method: 'POST', path: `/api/v1/private-sae/${created.body.id}/enroll`, body: { mac: 'A4:83:E7:2C:19:D0' } });
    expect(first.status).toBe(201);
    expect(first.body.binding.mac).toBe('a4:83:e7:2c:19:d0');
    expect(audit).toHaveBeenCalledWith('sae.enroll', expect.objectContaining({ target: 'Capped' }));

    // Re-enrolling the SAME mac is idempotent (200), not a 409.
    const again = await request(a, { method: 'POST', path: `/api/v1/private-sae/${created.body.id}/enroll`, body: { mac: 'a4-83-e7-2c-19-d0' } });
    expect(again.status).toBe(200);

    // A NEW mac past the ceiling is refused.
    const over = await request(a, { method: 'POST', path: `/api/v1/private-sae/${created.body.id}/enroll`, body: { mac: 'B4:83:E7:2C:19:D1' } });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('MAX_DEVICES');
  });

  it('400s an enroll with a missing or malformed MAC', async () => {
    const a = app({ store });
    const created = await request(a, { method: 'POST', path: '/api/v1/private-sae', body: { name: 'M', passphrase: GOOD_PASS } });
    expect((await request(a, { method: 'POST', path: `/api/v1/private-sae/${created.body.id}/enroll`, body: {} })).status).toBe(400);
    expect((await request(a, { method: 'POST', path: `/api/v1/private-sae/${created.body.id}/enroll`, body: { mac: 'nope' } })).status).toBe(400);
  });

  it('lists and revokes a binding', async () => {
    const a = app({ store });
    const created = await request(a, { method: 'POST', path: '/api/v1/private-sae', body: { name: 'B', passphrase: GOOD_PASS } });
    await request(a, { method: 'POST', path: `/api/v1/private-sae/${created.body.id}/enroll`, body: { mac: 'A4:83:E7:2C:19:D0' } });
    const list = await request(a, { path: `/api/v1/private-sae/${created.body.id}/bindings` });
    expect(list.status).toBe(200);
    expect(list.body.bindings).toHaveLength(1);

    const del = await request(a, { method: 'DELETE', path: `/api/v1/private-sae/${created.body.id}/bindings/a4:83:e7:2c:19:d0` });
    expect(del.status).toBe(200);
    expect(del.body.outcome).toBe('REVOKED');
    const after = await request(a, { path: `/api/v1/private-sae/${created.body.id}/bindings` });
    expect(after.body.bindings).toHaveLength(0);
  });

  it('503s every route when persistence is unavailable', async () => {
    const a = app({ store: makeStore({ ready: false }) });
    expect((await request(a, { path: '/api/v1/private-sae' })).status).toBe(503);
    expect((await request(a, { method: 'POST', path: '/api/v1/private-sae', body: { name: 'X', passphrase: GOOD_PASS } })).status).toBe(503);
  });

  it('501s create and reveal when the encryption key is not configured', async () => {
    const a = app({ store, cryptoConfigured: () => false });
    const create = await request(a, { method: 'POST', path: '/api/v1/private-sae', body: { name: 'X', passphrase: GOOD_PASS } });
    expect(create.status).toBe(501);
    expect(create.body.code).toBe('NOT_CONFIGURED');
  });

  it('generates a valid passphrase without persisting anything', async () => {
    const res = await request(app({ store }), { method: 'POST', path: '/api/v1/private-sae/generate', body: { length: 28 } });
    expect(res.status).toBe(200);
    expect(res.body.passphrase).toHaveLength(28);
    expect(store._rows.size).toBe(0);
  });
});
