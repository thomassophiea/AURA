/**
 * Laying the demo projection over an API response — and deciding when not to.
 *
 * PRECEDENCE, which is the whole point of this module
 * ---------------------------------------------------
 *   1. Real telemetry and real hardware behaviour.
 *   2. The existing calculated Energy figures.
 *   3. The demo projection — and ONLY on deliberate operator activation.
 *
 * So `decideOverlay` refuses in two directions. It refuses to project when no
 * operator switched the fallback on, which is what stops a data gap from
 * silently becoming a simulation. And it refuses to project when the real path
 * is already producing a supported measured claim, which is what stops the
 * fallback from overwriting a genuine result the hardware actually produced.
 *
 * Everything it does produce is stamped `DEMO_SIMULATED` and carries
 * `savings.provenance === 'simulated'`, which every existing consumer already
 * treats as "no controller change was made": the headline frames it, the
 * scenario extrapolation declines it, and the environmental report excludes it.
 * That was deliberate — reusing the existing provenance value means no
 * exclusion rule anywhere in the codebase had to be found and updated, and none
 * can be missed.
 *
 * The control side is never projected. It is the baseline of the entire story;
 * a simulated control would make the comparison meaningless.
 */

import { summarizeSide, attribute, projectSavings, assessQuality } from './analysis.js';
import {
  DEMO_SOURCE,
  MEASURED_RADIO_DISABLE_SHARE,
  projectApInstant,
  projectSeriesPoints,
  projectTreatmentRows,
} from './demoProjection.js';

/** Value-provenance vocabulary carried on every figure the API returns. */
export const VALUE_SOURCE = Object.freeze({
  REAL: 'REAL',
  CALCULATED: 'CALCULATED',
  DEMO_SIMULATED: DEMO_SOURCE,
});

/**
 * Should the projection be applied, and if not, why not?
 *
 * @param {object} args
 * @param {object|null} args.override describeOverride() output
 * @param {object|null} args.experiment the experiment row, if any
 * @param {object|null} args.savings the REAL savings payload, if any
 * @returns {{apply:boolean, reason:string, mode?:string, startedAt?:string, fromShare?:number}}
 */
export function decideOverlay({ override, experiment = null, savings = null }) {
  const projection = override?.projection ?? null;

  // (3) Deliberate activation is the only way in. A missing sensor, an empty
  // site, a dead controller — none of them reach this branch.
  if (!projection) return { apply: false, reason: 'no_override' };

  // `lights_on` is the exit from the simulated condition, not an entry into a
  // second one. It is projected only while the recovery curve is still running,
  // so that the return to normal is visible rather than a snap back to real
  // values; after that the real feed takes the screen again.
  const elapsed = (Date.now() - Date.parse(projection.startedAt)) / 1000;
  if (projection.mode === 'lights_on' && (!Number.isFinite(elapsed) || elapsed > 300)) {
    return { apply: false, reason: 'recovery_complete' };
  }

  // (1) Real wins. If the controller writes landed AND the measured window
  // supports a claim, the hardware is telling the story and the projection must
  // not touch it — the operator may have switched the fallback on as insurance
  // and then had the real path work anyway.
  if (
    experiment?.controller_writes_applied &&
    savings?.claimSupported &&
    Number.isFinite(savings?.attributed?.percent) &&
    savings.attributed.percent > 0
  ) {
    return { apply: false, reason: 'real_telemetry_preferred' };
  }

  return {
    apply: true,
    reason: 'demo_simulation_active',
    mode: projection.mode,
    startedAt: projection.startedAt,
    fromShare: Number.isFinite(projection.fromShare) ? projection.fromShare : 0,
  };
}

/**
 * Build the projected overlay.
 *
 * Takes data, not a database: the caller fetches, this computes. The projected
 * treatment side goes through the SAME summarizeSide → attribute →
 * projectSavings → assessQuality chain as measured telemetry, so the demo
 * cannot be arithmetically inconsistent with the real feature.
 *
 * @param {object} args
 * @param {{apply:boolean, mode:string, startedAt:string, fromShare:number}} args.decision
 * @param {Array<{apSerial:string, model:string|null, baselineWatts:number|null}>} args.baselineAps
 *        MEASURED per-AP watts at the optimized site, from before the override
 * @param {object} args.baseline the real experiment baseline, if any
 * @param {object|null} args.controlCurrent the real control-side summary, if any
 * @returns {object|null}
 */
