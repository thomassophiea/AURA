import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createMcpRouter, buildCatalogue, MCP_TOOLS, KEEP_ALIVE_MS, INERT_SESSION } from './mcpRouter.js';
import { createDiagnosticTools, RISK } from '../cortex/diagnosticTools.js';

const TOKEN = 'test-token-0123456789';
const ACCEPT = 'application/json, text/event-stream';

/** Fake Cortex tool set: same names and risks as the real one, canned handlers. */
function fakeTools(calls = []) {
  const real = createDiagnosticTools({ session: INERT_SESSION, scope: {} });
  const out = {};
  for (const [name, tool] of Object.entries(real)) {
    out[name] = {
      ...tool,
      handler: async (args) => {
        calls.push({ name, args });
        return { basis: 'observed', tool: name, args };
      },
    };
  }
  return out;
}

function makeApp(overrides = {}) {
  const calls = [];
  const scopes = [];
  const audit = vi.fn();
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    createMcpRouter({
      enabled: true,
      token: TOKEN,
      resolveSession: async () => ({ controllerUrl: 'https://gw.example', session: {} }),
      createTools: ({ scope }) => {
        scopes.push(scope);
        return fakeTools(calls);
      },
      audit,
      ...overrides,
    })
  );
  return { app, calls, scopes, audit };
}

/** Parse a JSON-RPC response that may arrive as JSON or as an SSE stream. */
function rpcBody(res) {
  if (res.headers['content-type']?.includes('text/event-stream')) {
    const data = res.text
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)));
    return data[data.length - 1];
  }
  return res.body;
}

function rpc(app, method, params = {}, token = TOKEN) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', ACCEPT)
    .set('Content-Type', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req.send({ jsonrpc: '2.0', id: 1, method, params }).buffer(true).parse((res, cb) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (c) => (text += c));
    res.on('end', () => cb(null, text));
  });
}

async function call(app, method, params, token) {
  const res = await rpc(app, method, params, token);
  res.text = res.body;
  const ct = res.headers['content-type'] ?? '';
  if (ct.includes('application/json')) res.body = JSON.parse(res.text);
  return { res, body: rpcBody(res) };
}

