/**
 * Read-only passthrough to the Gateway REST API, for questions no curated tool
 * answers. The Meraki official MCP pairs `semantic_search` with a read-only
 * `execute_api`; this is AURA's equivalent, with three differences that matter:
 *
 * 1. GET ONLY, BY CONSTRUCTION. The catalogue is built from GET operations
 *    alone (scripts/build-mcp-api-catalog.mjs → gatewayApiCatalog.js). A path is called only when it
 *    matches a catalogue template, so there is no method parameter to abuse.
 * 2. SECRETS NEVER LEAVE. Responses pass through `redactSecrets`, and paths
 *    whose whole purpose is credentials or files (administrators, API keys,
 *    trace and backup downloads) are refused outright.
 * 3. NETWORK STRINGS ARE MARKED. The payload is wrapped as untrusted, so SSIDs
 *    and hostnames inside it read as data, not instructions.
 */

import { redactSecrets, untrustedData } from './redact.js';
import catalogue from './gatewayApiCatalog.js';

/** Refused paths: credentials, file downloads, and encoded report frames. */
export const DENIED = [
  { re: /^\/v1\/administrators(\/|$)/, why: 'administrator accounts are not exposed over MCP' },
  { re: /^\/v1\/appkeys(\/|$)/, why: 'API keys are credentials and are not exposed over MCP' },
  {
    re: /\/(downloadtrace|traceurls|clibackups)(\/|$)/,
    why: 'file downloads are not exposed over MCP',
  },
  { re: /^\/v1\/reports\/generated\//, why: 'file downloads are not exposed over MCP' },
  {
    re: /^\/(v1\/report\/flex|v3\/sites\/report\/flex)/,
    why: 'flex reports are compressed frames; use the Cortex client and RF tools, which decode them',
  },
];

/** Measured costs worth telling an agent before it waits on them. */
const NOTES = {
  '/v1/stations':
    'Slow: 16–30 s for the whole estate. Prefer /v3/sites/{siteId}/stations (≈0.01 s per site).',
  '/v1/auditlogs':
    'Requires startTime and endTime (epoch ms); without them the Gateway answers 422.',
  '/v1/aps/query': 'Fast inventory of every AP with radios, PoE and tunnel state.',
};

export const OPERATIONS = catalogue.operations
  .filter((op) => !DENIED.some((d) => d.re.test(op.path)))
  .map((op) => (NOTES[op.path] ? { ...op, note: NOTES[op.path] } : op));

export const CATALOGUE_SOURCE = catalogue.source;

const words = (s) =>
  String(s ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

/** Synonyms in the operator's vocabulary → the API's. */
const SYNONYMS = {
  wlan: ['services', 'service', 'ssid'],
  ssid: ['services', 'service'],
  wifi: ['services', 'radios'],
  client: ['stations', 'station'],
  clients: ['stations', 'station'],
  device: ['aps', 'switches'],
  devices: ['aps', 'switches'],
  ap: ['aps'],
  vlan: ['topologies', 'topology'],
  vlans: ['topologies'],
  radius: ['aaapolicy', 'aaa'],
  policy: ['roles', 'aaapolicy', 'rfmgmt'],
  firewall: ['roles'],
  channel: ['channels', 'radios', 'smartrf'],
  rf: ['rfmgmt', 'radios', 'smartrf'],
  mesh: ['meshpoints'],
  guest: ['eguest'],
  location: ['positioning', 'xlocation', 'rtlsprofile'],
  qos: ['cos', 'ratelimiters'],
  firmware: ['upgradeimagelist', 'deviceimages', 'softwareversion'],
  audit: ['auditlogs'],
};

/**
 * Rank GET operations against a free-text need. Scoring is lexical — path
 * segments weigh most, then tag and summary — which is enough for 190
 * operations and keeps the answer deterministic.
 */
export function searchOperations(query, { tag = null, limit = 15 } = {}) {
  const raw = words(query);
  const terms = new Set(raw.flatMap((w) => [w, ...(SYNONYMS[w] ?? [])]));
  const scored = [];
  for (const op of OPERATIONS) {
    if (tag && op.tag.toLowerCase() !== String(tag).toLowerCase()) continue;
    const pathWords = new Set(words(op.path.replace(/\{[^}]+\}/g, '')));
    const tagWords = new Set(words(op.tag));
    const textWords = new Set(words(`${op.summary} ${op.description ?? ''}`));
    let score = 0;
    for (const t of terms) {
      if (pathWords.has(t)) score += 4;
      if (tagWords.has(t)) score += 2;
      if (textWords.has(t)) score += 1;
    }
    if (!terms.size) score = 1;
    if (score > 0) scored.push({ op, score });
  }
  scored.sort((a, b) => b.score - a.score || a.op.path.length - b.op.path.length);
  return scored.slice(0, Math.max(1, Math.min(limit, 50))).map((s) => s.op);
}

export function listTags() {
  const counts = {};
  for (const op of OPERATIONS) counts[op.tag] = (counts[op.tag] ?? 0) + 1;
  return counts;
}

/** Match a concrete path to its catalogue template; literal segments win. */
export function matchOperation(path) {
  const segs = path.split('/').filter(Boolean);
  let best = null;
  for (const op of OPERATIONS) {
    const tpl = op.path.split('/').filter(Boolean);
    if (tpl.length !== segs.length) continue;
    let literal = 0;
    let ok = true;
    for (let i = 0; i < tpl.length; i += 1) {
      if (/^\{.+\}$/.test(tpl[i])) continue;
      if (tpl[i] !== segs[i]) {
        ok = false;
        break;
      }
      literal += 1;
    }
    if (ok && (!best || literal > best.literal)) best = { op, literal };
  }
  return best?.op ?? null;
}

const fail = (reason, extra = {}) => ({ basis: 'unknown', unavailable: true, reason, ...extra });

function project(row, fields) {
  if (!fields?.length || !row || typeof row !== 'object' || Array.isArray(row)) return row;
  const out = {};
  for (const f of fields) {
    const value = String(f)
      .split('.')
      .reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), row);
    if (value !== undefined) out[f] = value;
  }
  return out;
}

