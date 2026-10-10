#!/usr/bin/env node
/**
 * End-to-end smoke test for AURA's /mcp endpoint using the official MCP client.
 *
 *   MCP_URL=https://integration.up.railway.app/mcp MCP_TOKEN=... node scripts/mcp-smoke.mjs
 *
 * Connects, lists tools, and calls list_sites then get_site_health for the first
 * site. Prints a summary and timings, never the token.
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
const client = new Client({ name: 'aura-mcp-smoke', version: '1.0.0' });

async function timed(label, fn) {
  const t = Date.now();
  const out = await fn();
  console.log(`${label}: ${Date.now() - t} ms`);
  return out;
}

function parse(result) {
  const text = result.content?.[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

await timed('connect', () => client.connect(transport));
console.log('server:', client.getServerVersion());

const { tools } = await timed('tools/list', () => client.listTools());
console.log('tools:', tools.map((t) => t.name).join(', '));

const sitesRes = await timed('list_sites', () =>
  client.callTool({ name: 'list_sites', arguments: {} }, undefined, { timeout: 120_000 })
);
const sites = parse(sitesRes);
console.log('list_sites isError:', Boolean(sitesRes.isError));
console.log(JSON.stringify(sites, null, 2).slice(0, 1500));

const siteList = sites?.sites ?? sites?.catalogue ?? [];
const first = siteList.find?.((s) => s.hasTelemetry) ?? siteList[0];
const firstName = first?.siteName ?? first?.name;
const siteName = typeof firstName === 'object' ? firstName?.value : firstName;

const healthRes = await timed(`get_site_health(${siteName ?? 'fleet'})`, () =>
  client.callTool(
    { name: 'get_site_health', arguments: siteName ? { siteName, worst: 3 } : { worst: 3 } },
    undefined,
    { timeout: 120_000 }
  )
);
console.log('get_site_health isError:', Boolean(healthRes.isError));
console.log(JSON.stringify(parse(healthRes), null, 2).slice(0, 1500));

await client.close();
