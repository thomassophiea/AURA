/**
 * Backfill planning.
 *
 * The controller's report endpoints accept a `duration` token (3H, 24H, 7D,
 * 30D) and return source-timestamped buckets, so a gap CAN be re-requested
 * after an outage — but only for the windows that build actually supports.
 *
 * On XCC 10.18.1.0-011R, `duration=24H|7D|30D` return HTTP 500 for every AP
 * widget while `3H` works. So support is PROBED per source and recorded in
 * `monitored_sources.capabilities`, never assumed. When the window a gap needs
 * is unsupported, we request the largest window that is, and the remainder of
 * the gap stays a gap. AURA does not claim to recover samples the source never
 * gave it.
 */

/** Durations the controller accepts, ascending. */
export const DURATIONS = Object.freeze([
  { token: '3H', hours: 3, defaultResolution: 15 },
  { token: '24H', hours: 24, defaultResolution: 60 },
  { token: '7D', hours: 168, defaultResolution: 360 },
  { token: '30D', hours: 720, defaultResolution: 1440 },
]);

const HOUR_MS = 60 * 60 * 1000;

/** Durations known to work for a source, ascending; `3H` is assumed until probed. */
export function supportedDurations(capabilities) {
  const probed = capabilities?.durations ?? null;
  if (!probed) return [DURATIONS[0]];
  const supported = DURATIONS.filter((d) => probed[d.token] === true);
  return supported.length > 0 ? supported : [DURATIONS[0]];
}

/**
 * Choose the request window for the next poll.
 *
 * @param {object} params
 * @param {Date|null} params.cursor Last observed timestamp for this series.
 * @param {Date} params.now
 * @param {object} params.capabilities Probed source capabilities.
 * @param {number} params.retentionDays Bounds how far back we will ever ask.
 * @returns {{ duration: string, resolution: number, coversFrom: Date,
 *             gapHours: number, fullyCovered: boolean, reason: string }}
 */
export function planCollectionWindow({ cursor, now, capabilities, retentionDays }) {
  const available = supportedDurations(capabilities);
  const smallest = available[0];
  const largest = available[available.length - 1];

  // Never ask for more than we would keep.
  const retentionHours = retentionDays * 24;

  if (!cursor) {
    // First contact: take the largest supported window inside retention, so a
    // fresh deployment starts with whatever history the controller still holds.
    const candidate =
      [...available].reverse().find((d) => d.hours <= retentionHours) ?? smallest;
    return {
      duration: candidate.token,
      resolution: candidate.defaultResolution,
      coversFrom: new Date(now.getTime() - candidate.hours * HOUR_MS),
      gapHours: candidate.hours,
      fullyCovered: true,
      reason: 'initial',
    };
  }

  const gapMs = Math.max(0, now.getTime() - cursor.getTime());
  const gapHours = gapMs / HOUR_MS;
  const cappedGapHours = Math.min(gapHours, retentionHours);

  // Smallest window that covers the gap; if none does, the largest available.
  const chosen = available.find((d) => d.hours >= cappedGapHours) ?? largest;
  const fullyCovered = chosen.hours >= cappedGapHours;

  return {
    duration: chosen.token,
    resolution: chosen.defaultResolution,
    coversFrom: new Date(now.getTime() - chosen.hours * HOUR_MS),
    gapHours: cappedGapHours,
    fullyCovered,
    reason: gapHours <= smallest.hours ? 'incremental' : 'backfill',
  };
}

/**
 * Describe a gap the source cannot fill, for logging and for UI copy.
 * Returns null when the window covers everything.
 */
export function describeUnrecoverableGap(plan, cursor) {
  if (!plan || plan.fullyCovered || !cursor) return null;
  return {
    from: cursor,
    to: plan.coversFrom,
    hours: Number((plan.gapHours - toHours(plan.duration)).toFixed(2)),
    reason: `The source does not support a window long enough to cover this gap (largest available: ${plan.duration}).`,
  };
}

function toHours(token) {
  return DURATIONS.find((d) => d.token === token)?.hours ?? 0;
}

/**
 * Probe which `duration` values a source accepts.
 *
 * Each probe is a real, cheap request; a 5xx means that window is broken on
 * this build. Results are merged into `capabilities` so the probe runs rarely,
 * not on every poll.
 *
 * @param {(duration: string) => Promise<{ ok: boolean, status: number|null }>} attempt
 * @returns {Promise<{ durations: Record<string, boolean> }>}
 */
export async function probeDurations(attempt) {
  const durations = {};
  for (const { token } of DURATIONS) {
    try {
      const result = await attempt(token);
      durations[token] = result.ok === true;
    } catch {
      durations[token] = false;
    }
  }
  return { durations };
}

/** Re-probe at most this often; controller capability does not change hourly. */
export const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

export function capabilitiesAreStale(capabilities, now = new Date()) {
  const probedAt = capabilities?.durationsProbedAt;
  if (!probedAt) return true;
  const age = now.getTime() - new Date(probedAt).getTime();
  return !Number.isFinite(age) || age > CAPABILITY_TTL_MS;
}