describe('MCP catalogue', () => {
  it('exposes exactly the six read-only tools, built from the real Cortex specs', () => {
    const catalogue = buildCatalogue(createDiagnosticTools({ session: INERT_SESSION, scope: {} }));
    expect(catalogue.map((t) => t.name)).toEqual([
      'list_sites',
      'get_site_health',
      'get_service_levels',
      'find_client',
      'diagnose_client',
      'get_device_health',
    ]);
    for (const tool of catalogue) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('adds siteName only to site-scoped tools', () => {
    const catalogue = buildCatalogue(createDiagnosticTools({ session: INERT_SESSION, scope: {} }));
    const byName = Object.fromEntries(catalogue.map((t) => [t.name, t]));
    for (const entry of MCP_TOOLS) {
      const has = Boolean(byName[entry.name].inputSchema.properties.siteName);
      expect(has).toBe(entry.siteScoped);
    }
    expect(byName.diagnose_client.inputSchema.required).toEqual(['mac']);
  });

  it('refuses to build if a write tool is mapped in', () => {
    const tools = createDiagnosticTools({ session: INERT_SESSION, scope: {} });
    tools.listSites = { ...tools.listSites, risk: RISK.WRITE };
    expect(() => buildCatalogue(tools)).toThrow(/only read\/diagnostic/);
  });

  it('refuses to build if a mapped Cortex tool disappears', () => {
    const tools = createDiagnosticTools({ session: INERT_SESSION, scope: {} });
    delete tools.diagnoseClient;
    expect(() => buildCatalogue(tools)).toThrow(/diagnoseClient does not exist/);
  });

  it('arms the SSE keep-alive well inside the Railway 32 s first-byte window', () => {
    expect(KEEP_ALIVE_MS).toBeLessThan(32_000 / 2);
  });
});

describe('MCP auth', () => {
  it('mounts nothing when disabled', async () => {
    const app = express();
    app.use(createMcpRouter({ enabled: false, token: TOKEN, resolveSession: vi.fn(), createTools: vi.fn() }));
    const res = await request(app).post('/mcp').send({});
    expect(res.status).toBe(404);
  });

  it('fails closed with 503 when enabled without a token', async () => {
    const { app } = makeApp({ token: null });
    const { res } = await call(app, 'tools/list', {}, 'anything');
    expect(res.status).toBe(503);
  });

  it('rejects a missing token with 401 and a Bearer challenge', async () => {
    const { app } = makeApp();
    const { res } = await call(app, 'tools/list', {}, null);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer realm="aura"');
  });

  it('rejects a wrong token', async () => {
    const { app } = makeApp();
    const { res } = await call(app, 'tools/list', {}, 'wrong-token');
    expect(res.status).toBe(401);
  });

  it('serves no OAuth metadata when no issuer is configured', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(res.status).toBe(404);
  });

  it('publishes protected-resource metadata and points the challenge at it when an issuer is set', async () => {
    const { app } = makeApp({ oauthIssuer: 'https://idp.example', publicBaseUrl: 'https://aura.example' });
    const meta = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(meta.status).toBe(200);
    expect(meta.body).toEqual({
      resource: 'https://aura.example/mcp',
      authorization_servers: ['https://idp.example'],
      bearer_methods_supported: ['header'],
      resource_name: 'AURA',
    });
    const { res } = await call(app, 'tools/list', {}, null);
    expect(res.headers['www-authenticate']).toContain(
      'resource_metadata="https://aura.example/.well-known/oauth-protected-resource/mcp"'
    );
  });

  it('answers GET and DELETE with 405 (stateless server)', async () => {
    const { app } = makeApp();
    const get = await request(app).get('/mcp').set('Authorization', `Bearer ${TOKEN}`);
    const del = await request(app).delete('/mcp').set('Authorization', `Bearer ${TOKEN}`);
    expect(get.status).toBe(405);
    expect(del.status).toBe(405);
  });
});

describe('MCP protocol', () => {
  it('initializes and advertises instructions', async () => {
    const { app } = makeApp();
    const { res, body } = await call(app, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(res.status).toBe(200);
    expect(body.result.serverInfo.name).toBe('aura');
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.instructions).toMatch(/__untrusted__/);
  });

  it('lists the catalogue', async () => {
    const { app } = makeApp();
    const { body } = await call(app, 'tools/list');
    expect(body.result.tools).toHaveLength(6);
  });

  it('binds siteName into the Cortex scope and strips it from tools that do not declare it', async () => {
    const { app, calls, scopes } = makeApp();
    const { body } = await call(app, 'tools/call', {
      name: 'find_client',
      arguments: { query: 'aa:bb', siteName: 'EAL-PT-N' },
    });
    expect(body.result.isError).toBeUndefined();
    expect(scopes.at(-1)).toEqual({ controllerUrl: 'https://gw.example', siteNames: ['EAL-PT-N'] });
    expect(calls.at(-1)).toEqual({ name: 'findClient', args: { query: 'aa:bb' } });
  });

  it('passes siteName through to tools that declare it', async () => {
    const { app, calls } = makeApp();
    await call(app, 'tools/call', { name: 'get_site_health', arguments: { siteName: 'Lab' } });
    expect(calls.at(-1)).toEqual({ name: 'getSiteOverview', args: { siteName: 'Lab' } });
  });

  it('returns Cortex evidence as JSON text and audits the call', async () => {
    const { app, audit } = makeApp();
    const { body } = await call(app, 'tools/call', { name: 'diagnose_client', arguments: { mac: '00:11:22:33:44:55' } });
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload).toMatchObject({ basis: 'observed', tool: 'diagnoseClient' });
    expect(audit).toHaveBeenCalledWith(
      'mcp.tool',
      expect.objectContaining({ actor: 'mcp-token', source: 'mcp', detail: expect.objectContaining({ tool: 'diagnose_client', ok: true }) })
    );
  });

  it('reports an error result, not a crash, when no Gateway credentials exist', async () => {
    const { app } = makeApp({ resolveSession: async () => null });
    const { body } = await call(app, 'tools/call', { name: 'list_sites', arguments: {} });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/no Gateway service credentials/);
  });

  it('reports an error result when the tool throws', async () => {
    const { app } = makeApp({
      createTools: () => {
        const t = fakeTools();
        t.listSites = { ...t.listSites, handler: async () => { throw new Error('gateway timeout'); } };
        return t;
      },
    });
    const { body } = await call(app, 'tools/call', { name: 'list_sites', arguments: {} });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/gateway timeout/);
  });

  it('rejects an unknown tool', async () => {
    const { app } = makeApp();
    const { body } = await call(app, 'tools/call', { name: 'delete_wlan', arguments: {} });
    expect(body.result?.isError ?? Boolean(body.error)).toBe(true);
  });
});
