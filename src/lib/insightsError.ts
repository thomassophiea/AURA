/**
 * Operator-facing message for a failed insights/report request.
 *
 * The API layer throws machine-oriented messages — e.g.
 * "SUPPRESSED_ANALYTICS_ERROR: Request timeout for /v1/report/stations/AA%3A…" —
 * whose prefix other call sites match on programmatically, so the throw site
 * cannot be softened. The translation to something a person can act on happens
 * here, at the display boundary. The failure *class* stays visible (timeout vs
 * auth vs other) because that is what tells an operator what to do next; the
 * URL-encoded endpoint spam does not.
 */
export function insightsErrorMessage(
  error: unknown,
  fallback = 'Failed to load insights.'
): string {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return fallback;

  if (/request timeout|timed out/i.test(raw)) {
    return 'The controller took too long to build this report. That is usually momentary — try again.';
  }
  if (/authentication required|session expired/i.test(raw)) {
    return 'The controller declined the reporting request. Refresh the page to renew your session.';
  }
  if (/rate.?limit/i.test(raw)) {
    return 'The controller is rate-limiting requests. Wait a moment, then try again.';
  }
  if (raw.includes('SUPPRESSED_ANALYTICS_ERROR') || raw.includes('SUPPRESSED_NON_CRITICAL_ERROR')) {
    return 'The controller could not build this report right now. Try again.';
  }
  // Unrecognized failures keep their real text — specificity beats politeness.
  return raw;
}
