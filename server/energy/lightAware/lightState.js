/**
 * Normalize raw ambient-light telemetry into bright/dim/dark/unknown and debounce
 * transitions so brief fluctuations do not cause config churn (spec §5).
 * Unknown is never coerced to dark.
 */

export const DEFAULT_THRESHOLDS = { brightLux: 200, darkLux: 10 };
export const DEFAULT_HYSTERESIS = {
  dimDwellMinutes: 15,
  darkDwellMinutes: 30,
  restoreDwellMinutes: 5,
};

const ORDER = { dark: 0, dim: 1, bright: 2 };

export function normalizeLux(lux, reportedState, thresholds = DEFAULT_THRESHOLDS) {
  if (Number.isFinite(lux)) {
    if (lux >= thresholds.brightLux) return 'bright';
    if (lux <= thresholds.darkLux) return 'dark';
    return 'dim';
  }
  if (reportedState === 'light') return 'bright';
  if (reportedState === 'dark') return 'dark';
  return 'unknown';
}

/** Required dwell (seconds) for a candidate given the current state. */
function requiredDwellSeconds(prevState, candidate, h) {
  if (candidate === 'unknown') return 0; // fail-safe: surface loss of signal immediately
  if (candidate === 'dark') return (h.darkDwellMinutes ?? 30) * 60;
  if (candidate === 'dim') return (h.dimDwellMinutes ?? 15) * 60;
  // moving toward more light (bright) or lateral up
  if (ORDER[candidate] > ORDER[prevState]) return (h.restoreDwellMinutes ?? 5) * 60;
  return (h.dimDwellMinutes ?? 15) * 60;
}

export function commitTransition(prev, candidate, dwellSeconds, hysteresis = DEFAULT_HYSTERESIS) {
  if (candidate === prev.state) return { state: prev.state, committed: false };
  const need = requiredDwellSeconds(prev.state, candidate, hysteresis);
  if (dwellSeconds >= need) return { state: candidate, committed: true };
  return { state: prev.state, committed: false };
}
