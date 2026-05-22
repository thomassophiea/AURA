/**
 * Sanitizes CortexPageContext before sending to an LLM.
 * Deep-clones the context, redacts sensitive string fields,
 * and truncates large arrays to reduce token usage.
 */

const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password', 'psk', 'secret', 'token', 'apiKey', 'api_key',
  'privateKey', 'private_key', 'sharedSecret', 'shared_secret',
  'radiusSecret', 'radius_secret', 'accessKey', 'access_key',
  'secretKey', 'secret_key', 'authKey', 'auth_key',
]);

function redactObject(obj, seen = new WeakSet()) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);
  if (Array.isArray(obj)) return obj.map((item) => redactObject(item, seen));

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key) && typeof value === 'string') {
      result[key] = REDACTED;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * @param {object | null | undefined} context
 * @returns {object | null | undefined}
 */
export function sanitizeCortexContext(context) {
  if (context === null || context === undefined) return context;

  const sanitized = redactObject(context);

  if (sanitized.visibleRowsSummary?.sampleRows) {
    sanitized.visibleRowsSummary.sampleRows =
      sanitized.visibleRowsSummary.sampleRows.slice(0, 5);
  }

  if (Array.isArray(sanitized.selectedRows) && sanitized.selectedRows.length > 10) {
    sanitized.selectedRows = sanitized.selectedRows.slice(0, 10);
  }

  return sanitized;
}