/**
 * GET one catalogued path.
 *
 * @param {{get: (path: string) => Promise<object>}} session
 * @param {{path: string, query?: object, fields?: string[], match?: string, limit?: number, offset?: number}} req
 */
export async function callGatewayApi(
  session,
  { path, query = {}, fields = null, match = null, limit = 50, offset = 0 }
) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return fail('path must be an absolute API path such as /v1/aps/query (without /management).');
  }
  const clean = path.replace(/^\/management(?=\/)/, '').split('?')[0];
  if (/(^|\/)\.\.?(\/|$)/.test(clean) || /[\s#\\]/.test(clean) || /%(2e|2f|5c)/i.test(clean)) {
    return fail('path contains characters that are not allowed.');
  }
  const denied = DENIED.find((d) => d.re.test(clean));
  if (denied) return fail(`Refused: ${denied.why}.`);
  const op = matchOperation(clean);
  if (!op) {
    return fail(
      `No read operation matches ${clean}. Use search_gateway_api to find the right path.`,
      {
        suggestions: searchOperations(clean, { limit: 5 }).map((o) => o.path),
      }
    );
  }

  const allowed = new Map(op.params.filter((p) => p.in === 'query').map((p) => [p.name, p]));
  const unknown = Object.keys(query ?? {}).filter((k) => !allowed.has(k));
  if (unknown.length) {
    return fail(`Unknown query parameter(s) for ${op.path}: ${unknown.join(', ')}.`, {
      allowedQueryParameters: [...allowed.keys()],
    });
  }
  const missing = [...allowed.values()]
    .filter((p) => p.required && query?.[p.name] == null)
    .map((p) => p.name);
  if (missing.length) return fail(`Missing required query parameter(s): ${missing.join(', ')}.`);

  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`
    )
    .join('&');
  const full = qs ? `${clean}?${qs}` : clean;

  const started = Date.now();
  const res = await session.get(full);
  const durationMs = Date.now() - started;
  if (!res.ok) {
    return fail(
      `The Gateway answered ${res.status || 'no response'} for GET ${full}: ${res.errorSummary ?? 'request failed'}.`,
      {
        status: res.status,
        durationMs,
      }
    );
  }

  let data = redactSecrets(res.data);
  const page = {
    limit: Math.max(1, Math.min(Number(limit) || 50, 500)),
    offset: Math.max(0, Number(offset) || 0),
  };
  const meta = {};
  if (Array.isArray(data)) {
    const needle = match ? String(match).toLowerCase() : null;
    const filtered = needle
      ? data.filter((r) => JSON.stringify(r).toLowerCase().includes(needle))
      : data;
    const slice = filtered.slice(page.offset, page.offset + page.limit);
    Object.assign(meta, {
      total: data.length,
      ...(needle ? { matched: filtered.length } : {}),
      returned: slice.length,
      offset: page.offset,
      hasMore: page.offset + slice.length < filtered.length,
    });
    data = slice.map((r) => project(r, fields));
  } else {
    data = project(data, fields);
  }

  return {
    basis: 'observed',
    source: `GET /management${full}`,
    operation: { path: op.path, tag: op.tag, summary: op.summary },
    durationMs,
    ...meta,
    ...(op.note ? { note: op.note } : {}),
    secretsRedacted: true,
    data: untrustedData(data),
  };
}
