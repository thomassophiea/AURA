/**
 * Client for the OS-ONE-CWP internal guest API.
 *
 * PostgresCWP belongs to the captive portal, which owns its schema and runs its
 * migrations. AURA reaches guest data through that service's REST surface
 * rather than by opening a second connection to its database: a direct
 * connection would make AURA a silent second writer with no schema ownership,
 * and it could not honour the portal-side rules (pre-authorization bypass,
 * revocation blocking) that live in the portal's own code.
 *
 * Reached over Railway private networking, so the token never crosses the
 * public internet.
 */

import { sanitizeMessage } from '../monitoring/errorSanitizer.js';

const DEFAULT_TIMEOUT_MS = 8_000;

export class CwpUnavailableError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name = 'CwpUnavailableError';
    this.status = status;
    this.cause = cause;
  }
}

/** Request rejected by the portal for a reason the operator can act on. */
export class CwpRequestError extends Error {
  constructor(message, { status, code = null, body = null } = {}) {
    super(message);
    this.name = 'CwpRequestError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Configuration, read at call time so a Railway variable change needs no rebuild. */
export function loadCwpConfig(env = process.env) {
  const baseUrl = (env.CWP_INTERNAL_API_URL ?? '').trim().replace(/\/+$/, '');
  const token = (env.CWP_INTERNAL_API_TOKEN ?? '').trim();
  const timeoutMs = Number(env.CWP_INTERNAL_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  return {
    baseUrl,
    token,
    timeoutMs,
    // Both halves are required. A base URL without a token would produce 401s
    // that read like an outage, so the feature reports itself unconfigured
    // instead.
    configured: Boolean(baseUrl && token),
  };
}

/**
 * One request against the internal API.
 *
 * Transport failures and 5xx become `CwpUnavailableError` (the UI shows a
 * degraded banner); 4xx becomes `CwpRequestError` (the UI shows the message).
 * The distinction matters: one is "try again later", the other is "you asked
 * for something impossible".
 */
export async function cwpRequest(
  path,
  { method = 'GET', body = null, actor = null, config = null, fetchFn = null } = {}
) {
  const cfg = config ?? loadCwpConfig();
  if (!cfg.configured) {
    throw new CwpUnavailableError('Guest portal service is not configured');
  }

  const fetchImpl = fetchFn ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  let response;
  try {
    response = await fetchImpl(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
        ...(actor ? { 'X-Actor': actor } : {}),
      },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new CwpUnavailableError(
      `Guest portal service unreachable: ${sanitizeMessage(error.message)}`,
      { cause: error }
    );
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) return payload ?? {};

  if (response.status >= 500 || response.status === 404) {
    // A 404 here is the route being absent (an old portal build) or the
    // internal API being disabled — both are "the service cannot serve this",
    // not "this guest does not exist". Per-resource 404s are handled by
    // callers that know the resource shape.
    throw new CwpUnavailableError('Guest portal service unavailable', {
      status: response.status,
    });
  }

  throw new CwpRequestError(payload?.error ?? `Guest portal returned ${response.status}`, {
    status: response.status,
    code: payload?.code ?? null,
    body: payload,
  });
}

export function listGuests(query, options = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return cwpRequest(`/api/internal/guests${qs ? `?${qs}` : ''}`, options);
}

export function getGuest(id, options = {}) {
  return cwpRequest(`/api/internal/guests/${encodeURIComponent(id)}`, options);
}

export function getSummary(tzOffsetMinutes, options = {}) {
  const qs =
    Number.isFinite(tzOffsetMinutes) ? `?tz_offset_minutes=${Math.trunc(tzOffsetMinutes)}` : '';
  return cwpRequest(`/api/internal/guests/summary${qs}`, options);
}

export function createGuest(body, options = {}) {
  return cwpRequest('/api/internal/guests', { ...options, method: 'POST', body });
}

export function revokeGuest(id, options = {}) {
  return cwpRequest(`/api/internal/guests/${encodeURIComponent(id)}/revoke`, {
    ...options,
    method: 'POST',
  });
}

export function deleteGuest(id, options = {}) {
  return cwpRequest(`/api/internal/guests/${encodeURIComponent(id)}`, {
    ...options,
    method: 'DELETE',
  });
}
