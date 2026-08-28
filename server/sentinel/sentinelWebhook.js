/**
 * Webhook dispatch for Sentinel alert routing.
 *
 * One POST per poll cycle carrying the actionable alerts that are new or
 * reopened in that cycle. Fire-and-forget with a short timeout and no retries:
 * a slow or broken receiver must never slow down or fail a poll.
 */

const DISPATCH_TIMEOUT_MS = 5_000;

/** A usable webhook target: http(s), nothing else. */
export function isValidWebhookUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * POST a payload to the webhook. Resolves { ok, status?, error? } — never throws.
 */
export async function dispatchWebhook(url, payload, { fetchFn = null } = {}) {
  if (!isValidWebhookUrl(url)) return { ok: false, error: 'invalid webhook URL' };

  const fn = fetchFn ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const resp = await fn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'AURA-Sentinel/1.0' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: resp.ok, status: resp.status };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

/** The payload shape receivers get. Exported so the test route sends the same shape. */
export function buildAlertPayload({ alerts, controllerUrl, siteId, event = 'sentinel.alerts' }) {
  return {
    event,
    source: 'aura-sentinel',
    controller: controllerUrl ?? null,
    siteId: siteId ?? null,
    timestamp: new Date().toISOString(),
    alerts: alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      check: a.checkName,
      message: a.message,
      target: a.target,
      firstSeenAt: a.firstSeenAt,
      occurrences: a.occurrences,
    })),
  };
}
