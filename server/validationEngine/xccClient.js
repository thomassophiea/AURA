import https from 'node:https';

import { sanitizeMessage } from '../monitoring/errorSanitizer.js';

/**
 * Default agent for controller calls.
 *
 * Pooled and keep-alive: the collector, the sentinel checks and the aggregate
 * routes all call the controller repeatedly, and without an agent each call paid
 * a fresh TCP handshake and TLS negotiation. `rejectUnauthorized: false` is
 * unchanged behaviour — the controller presents a self-signed certificate and
 * every AURA path to it has always accepted that.
 */
const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 32,
  maxFreeSockets: 8,
});

/**
 * Low-level XCC request.
 *
 * Returns the response envelope instead of throwing, so callers that need the
 * status code (to distinguish "gateway is down" from "our token expired", or to
 * probe which `duration` values a controller supports) can see it. `fetchXcc`
 * keeps the original throw-on-error behaviour for existing callers.
 *
 * @returns {Promise<{ ok: boolean, status: number, data: any, errorText: string|null }>}
 */
export async function requestXcc(
  path,
  { authToken, controllerUrl, fetchFn, method = 'GET', body = null, timeoutMs = null, agent = null } = {}
) {
  if (!controllerUrl) throw new Error('controllerUrl is required');
  const fn = fetchFn ?? globalThis.fetch;
  const url = `${controllerUrl}/management${path}`;

  const init = {
    method,
    headers: {
      ...(authToken ? { Authorization: authToken } : {}),
      'Content-Type': 'application/json',
    },
  };
  if (body !== null) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  // Callers may supply their own agent (the collector honours
  // MONITORING_TLS_REJECT_UNAUTHORIZED); otherwise keep the permissive default
  // that the rest of AURA uses for self-signed controller certificates.
  if (!fetchFn && url.startsWith('https')) init.agent = agent ?? insecureAgent;

  // A hung controller must not hold a collector slot open indefinitely.
  let timer = null;
  if (timeoutMs) {
    const controller = new AbortController();
    init.signal = controller.signal;
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const resp = await fn(url, init);
    if (!resp.ok) {
      const errorText = await resp.text().catch(() => resp.statusText);
      return { ok: false, status: resp.status, data: null, errorText };
    }
    const data = await resp.json();
    return { ok: true, status: resp.status, data, errorText: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchXcc(path, options = {}) {
  const result = await requestXcc(path, options);
  if (!result.ok) {
    // Response bodies echo request headers on some builds; sanitize before it
    // reaches a log or an error store.
    throw new Error(`${result.status} ${path}: ${sanitizeMessage(result.errorText)}`);
  }
  return result.data;
}
