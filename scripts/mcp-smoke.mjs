#!/usr/bin/env node
/**
 * End-to-end smoke test for AURA's /mcp endpoint using the official MCP client.
 *
 *   MCP_URL=https://integration.up.railway.app/mcp MCP_TOKEN=... node scripts/mcp-smoke.mjs
 *
 * Exercises the whole surface — tools, resources, prompts — against the live
 * Gateway behind the deployment, and prints one line per step with its timing.
 * Never prints the token. Exits non-zero if any step fails.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.env.MCP_URL;
const token = process.env.MCP_TOKEN;
if (!url || !token) {
  console.error('MCP_URL and MCP_TOKEN are required');
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'aura-mcp-smoke', version: '2.0.0' });
let failures = 0;

function parse(result) {
  const text = result.content?.[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function step(label, fn, summarise = () => '') {
  const t = Date.now();
  try {
    const out = await fn();
    const ms = Date.now() - t;
    const bad = out?.isError || out?.unavailable === true;
    if (bad) failures += 1;
    console.log(
      `${bad ? 'FAIL' : 'ok  '} ${label.padEnd(44)} ${String(ms).padStart(6)} ms  ${summarise(out)}`
    );
    return out;
  } catch (err) {
    failures += 1;
    console.log(
      `FAIL ${label.padEnd(44)} ${String(Date.now() - t).padStart(6)} ms  ${err.message}`
    );
    return null;
  }
}

const tool =
  (name, args = {}) =>
  async () => {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    if (res.isError) return { isError: true, text: res.content?.[0]?.text };
    return parse(res);
  };

await step(
  'connect',
  () => client.connect(transport),
  () => JSON.stringify(client.getServerVersion())
);
await step(
  'tools/list',
  () => client.listTools(),
  (o) => `${o.tools.length} tools`
);
await step(
  'resources/list',
  () => client.listResources(),
  (o) => o.resources.map((r) => r.uri).join(' ')
);
await step(
  'prompts/list',
  () => client.listPrompts(),
  (o) => o.prompts.map((p) => p.name).join(' ')
);

const ctx = await step('get_aura_context', tool('get_aura_context'), (o) =>
  JSON.stringify({
    gateway: o.gateway,
    estate: { sites: o.estate?.sites, aps: o.estate?.accessPoints, wlans: o.estate?.wlans },
    flex: o.telemetry?.clientReportService?.state,
  })
);
const firstSite = ctx?.estate?.siteNames?.[0]?.value ?? 'PrimarySite';

await step(
  'find_entity(Skynet)',
  tool('find_entity', { query: 'Skynet' }),
  (o) =>
    `total ${o.total}: wlans ${o.wlans?.length} clients ${o.clients?.length} aps ${o.accessPoints?.length}`
);
await step(
  `find_entity(${firstSite})`,
  tool('find_entity', { query: firstSite }),
  (o) => `site matches ${o.sites?.length}`
);
await step(
  'list_devices(offline)',
  tool('list_devices', { connected: false, includeRadios: false }),
  (o) => `offline ${o.accessPoints?.total} ${JSON.stringify(o.accessPoints?.statusCounts)}`
);
await step(
  'get_config(wlans index)',
  tool('get_config', { objectType: 'wlans' }),
  (o) => `${o.count} WLANs`
);
await step(
  'get_config(wlans, full Skynet)',
  tool('get_config', { objectType: 'wlans', name: 'Skynet' }),
  (o) => {
    const t = JSON.stringify(o);
    return `matched ${o.matched}, redacted markers ${(t.match(/\[redacted\]/g) ?? []).length}`;
  }
);
await step(
  'search_gateway_api(smart rf)',
  tool('search_gateway_api', { query: 'smart rf channel' }),
  (o) =>
    o.matches
      ?.slice(0, 3)
      .map((m) => m.path)
      .join(' ')
);
await step(
  'call_gateway_api(/v3/sites)',
  tool('call_gateway_api', { path: '/v3/sites', fields: ['siteName', 'country'] }),
  (o) => `total ${o.total}`
);
await step(
  'call_gateway_api(/v1/appkeys) refused',
  async () => {
    const o = await tool('call_gateway_api', { path: '/v1/appkeys' })();
    return o?.unavailable === true
      ? { refused: true, reason: o.reason }
      : { isError: true, text: 'NOT REFUSED' };
  },
  (o) => o.reason ?? ''
);
await step(
  `get_site_health(${firstSite})`,
  tool('get_site_health', { siteName: firstSite, worst: 3 }),
  (o) => JSON.stringify(o.summary ?? o.status ?? '').slice(0, 120)
);
await step(
  'get_service_levels',
  tool('get_service_levels'),
  (o) => `sites ${o.sites?.length ?? o.siteCount ?? '?'}`
);
await step(
  'get_alerts',
  tool('get_alerts'),
  (o) => `alerts ${o.alerts?.length ?? o.alertCount ?? '?'}`
);
await step(
  'get_recent_changes(24h)',
  tool('get_recent_changes', { hours: 24 }),
  (o) => `changes ${o.changes?.length ?? o.count ?? '?'}`
);
await step(
  'resources/read aura://guide',
  () => client.readResource({ uri: 'aura://guide' }),
  (o) => `${o.contents[0].text.length} chars`
);
await step(
  `resources/read site health`,
  () => client.readResource({ uri: `aura://sites/${encodeURIComponent(firstSite)}/health` }),
  (o) => `${o.contents[0].text.length} chars`
);
await step(
  'prompts/get troubleshoot_client',
  () => client.getPrompt({ name: 'troubleshoot_client', arguments: { client: 'laptop' } }),
  (o) => `${o.messages.length} message(s)`
);

await client.close();
console.log(failures ? `\n${failures} step(s) failed` : '\nall steps passed');
process.exit(failures ? 1 : 0);