export function computeOverlay({
  decision,
  baselineAps = [],
  treatmentSiteId = null,
  baseline = null,
  controlCurrent = null,
  prefs,
  emissionsFactor,
  calc,
  now = new Date(),
  bucketSeconds = 60,
}) {
  if (!decision?.apply) return null;

  const { mode, startedAt, fromShare } = decision;
  const projected = projectTreatmentRows({ baselineAps, mode, startedAt, now, fromShare });

  // Nothing measured to build on means nothing to show. Saying so is the
  // correct outcome: a projection with no real starting point would be pure
  // invention, which is exactly what this feature is designed not to be.
  if (projected.rows.length === 0) {
    return {
      active: true,
      applied: false,
      reason: 'no_measured_baseline',
      mode,
      startedAt,
      valueSource: DEMO_SOURCE,
      note:
        'Demo simulation is on, but the optimized site has no measured power history to project from. ' +
        'Nothing is being simulated — the figures on screen remain real.',
      apInstant: new Map(),
      seriesPoints: [],
    };
  }

  const treatmentCurrent = summarizeSide(projected.rows);

  // The baseline the projection is measured against is the REAL one where the
  // experiment has established it; otherwise the same measured watts the
  // projection started from. Either way it is measurement, never a projection
  // compared against itself.
  const treatmentBaseline =
    baseline?.treatment?.wattsPerAp != null
      ? baseline.treatment
      : summarizeSide(
          baselineAps
            .filter((a) => Number.isFinite(a.baselineWatts) && a.baselineWatts > 0)
            .map((a) => ({
              apSerial: a.apSerial,
              model: a.model ?? null,
              avgWatts: a.baselineWatts,
              kwh: 0,
              observedSeconds: Math.max(60, projected.elapsedSeconds),
              sampleCount: a.sampleCount ?? 1,
            }))
        );

  // A real control reading is strongly preferred — it is what subtracts out
  // whatever moved both sites. With none available, the control is held at its
  // own baseline, which assumes zero drift. That assumption is declared in
  // `controlAssumed` rather than hidden, because it is the weakest link in a
  // simulated comparison.
  const controlBaseline = baseline?.control ?? null;
  const controlUsable = controlCurrent?.wattsPerAp != null;
  const controlForAttribution = controlUsable ? controlCurrent : controlBaseline;

  const attribution = attribute({
    treatmentBaseline,
    treatmentCurrent,
    controlBaseline,
    controlCurrent: controlForAttribution,
  });

  const quality = assessQuality({
    treatment: treatmentCurrent,
    control: controlForAttribution ?? treatmentCurrent,
    windowSeconds: projected.elapsedSeconds,
  });

  const projectedSavings = quality.savingsClaimSupported
    ? projectSavings({
        attributedSiteWatts: attribution.attributed.siteWatts,
        elapsedSeconds: projected.elapsedSeconds,
        ratePerKwh: prefs.ratePerKwh,
        emissionsFactorKgPerKwh: emissionsFactor,
        calc,
      })
    : null;

  const savings = {
    ...attribution,
    projected: projectedSavings,
    elapsedSeconds: projected.elapsedSeconds,
    currency: {
      code: prefs.currencyCode,
      symbol: prefs.currencySymbol,
      ratePerKwh: prefs.ratePerKwh,
    },
    emissionsFactorKgPerKwh: emissionsFactor,
    emissionsFactorSource: prefs.emissionsFactorSource ?? 'US eGRID national average (default)',
    // 'simulated' means, everywhere in this codebase, "no controller change is
    // behind this number". That is exactly true here, and reusing the value is
    // what keeps every existing exclusion rule correct without being edited.
    provenance: 'simulated',
    claimSupported: quality.savingsClaimSupported,
    valueSource: DEMO_SOURCE,
  };

  return {
    active: true,
    applied: true,
    reason: decision.reason,
    mode,
    startedAt,
    valueSource: DEMO_SOURCE,
    /** Average reduction share currently in effect, for the operator readout. */
    reductionShare: projected.shareNow,
    baseShare: MEASURED_RADIO_DISABLE_SHARE,
    elapsedSeconds: projected.elapsedSeconds,
    apCount: projected.apCountProjected,
    baselineWattsPerAp: treatmentBaseline?.wattsPerAp ?? null,
    controlAssumed: !controlUsable,
    savings,
    quality,
    treatment: {
      treatment: { ...treatmentCurrent, valueSource: DEMO_SOURCE },
      control: controlForAttribution
        ? {
            ...controlForAttribution,
            valueSource: controlUsable ? VALUE_SOURCE.REAL : VALUE_SOURCE.CALCULATED,
          }
        : null,
      start: startedAt,
      end: now.toISOString(),
    },
    apInstant: projectApInstant({ baselineAps, mode, startedAt, now, fromShare }),
    seriesPoints: treatmentSiteId
      ? projectSeriesPoints({
          siteId: treatmentSiteId,
          baselineAps,
          mode,
          startedAt,
          now,
          bucketSeconds,
          fromShare,
        })
      : [],
    note:
      mode === 'lights_off'
        ? 'Demo simulation: the optimized site is being projected from its own measured power history. ' +
          'No controller configuration was changed and no telemetry was altered.'
        : 'Demo simulation: the optimized site is being projected back to normal operation.',
  };
}

/**
 * The overlay as the API should report it.
 *
 * `apInstant` is a Map and `seriesPoints` can be hundreds of rows; both are
 * inputs the router consumes to build other parts of the payload, not things a
 * client should receive twice. A Map also JSON-serializes to `{}`, which would
 * put a meaningless empty object on the wire.
 */
export function publicOverlay(overlay) {
  if (!overlay) return null;
  const { apInstant: _apInstant, seriesPoints: _seriesPoints, ...rest } = overlay;
  return rest;
}

/**
 * Splice projected points into a measured series.
 *
 * Measured points are never replaced — a measured point and a projected point
 * for the same bucket both being present would be a contradiction on screen, so
 * where the two overlap the MEASURED one is kept. The projection fills only what
 * the real feed does not cover, which is precisely the failure it exists for.
 */
export function mergeSeriesPoints(measured = [], projectedPoints = [], treatmentSiteId = null) {
  if (projectedPoints.length === 0)
    return measured.map((p) => ({ ...p, valueSource: VALUE_SOURCE.REAL }));

  const measuredKeys = new Set(
    measured
      .filter((p) => p.siteId === treatmentSiteId && p.wattsPerAp != null)
      .map((p) => `${p.siteId}|${new Date(p.bucketStart).toISOString()}`)
  );

  const additions = projectedPoints.filter(
    (p) => !measuredKeys.has(`${p.siteId}|${new Date(p.bucketStart).toISOString()}`)
  );

  return [...measured.map((p) => ({ ...p, valueSource: VALUE_SOURCE.REAL })), ...additions].sort(
    (a, b) => Date.parse(a.bucketStart) - Date.parse(b.bucketStart)
  );
}
