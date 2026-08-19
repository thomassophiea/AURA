/**
 * The one concrete environmental trigger this phase (spec §17). Reads an AP's
 * open light-state transition into a normalized trigger signal. Missing signal
 * is 'unknown', never 'dark'.
 */
export function ambientLightTrigger(openTransition, now = new Date()) {
  if (!openTransition || !openTransition.to_state) {
    return { state: 'unknown', since: null, dwellSeconds: 0, confidence: 'low' };
  }
  const since = openTransition.entered_at;
  const dwellSeconds = Math.max(0, Math.round((now - new Date(since)) / 1000));
  return { state: openTransition.to_state, since, dwellSeconds, confidence: 'high' };
}
