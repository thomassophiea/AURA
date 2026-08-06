/**
 * Turns an arbitrary thrown value into a logged/stored/returned-safe shape.
 *
 * Two jobs:
 *  - Classify the failure, so backoff and the UI can distinguish "the gateway
 *    is down" from "our credentials expired".
 *  - Strip secrets. Controller URLs carry tokens in query strings, and error
 *    bodies echo request headers, so nothing raw is ever persisted or logged.
 */

const SECRET_QUERY_KEYS = [
  'token',
  'access_token',
  'refresh_token',
  'password',
  'passwd',
  'secret',
  'apikey',
  'api_key',
  'key',
  'authorization',
  'auth',
  'sig',
  'signature',
];

const REDACTED = '[redacted]';

/** Strip credentials, secret query params, and Bearer tokens out of a URL. */
export function sanitizeUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw));
    if (url.username || url.password) {
      url.username = '';
      url.password = '';
    }
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_KEYS.includes(key.toLowerCase())) {
        url.searchParams.set(key, REDACTED);
      }
    }
    return url.toString();
  } catch {
    // Not a URL (a bare path, say). Fall back to textual redaction.
    return sanitizeMessage(String(raw));
  }
}

/** Redact anything that looks like a secret inside free text. */
export function sanitizeMessage(raw, { maxLength = 300 } = {}) {
  if (raw === null || raw === undefined) return null;
  let text = String(raw);

  text = text.replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`);
  text = text.replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, `//${REDACTED}@`);
  text = text.replace(
    new RegExp(`\\b(${SECRET_QUERY_KEYS.join('|')})=([^&\\s"']+)`, 'gi'),
    `$1=${REDACTED}`
  );
  text = text.replace(
    /"(password|secret|token|access_token|refresh_token)"\s*:\s*"[^"]*"/gi,
    `"$1":"${REDACTED}"`
  );

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/**
 * Classify a failure into a stable, non-leaky category.
 *
 * @returns {'auth'|'timeout'|'network'|'upstream_client_error'|'upstream_server_error'|'malformed'|'database'|'unknown'}
 */
export function classifyError(error, { status } = {}) {
  if (status !== undefined && status !== null) {
    if (status === 401 || status === 403) return 'auth';
    if (status === 408 || status === 504) return 'timeout';
    if (status >= 500) return 'upstream_server_error';
    if (status >= 400) return 'upstream_client_error';
  }

  const name = error?.name ?? '';
  const code = error?.code ?? '';
  const message = String(error?.message ?? error ?? '');

  if (name === 'AbortError' || /timed? ?out|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(`${code} ${message}`)) {
    return 'timeout';
  }
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EAI_AGAIN|CERT_/i.test(
      `${code} ${message}`
    )) {
    return 'network';
  }
  if (name === 'SyntaxError' || /Unexpected token|not valid JSON|JSON at position/i.test(message)) {
    return 'malformed';
  }
  if (code && /^(28P01|3D000|08\d{3}|57P0\d)$/.test(String(code))) return 'database';
  return 'unknown';
}

/**
 * Full sanitized description of a failure, safe to store in
 * `monitored_sources.last_error_summary` and to return from the API.
 *
 * @returns {{ errorClass: string, summary: string, endpoint: string|null }}
 */
export function sanitizeError(error, { status, endpoint } = {}) {
  const errorClass = classifyError(error, { status });
  const base = error?.message ?? String(error ?? 'Unknown error');
  return {
    errorClass,
    summary: sanitizeMessage(base),
    endpoint: endpoint ? sanitizeUrl(endpoint) : null,
  };
}

/**
 * Public, human-facing phrasing per error class. Deliberately vague about
 * internals — an operator gets the category, not the controller's response.
 */
export const ERROR_CLASS_LABELS = Object.freeze({
  auth: 'Authentication to the source failed',
  timeout: 'The source did not respond in time',
  network: 'The source could not be reached',
  upstream_client_error: 'The source rejected the request',
  upstream_server_error: 'The source returned an error',
  malformed: 'The source returned an unreadable response',
  database: 'The monitoring database was unavailable',
  unknown: 'Collection failed',
});
