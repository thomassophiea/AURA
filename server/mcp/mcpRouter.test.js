import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import {
  createMcpRouter,
  buildCatalogue,
  MCP_TOOLS,
  KEEP_ALIVE_MS,
  INERT_SESSION,
} from './mcpRouter.js';
import { createDiagnosticTools, RISK } from '../cortex/diagnosticTools.js';
import { NATIVE_TOOLS } from './auraTools.js';

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
  return req
    .send({ jsonrpc: '2.0', id: 1, method, params })
    .buffer(true)
    .parse((res, cb) => {
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
  it('exposes every read/diagnostic Cortex tool and nothing else, built from the real specs', () => {
    const real = createDiagnosticTools({ session: INERT_SESSION, scope: {} });
    const catalogue = buildCatalogue(real);
    const readable = Object.entries(real)
      .filter(([, t]) => t.risk === RISK.READ || t.risk === RISK.DIAGNOSTIC)
      .map(([k]) => k)
      .sort();
    expect(MCP_TOOLS.map((e) => e.cortex).sort()).toEqual(readable);
    expect(new Set(catalogue.map((t) => t.name)).size).toBe(catalogue.length);
    expect(catalogue.map((t) => t.name)).toContain('get_site_health');
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
      // A tool may declare siteName itself; a site-scoped one must always have it.
      if (entry.siteScoped) expect(has).toBe(true);
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
    app.use(
      createMcpRouter({
        enabled: false,
        token: TOKEN,
        resolveSession: vi.fn(),
        createTools: vi.fn(),
      })
    );
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
    const { app } = makeApp({
      oauthIssuer: 'https://idp.example',
      publicBaseUrl: 'https://aura.example',
    });
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
    const names = body.result.tools.map((t) => t.name);
    expect(names).toHaveLength(MCP_TOOLS.length + NATIVE_TOOLS.length);
    for (const n of [
      'get_aura_context',
      'find_entity',
      'list_devices',
      'get_config',
      'search_gateway_api',
      'call_gateway_api',
    ]) {
      expect(names).toContain(n);
    }
    for (const t of body.result.tools) expect(t.annotations.readOnlyHint).toBe(true);
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
    const { body } = await call(app, 'tools/call', {
      name: 'diagnose_client',
      arguments: { mac: '00:11:22:33:44:55' },
    });
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload).toMatchObject({ basis: 'observed', tool: 'diagnoseClient' });
    expect(audit).toHaveBeenCalledWith(
      'mcp.tool',
      expect.objectContaining({
        actor: 'mcp-token',
        source: 'mcp',
        detail: expect.objectContaining({ tool: 'diagnose_client', ok: true }),
      })
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
        t.listSites = {
          ...t.listSites,
          handler: async () => {
            throw new Error('gateway timeout');
          },
        };
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

/** A fake Gateway: canned GET responses keyed by path (query string ignored). */
function fakeGateway(routes) {
  const seen = [];
  return {
    seen,
    session: {
      baseUrl: '',
      get: async (path) => {
        seen.push(path);
        const key = path.split('?')[0];
        if (!(key in routes))
          return { ok: false, status: 404, data: null, errorSummary: 'not found' };
        return { ok: true, status: 200, data: routes[key], errorSummary: null };
      },
    },
  };
}

const GW = {
  '/v3/sites': [
    { id: 's1', siteName: 'PrimarySite' },
    { id: 's2', siteName: 'EAL-PT-A' },
  ],
  '/v3/sites/s1/stations': [
    {
      macAddress: 'AC:16:15:27:46:40',
      ipAddress: '10.0.0.5',
      dhcpHostName: 'laptop-1',
      serviceId: 'w1',
      siteId: 's1',
      accessPointName: 'AP-1',
      rss: -60,
    },
  ],
  '/v3/sites/s2/stations': [],
  '/v1/aps/query': [
    {
      apName: 'AP-1',
      serialNumber: 'SER1',
      hostSite: 'PrimarySite',
      status: 'InService',
      sysUptime: 100,
      macAddress: 'aa:bb:cc:00:00:01',
      radios: [],
    },
    {
      apName: 'AP-2',
      serialNumber: 'SER2',
      hostSite: 'EAL-PT-A',
      status: 'critical',
      sysUptime: 0,
      pwrUsage: 0,
      radios: [{ radioIndex: 1 }],
    },
  ],
  '/v1/services': [
    {
      id: 'w1',
      ssid: 'Skynet',
      serviceName: 'Skynet',
      privacy: { WpaPskElement: { presharedKey: 'hunter2-secret', keyHexEncoded: false } },
    },
  ],
  '/v1/aaapolicy': [
    {
      id: 'a1',
      name: 'Corp',
      authenticationRadiusServers: [{ ip: '10.1.1.1', sharedSecret: 'radius-secret' }],
    },
  ],
};

function makeGatewayApp() {
  const gw = fakeGateway(GW);
  const made = makeApp({
    resolveSession: async () => ({ controllerUrl: 'https://gw.example', session: gw.session }),
  });
  return { ...made, gw };
}

async function toolJson(app, name, args = {}) {
  const { body } = await call(app, 'tools/call', { name, arguments: args });
  expect(body.result.isError).toBeUndefined();
  return JSON.parse(body.result.content[0].text);
}

describe('MCP native tools', () => {
  it('get_config redacts the WLAN passphrase and RADIUS secret', async () => {
    const { app } = makeGatewayApp();
    const wlan = await toolJson(app, 'get_config', { objectType: 'wlans', name: 'sky' });
    const text = JSON.stringify(wlan);
    expect(text).not.toContain('hunter2-secret');
    expect(text).toContain('[redacted]');
    expect(text).toContain('keyHexEncoded');
    const aaa = await toolJson(app, 'get_config', { objectType: 'aaa_policies', name: 'Corp' });
    expect(JSON.stringify(aaa)).not.toContain('radius-secret');
  });

  it('get_config without a name returns a compact index', async () => {
    const { app } = makeGatewayApp();
    const out = await toolJson(app, 'get_config', { objectType: 'wlans' });
    expect(out.count).toBe(1);
    expect(out.index[0].id).toBe('w1');
    expect(JSON.stringify(out)).not.toContain('privacy');
  });

  it('find_entity resolves a partial MAC to the client, its SSID and site', async () => {
    const { app } = makeGatewayApp();
    const out = await toolJson(app, 'find_entity', { query: '27-46-40' });
    expect(out.interpretedAs).toBe('mac');
    expect(out.clients).toHaveLength(1);
    expect(out.clients[0].ssid.value).toBe('Skynet');
    expect(out.clients[0].site.value).toBe('PrimarySite');
    expect(out.clients[0].next).toEqual({
      tool: 'diagnose_client',
      arguments: { mac: 'AC:16:15:27:46:40' },
    });
  });

  it('find_entity matches a site name and an SSID by text', async () => {
    const { app } = makeGatewayApp();
    const out = await toolJson(app, 'find_entity', { query: 'primary' });
    expect(out.sites.map((s) => s.id)).toEqual(['s1']);
    const ssid = await toolJson(app, 'find_entity', { query: 'skynet' });
    expect(ssid.wlans[0].id).toBe('w1');
  });

  it('list_devices marks an offline AP and drops its placeholder readings', async () => {
    const { app } = makeGatewayApp();
    const out = await toolJson(app, 'list_devices', {});
    const ap2 = out.accessPoints.rows.find((r) => r.serial === 'SER2');
    expect(ap2.connected).toBe(false);
    expect(ap2.poe).toBeNull();
    expect(ap2.radios).toBeNull();
    expect(out.accessPoints.statusCounts).toEqual({ InService: 1, offline: 1 });
  });

  it('list_devices reports a site-name mismatch instead of an empty site', async () => {
    const { app } = makeGatewayApp();
    const out = await toolJson(app, 'list_devices', { siteName: 'Nowhere' });
    expect(out.status).toBe('scope_matched_nothing');
  });

  it('call_gateway_api reads a catalogued path, pages and redacts', async () => {
    const { app, gw } = makeGatewayApp();
    const out = await toolJson(app, 'call_gateway_api', {
      path: '/v1/services',
      fields: ['ssid', 'privacy'],
    });
    expect(out.basis).toBe('observed');
    expect(out.total).toBe(1);
    expect(JSON.stringify(out)).not.toContain('hunter2-secret');
    expect(gw.seen).toContain('/v1/services');
  });

  it('call_gateway_api refuses credential paths without touching the Gateway', async () => {
    const { app, gw } = makeGatewayApp();
    const out = await toolJson(app, 'call_gateway_api', { path: '/v1/appkeys' });
    expect(out.unavailable).toBe(true);
    expect(gw.seen).toEqual([]);
  });

  it('get_aura_context counts the estate and offline APs', async () => {
    const { app } = makeGatewayApp();
    const out = await toolJson(app, 'get_aura_context');
    expect(out.estate.sites).toBe(2);
    expect(out.estate.accessPoints).toEqual({ total: 2, connected: 1, offline: 1 });
    expect(out.gateway).toBe('gw.example');
  });
});

describe('MCP resources and prompts', () => {
  it('lists static and live resources plus the site template', async () => {
    const { app } = makeApp();
    const { body } = await call(app, 'resources/list');
    const uris = body.result.resources.map((r) => r.uri);
    expect(uris).toEqual(
      expect.arrayContaining([
        'aura://guide',
        'aura://gateway-api/catalog',
        'aura://estate',
        'aura://sites',
      ])
    );
    const t = await call(app, 'resources/templates/list');
    expect(t.body.result.resourceTemplates[0].uriTemplate).toBe('aura://sites/{siteName}/health');
  });

  it('reads the guide', async () => {
    const { app } = makeApp();
    const { body } = await call(app, 'resources/read', { uri: 'aura://guide' });
    expect(body.result.contents[0].text).toContain('# AURA MCP guide');
  });

  it('reads site health through the template with the site bound to scope', async () => {
    const { app, scopes, calls } = makeApp();
    const { body } = await call(app, 'resources/read', { uri: 'aura://sites/EAL-PT-A/health' });
    expect(JSON.parse(body.result.contents[0].text).tool).toBe('getSiteOverview');
    expect(scopes.at(-1).siteNames).toEqual(['EAL-PT-A']);
    expect(calls.at(-1).args.siteName).toBe('EAL-PT-A');
  });

  it('serves the guided prompts and validates required arguments', async () => {
    const { app } = makeApp();
    const list = await call(app, 'prompts/list');
    expect(list.body.result.prompts.map((p) => p.name)).toContain('troubleshoot_client');
    const got = await call(app, 'prompts/get', {
      name: 'troubleshoot_client',
      arguments: { client: 'laptop-1' },
    });
    expect(got.body.result.messages[0].content.text).toContain('laptop-1');
    const bad = await call(app, 'prompts/get', { name: 'troubleshoot_client', arguments: {} });
    expect(bad.body.error).toBeDefined();
  });
});
