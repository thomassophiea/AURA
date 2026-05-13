import https from 'node:https';
import { getTool, isKnownTool } from './toolCatalog.js';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Truncate large JSON responses so the LLM context window doesn't explode.
 * Most callers want a few hundred rows max for reasoning purposes.
 */
function truncateResult(data) {
  if (Array.isArray(data)) {
    if (data.length > 50) {
      return { __truncated__: true, totalCount: data.length, sample: data.slice(0, 50) };
    }
    return data;
  }
  if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      const v = data[key];
      if (Array.isArray(v) && v.length > 50) {
        data[key] = { __truncated__: true, totalCount: v.length, sample: v.slice(0, 50) };
      }
    }
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
