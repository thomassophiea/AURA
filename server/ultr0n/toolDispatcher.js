import https from 'node:https';
import { getTool, isKnownTool } from './toolCatalog.js';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// Maximum sample size for any array we forward to the LLM. Picked so that a
// typical org-wide listAps response stays under ~3 KB after JSON serialisation.
const SAMPLE_CAP = 20;

// Field names that take up a lot of tokens but rarely help the LLM reason. We
// strip them before forwarding so the agent sees a useful shape, not a firehose.
const NOISY_FIELD_PATTERN = /^(rxBytes|txBytes|rxPackets|txPackets|totalBytes|raw|description|tags|uuid|reserved)$/i;

function compactItem(item) {
  if (item == null || typeof item !== 'object' || Array.isArray(item)) return item;
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (NOISY_FIELD_PATTERN.test(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // Drop nested objects deeper than 1 level — agents almost never need them
      // and they are the biggest single token sink.
      out[k] = '<object>';
    } else if (Array.isArray(v) && v.length > 5) {
      out[k] = { __truncated__: true, totalCount: v.length, sample: v.slice(0, 5) };
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Truncate large JSON responses so the LLM context window doesn't explode.
 * Strips noisy fields, caps arrays at SAMPLE_CAP items, flattens nested objects.
 */
function truncateResult(data) {
  if (Array.isArray(data)) {
    const sample = data.slice(0, SAMPLE_CAP).map(compactItem);
    if (data.length > SAMPLE_CAP) {
      return { __truncated__: true, totalCount: data.length, sample };
    }
    return sample;
  }
  if (data && typeof data === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (NOISY_FIELD_PATTERN.test(k)) continue;
      if (Array.isArray(v)) {
        out[k] =
          v.length > SAMPLE_CAP
            ? { __truncated__: true, totalCount: v.length, sample: v.slice(0, SAMPLE_CAP).map(compactItem) }
            : v.map(compactItem);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return data;
}

/**
 * Execute a single tool call.
 *
 * @returns {Promise<{ok: true, data: any, callMeta: object} | {ok: false, error: string, callMeta: object}>}
 */
export async function executeTool(name, args, { authToken, controllerUrl, fetchFn } = {}) {
  if (!isKnownTool(name)) {
    return { ok: false, error: `Unknown tool: ${name}`, callMeta: { tool: name, args } };
  }
  if (!controllerUrl) {
    return {
      ok: false,
      error: 'No controllerUrl configured for this request',
      callMeta: { tool: name, args },
    };
  }

  const tool = getTool(name);
  let path;
  try {
    path = tool.buildPath(args ?? {});
  } catch (err) {
    return {
      ok: false,
      error: `Invalid args for ${name}: ${err.message}`,
      callMeta: { tool: name, args },
    };
  }

  const fn = fetchFn ?? globalThis.fetch;
  const url = `${controllerUrl}/api/management${path}`;
  const init = {
    method: tool.method,
    headers: {
      Authorization: authToken ?? '',
      'Content-Type': 'application/json',
    },
  };
  if (!fetchFn && url.startsWith('https')) {
    init.agent = insecureAgent;
  }

  const startedAt = Date.now();
  const callMeta = { tool: name, method: tool.method, path, args, startedAt };

  try {
    const resp = await fn(url, init);
    callMeta.status = resp.status;
    callMeta.durationMs = Date.now() - startedAt;
    if (!resp.ok) {
      const body = await resp.text().catch(() => resp.statusText);
      return { ok: false, error: `${resp.status} ${body}`.slice(0, 500), callMeta };
    }
    const json = await resp.json();
    return { ok: true, data: truncateResult(json), callMeta };
  } catch (err) {
    callMeta.durationMs = Date.now() - startedAt;
    return { ok: false, error: err.message || String(err), callMeta };
  }
}
