/**
 * The single registry of active Energy demo overrides.
 *
 * Lives in its own module because two places need it — the API that sets it and
 * the trigger evaluation that must honour it — and because a second copy of
 * this state is exactly how a demo override gets left on by accident.
 *
 * In-process and deliberately NOT persisted: a forgotten override is the one
 * way this feature could quietly poison real history, so it dies with the
 * service. The simulated SAMPLES it writes are persisted, and permanently
 * marked `simulated`.
 */

/** sourceId -> { mode, startedAt, startedBy, timer } */
const overrides = new Map();

export const OVERRIDE_MODES = Object.freeze(['lights_off', 'lights_on', 'sensor_failure', 'reset']);

export function setOverride(sourceId, entry) {
  overrides.set(sourceId, entry);
}

export function clearOverride(sourceId) {
  const existing = overrides.get(sourceId);
  if (existing?.timer) clearInterval(existing.timer);
  overrides.delete(sourceId);
}

export function getOverride(sourceId) {
  return overrides.get(sourceId) ?? null;
}

/**
 * While an override is active, the sensor channel belongs to it.
 *
 * The real lightguard agents do NOT stop reporting during a demo — their
 * readings are real data and are still stored. But they must not be MIXED into
 * the trigger evaluation: a live "light" row arriving between two simulated
 * "dark" rows resets the dark run, and the persistence requirement can then
 * never be satisfied. Observed exactly that way on the first fallback run.
 *
 * So the evaluation reads only simulated samples while an override is active,
 * and only live ones otherwise. `sensor_failure` yields no simulated samples at
 * all, which is what makes it a faithful simulation of a dead sensor.
 *
 * @returns {'live'|'simulated'}
 */
export function evaluationSampleSource(sourceId) {
  return overrides.has(sourceId) ? 'simulated' : 'live';
}

export function describeOverride(sourceId) {
  const o = overrides.get(sourceId);
  if (!o) return { active: false, mode: 'live_sensor' };
  return {
    active: true,
    mode: o.mode,
    startedAt: o.startedAt,
    startedBy: o.startedBy ?? null,
    note:
      o.mode === 'sensor_failure'
        ? 'Simulated sensor failure: no sensor samples are being written, so no trigger can fire.'
        : 'Simulated sensor samples are being written. They are permanently marked simulated; ' +
          'the controller action and all power telemetry remain real. Live sensor readings are ' +
          'still recorded but are not used for the trigger while this is on.',
  };
}

/** Test support. */
export function __resetOverrides() {
  for (const [, o] of overrides) if (o.timer) clearInterval(o.timer);
  overrides.clear();
}
