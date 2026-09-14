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

/** sourceId -> { mode, startedAt, startedBy, timer, fromShare, episodeId } */
const overrides = new Map();

export const OVERRIDE_MODES = Object.freeze(['lights_off', 'lights_on', 'sensor_failure', 'reset']);

export function setOverride(sourceId, entry) {
  overrides.set(sourceId, entry);
}

/**
 * The projected reduction share in effect at the moment a mode ends.
 *
 * Carried across a mode change so a lights-on recovery starts from where the
 * curve actually was rather than from the settled figure. Without it, toggling
 * off → on → off mid-ramp makes the projected line jump, which is the one thing
 * a fallback built to rescue a demo must not do. Defaults to 0 so a first
 * lights-off begins at the measured baseline.
 */
export function shareAtHandover(sourceId) {
  const existing = overrides.get(sourceId);
  return Number.isFinite(existing?.lastShare) ? existing.lastShare : 0;
}

/** Remember the share the projection has reached, for the next handover. */
export function recordShare(sourceId, share) {
  const existing = overrides.get(sourceId);
  if (existing && Number.isFinite(share)) existing.lastShare = share;
}

/**
 * Tie the live override to its persisted audit row.
 *
 * Mutates the existing entry rather than replacing it: the entry holds the
 * sensor-emit interval, and re-setting it from a partial copy would drop the
 * timer handle, leaving an interval running that nothing can ever clear.
 */
export function attachEpisode(sourceId, episodeId) {
  const existing = overrides.get(sourceId);
  if (existing) existing.episodeId = episodeId;
  return existing ?? null;
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
  if (!o) return { active: false, mode: 'live_sensor', projection: null };
  return {
    active: true,
    mode: o.mode,
    startedAt: o.startedAt,
    startedBy: o.startedBy ?? null,
    /**
     * Whether this override is also driving the display-layer projection.
     *
     * `lights_off`/`lights_on` do; `sensor_failure` does not, because a dead
     * sensor should look like a dead sensor. `fromShare` is what a recovery
     * ramps down from, and `episodeId` ties the live override to its persisted
     * audit row.
     */
    projection:
      o.mode === 'lights_off' || o.mode === 'lights_on'
        ? {
            mode: o.mode,
            startedAt: o.startedAt,
            fromShare: Number.isFinite(o.fromShare) ? o.fromShare : 0,
            episodeId: o.episodeId ?? null,
          }
        : null,
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
