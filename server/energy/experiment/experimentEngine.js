/**
 * The North-vs-South experiment state machine.
 *
 * Owns: enrollment, baseline, the darkness trigger, the controller write, the
 * restore, and the savings computation. Nothing above this layer talks to the
 * controller, and nothing below it decides policy.
 *
 * States:
 *   ready → collecting_baseline → baseline_established
 *         → darkness_detected → optimization_active
 *         → recovering → complete
 *   (error from anywhere; restore is reachable from every state)
 *
 * All state lives in Postgres. Restarting the process, closing the browser, or
 * coming back three days later reconstructs the same experiment from the same
 * rows — none of this is held in memory.
 */

import { getSession } from '../../monitoring/controllerClient.js';
import { getSourceCredentials } from '../../monitoring/sourceRepository.js';
import { loadMonitoringConfig } from '../../monitoring/config.js';
import * as calc from '../energyCalculator.js';
import { getRatePreferences } from '../energyRepository.js';
import * as repo from './experimentRepository.js';
import { discover } from './siteDiscovery.js';
import { assertTargetAllowed, assertActionPermitted, partitionTargets } from './scopeGuard.js';
import { applyRadioChange, restoreRadioState, readAp } from './radioActuator.js';
import { fetchRecentLightSamples, evaluateSide } from './lightSignal.js';
import {
  selectBaselineWindow,
  matchedTimeWindows,
  summarizeSide,
  attribute,
  projectSavings,
  assessQuality,
  BASELINE_WINDOWS,
} from './analysis.js';

const DEFAULT_ACTION = Object.freeze({
  kind: 'disableRadios',
  radioIndexes: [3],
  requireZeroClients: true,
});

const DEFAULT_EMISSIONS_FACTOR_KG_PER_KWH = 0.371; // US eGRID national average, 2022.

/**
 * Controller session for a source, using the SAME durable credentials the
 * collector uses. The engine must be able to act when no operator is logged in
 * — a light going out at 2am is not going to wait for a browser.
 */
export async function sessionFor(source, config = loadMonitoringConfig()) {
  let credentials = null;
  try {
    credentials = await getSourceCredentials(source.id, config.credentialKey);
  } catch {
    credentials = null;
  }
  const username =
    credentials?.username ??
    (source.baseUrl === config.defaultControllerUrl ? config.defaultControllerUsername : null);
  const password =
    credentials?.password ??
    (source.baseUrl === config.defaultControllerUrl ? config.defaultControllerPassword : null);
  return getSession(source.id, {
    baseUrl: source.baseUrl,
    username,
    password,
    timeoutMs: config.requestTimeoutSeconds * 1000,
  });
}

async function event(args) {
  try {
    return await repo.insertEvent(args);
  } catch {
    // The timeline is evidence, not control flow. Losing one row must never
    // abort a restore.
    return null;
  }
}

/* ------------------------------------------------------------------- start */

/**
 * Begin an experiment. Refuses rather than degrades: a treatment group with no
 * APs, or a control that is really the same site, produces no defensible
 * result and would waste the one demonstration slot that matters.
 */
export async function startExperiment({ source, session, name, startedBy, now = new Date() }) {
  const sourceId = source.id;
  const existing = await repo.getActiveExperiment(sourceId);
  if (existing) {
    return { ok: false, error: 'An experiment is already in flight.', experiment: existing };
  }

  const config = await repo.getConfig(sourceId);
  const action = config?.action && Object.keys(config.action).length ? config.action : DEFAULT_ACTION;

  const permitted = assertActionPermitted(action);
  if (!permitted.allowed) return { ok: false, error: permitted.detail };

  const found = await discover({
    session,
    configuredPair: { northSiteId: config?.north_site_id, southSiteId: config?.south_site_id },
  });
  if (!found.ok) return { ok: false, error: found.error };

  const { north, south } = found.pair;
  if (!north || !south) {
    return {
      ok: false,
      error:
        'North and South sites are not both resolved. Set the site pair in the POC control panel — ' +
        'the experiment will not guess which sites to treat.',
      anomalies: found.anomalies,
    };
  }
  if (found.membership.north.length === 0) {
    return {
      ok: false,
      error: `North site '${north.siteName}' has no access points. Assign APs to it on the controller, or re-point the pair.`,
      anomalies: found.anomalies,
    };
  }
  if (found.membership.south.length === 0) {
    return {
      ok: false,
      error: `South site '${south.siteName}' has no access points, so there is no control group.`,
      anomalies: found.anomalies,
    };
  }

  const experiment = await repo.createExperiment({
    sourceId,
    name: name || `North vs South ${now.toISOString().slice(0, 16).replace('T', ' ')}`,
    north,
    south,
    northDevices: found.membership.north,
    southDevices: found.membership.south,
    action,
    startedBy,
    baselineStart: now.toISOString(),
  });

  await event({
    experimentId: experiment.id,
    sourceId,
    kind: 'baseline_started',
    message: `Baseline collection started. North '${north.siteName}' (${found.membership.north.length} AP), South '${south.siteName}' (${found.membership.south.length} AP).`,
    detail: {
      north: found.membership.north.map((a) => ({ serial: a.serial, model: a.model, status: a.status })),
      south: found.membership.south.map((a) => ({ serial: a.serial, model: a.model, status: a.status })),
      action,
    },
  });

  for (const anomaly of found.anomalies) {
    await event({
      experimentId: experiment.id,
      sourceId,
      kind: 'discovery_anomaly',
      severity: 'warning',
      message: anomaly,
    });
  }

  return { ok: true, experiment, discovery: found };
}

/** Close the baseline window and freeze the baseline metrics. */
export async function establishBaseline({ source, experimentId, now = new Date() }) {
  const experiment = await repo.getExperiment(experimentId);
  if (!experiment) return { ok: false, error: 'Experiment not found.' };
  if (experiment.state !== 'collecting_baseline') {
    return { ok: false, error: `Baseline cannot be closed from state '${experiment.state}'.` };
  }

  const baseline = await computeBaseline({ source, experiment, anchor: now });
  const updated = await repo.updateExperiment(experimentId, {
    state: 'baseline_established',
    baseline_end: now.toISOString(),
    baseline_metrics: baseline,
  });

  await event({
    experimentId,
    sourceId: source.id,
    kind: 'baseline_established',
    message: baseline.window.sufficient
      ? `Baseline established from ${baseline.window.label.toLowerCase()}.`
      : `Baseline established with limited history (${baseline.window.availableHours.toFixed(1)}h).`,
    detail: baseline,
    provenance: 'calculated',
  });

  return { ok: true, experiment: updated, baseline };
}

/**
 * Historical baseline for both sides, matched to the time of day the treatment
 * will occupy where enough history exists.
 */
export async function computeBaseline({ source, experiment, anchor = new Date() }) {
  const siteIds = [experiment.north_site_id, experiment.south_site_id];
  const coverageRows = await repo.fetchHistoryCoverage({ sourceId: source.id, siteIds });
  const coverage = Object.fromEntries(coverageRows.map((r) => [r.siteId, r]));

  const window = selectBaselineWindow({ coverage, treatmentStart: anchor.toISOString(), now: anchor });

  // Matched hour-of-day windows on preceding days, when a day or more exists.
  // Below that there is nothing to match against and the contiguous window is
  // the only honest baseline.
  const days = window.sufficient
    ? (BASELINE_WINDOWS.find((w) => w.key === window.key)?.days ?? 1)
    : 0;
  const treatmentStart = new Date(anchor.getTime() - 2 * 3_600_000).toISOString();
  const matched = days > 0
    ? matchedTimeWindows({ treatmentStart, treatmentEnd: anchor.toISOString(), days, now: anchor })
    : [];

  const ranges = matched.length > 0
    ? matched
    : [{ start: window.start ?? new Date(anchor.getTime() - 3_600_000).toISOString(), end: anchor.toISOString(), daysBack: 0 }];

  const northRows = [];
  const southRows = [];
  for (const r of ranges) {
    if (!r.start) continue;
    const rows = await repo.fetchSiteEnergy({ sourceId: source.id, siteIds, start: r.start, end: r.end });
    for (const row of rows) {
      (row.siteId === experiment.north_site_id ? northRows : southRows).push(row);
    }
  }

  const north = summarizeSide(mergeApRows(northRows));
  const south = summarizeSide(mergeApRows(southRows));

  return {
    window: { ...window, matchedRanges: ranges.length, matchedTimeOfDay: matched.length > 0 },
    north,
    south,
    coverage,
    computedAt: anchor.toISOString(),
    provenance: 'measured',
  };
}

/** Combine the same AP appearing across several matched windows into one row. */
function mergeApRows(rows) {
  const byAp = new Map();
  for (const r of rows) {
    const cur = byAp.get(r.apSerial);
    if (!cur) {
      byAp.set(r.apSerial, { ...r });
      continue;
    }
    const totalSeconds = cur.observedSeconds + r.observedSeconds;
    cur.avgWatts =
      totalSeconds > 0
        ? (cur.avgWatts * cur.observedSeconds + r.avgWatts * r.observedSeconds) / totalSeconds
        : cur.avgWatts;
    cur.kwh = (cur.kwh ?? 0) + (r.kwh ?? 0);
    cur.observedSeconds = totalSeconds;
    cur.sampleCount = (cur.sampleCount ?? 0) + (r.sampleCount ?? 0);
  }
  return [...byAp.values()];
}

/* ----------------------------------------------------------------- trigger */

/**
 * Evaluate the live sensor feed against the experiment's thresholds and drive
 * the state machine. Called on every light report and on a timer, so a sensor
 * that goes quiet still gets noticed.
 */
export async function evaluateTrigger({ source, session, now = new Date() }) {
  const experiment = await repo.getActiveExperiment(source.id);
  if (!experiment) return { ok: true, action: 'none', reason: 'no_active_experiment' };

  const config = await repo.getConfig(source.id);
  const devices = await repo.listDevices(experiment.id);
  const northSerials = devices.filter((d) => d.side === 'north').map((d) => d.apSerial);
  const samples = await fetchRecentLightSamples({ sourceId: source.id, serials: northSerials, sinceSeconds: 1800 });

  const darkness = evaluateSide({
    samplesByAp: samples,
    serials: northSerials,
    threshold: config?.darkness_threshold_raw ?? 3,
    persistenceSeconds: config?.darkness_persistence_seconds ?? 120,
    now,
    mode: 'dark',
  });
  const light = evaluateSide({
    samplesByAp: samples,
    serials: northSerials,
    threshold: config?.recovery_threshold_raw ?? 6,
    persistenceSeconds: config?.recovery_persistence_seconds ?? 60,
    now,
    mode: 'light',
  });

  if (experiment.state === 'baseline_established' && darkness.triggered) {
    return activateOptimization({
      source, session, experimentId: experiment.id, triggerSource: 'live_sensor',
      provenance: 'live', detail: darkness, now,
    });
  }

  if (experiment.state === 'optimization_active' && light.triggered) {
    return recover({
      source, session, experimentId: experiment.id, reason: 'light_restored',
      provenance: 'live', detail: light, now,
    });
  }

  return { ok: true, action: 'none', darkness, light, state: experiment.state };
}

/**
 * Apply the energy action to the North APs.
 *
 * Every AP goes through the safety boundary, then read → capture → write →
 * re-read → verify, individually. One AP failing does not abort the others, but
 * it is recorded as a warning and it changes the treatment-group size the
 * analysis uses.
 */
export async function activateOptimization({
  source, session, experimentId, triggerSource, provenance = 'live', detail = {}, applyWrites = true, now = new Date(),
}) {
  let experiment = await repo.getExperiment(experimentId);
  if (!experiment) return { ok: false, error: 'Experiment not found.' };
  if (!['baseline_established', 'darkness_detected'].includes(experiment.state)) {
    return { ok: false, error: `Cannot activate optimization from state '${experiment.state}'.` };
  }

  const action = experiment.action && Object.keys(experiment.action).length ? experiment.action : DEFAULT_ACTION;
  const permitted = assertActionPermitted(action);
  if (!permitted.allowed) return { ok: false, error: permitted.detail };

  experiment = await repo.updateExperiment(experimentId, {
    state: 'darkness_detected',
    trigger_source: triggerSource,
  });
  await event({
    experimentId, sourceId: source.id, kind: 'darkness_persistence_satisfied', side: 'north',
    message:
      triggerSource === 'simulated'
        ? 'Simulated darkness trigger accepted; the live policy path continues unchanged.'
        : `Sustained darkness confirmed across ${detail.satisfiedCount ?? '?'}/${detail.reportingCount ?? '?'} reporting North sensors.`,
    detail,
    provenance: triggerSource === 'simulated' ? 'simulated' : provenance,
  });

  const devices = await repo.listDevices(experimentId);
  const northSerials = devices.filter((d) => d.side === 'north').map((d) => d.apSerial);

  // Re-read the LIVE inventory. Enrollment is a snapshot; membership now is the
  // only thing that may authorise a write.
  const inventory = await session.get('/v1/aps/query');
  const liveAps = inventory.ok
    ? (Array.isArray(inventory.data) ? inventory.data : inventory.data?.aps ?? [])
    : [];
  if (!inventory.ok) {
    await event({
      experimentId, sourceId: source.id, kind: 'controller_failure', severity: 'critical',
      message: 'Controller inventory unavailable; no configuration change was attempted.',
      detail: { error: inventory.errorSummary },
    });
    await repo.updateExperiment(experimentId, { state: 'error', error_summary: 'Controller unreachable at activation.' });
    return { ok: false, error: 'Controller inventory unavailable.' };
  }

  const { allowed, refused } = partitionTargets({
    experiment, allowlist: devices, serials: northSerials, liveAps, sourceId: source.id, intent: 'apply',
  });

  for (const r of refused) {
    await event({
      experimentId, sourceId: source.id, kind: 'target_refused', severity: 'warning', side: 'north',
      apSerial: r.serial, message: r.detail, detail: { reason: r.reason },
    });
  }

  const results = [];
  if (applyWrites) {
    for (const target of allowed) {
      // A radio carrying clients is not disabled unless the operator explicitly
      // opted out of that guard. Saving 2 W by dropping someone's session is
      // not a demonstration anyone wants to give.
      if (action.requireZeroClients !== false) {
        const busy = (target.liveAp.radios ?? []).filter(
          (r) => action.radioIndexes.includes(r.radioIndex) && Number(r.clients) > 0
        );
        if (busy.length > 0) {
          await event({
            experimentId, sourceId: source.id, kind: 'target_refused', severity: 'warning', side: 'north',
            apSerial: target.serial,
            message: `${target.serial}: radio ${busy.map((b) => b.radioIndex).join(',')} has associated clients; skipped.`,
            detail: { reason: 'clients_present' },
          });
          results.push({ serial: target.serial, ok: false, skipped: 'clients_present' });
          continue;
        }
      }

      const outcome = await applyRadioChange({
        session,
        serial: target.serial,
        radioIndexes: action.radioIndexes,
        adminState: false,
        persistRollback: ({ serial, original, intended }) =>
          repo.captureRollback({ experimentId, serial, original, intended }),
      });

      if (!outcome.noop) {
        await repo.recordApplyResult({
          experimentId, serial: target.serial, verified: outcome.verified, error: outcome.error ?? null,
        });
      }

      await event({
        experimentId, sourceId: source.id,
        kind: outcome.verified ? 'configuration_verified' : 'configuration_failed',
        severity: outcome.verified ? 'info' : 'critical',
        side: 'north', apSerial: target.serial,
        message: outcome.verified
          ? `${target.serial}: radio ${action.radioIndexes.join(',')} disabled and confirmed by read-back.`
          : `${target.serial}: ${outcome.error ?? 'change could not be verified.'}`,
        detail: { intended: outcome.intended, mismatches: outcome.mismatches, stage: outcome.stage },
      });
      results.push({ serial: target.serial, ok: outcome.verified, error: outcome.error });
    }
  } else {
    await event({
      experimentId, sourceId: source.id, kind: 'simulation_activated', severity: 'warning',
      message: 'Simulation mode: no controller writes were issued. Any divergence shown is modelled, not measured.',
      provenance: 'simulated',
    });
  }

  const verifiedCount = results.filter((r) => r.ok).length;
  const updated = await repo.updateExperiment(experimentId, {
    state: 'optimization_active',
    treatment_start: now.toISOString(),
    controller_writes_applied: applyWrites && verifiedCount > 0,
  });

  await event({
    experimentId, sourceId: source.id, kind: 'optimization_activated', side: 'north',
    message: `Energy Optimization active on ${verifiedCount}/${northSerials.length} North AP(s).`,
    detail: { results, refused, action },
    provenance: triggerSource === 'simulated' ? 'simulated' : 'live',
  });

  return { ok: true, action: 'activated', experiment: updated, results, refused };
}

/* ----------------------------------------------------------------- restore */

/**
 * Return North to its captured configuration and prove it.
 *
 * This is the operation that must not lie. Anything unverified is raised as a
 * critical event and reflected in the return value; the experiment is only
 * marked complete when every changed AP is confirmed back.
 */
export async function restoreNorth({ source, session, experimentId, reason = 'operator_request', now = new Date() }) {
  const experiment = await repo.getExperiment(experimentId);
  if (!experiment) return { ok: false, error: 'Experiment not found.' };

  const rollback = await repo.listRollback(experimentId);
  const outstanding = rollback.filter((r) => r.appliedAt && !r.restoreVerified);

  await event({
    experimentId, sourceId: source.id, kind: 'recovery_requested', side: 'north',
    message: `Restore requested (${reason}); ${outstanding.length} AP(s) to return.`,
  });

  if (outstanding.length === 0) {
    const updated = await repo.updateExperiment(experimentId, {
      state: experiment.state === 'recovering' || experiment.state === 'optimization_active' ? 'complete' : experiment.state,
      recovery_start: experiment.recovery_start ?? now.toISOString(),
      treatment_end: experiment.treatment_end ?? now.toISOString(),
      ended_at: now.toISOString(),
    });
    await event({
      experimentId, sourceId: source.id, kind: 'restoration_verified', side: 'north',
      message: 'No outstanding configuration changes; North is already at baseline.',
    });
    return { ok: true, restored: [], unverified: [], experiment: updated };
  }

  const inventory = await session.get('/v1/aps/query');
  const liveAps = inventory.ok
    ? (Array.isArray(inventory.data) ? inventory.data : inventory.data?.aps ?? [])
    : [];
  const bySerial = new Map(liveAps.map((a) => [a.serialNumber, a]));
  const devices = await repo.listDevices(experimentId);

  const restored = [];
  const unverified = [];

  for (const row of outstanding) {
    // Restore is permitted from any experiment state — an AP left changed is
    // exactly the situation rollback exists for — but it still may not touch an
    // AP that was never ours or has moved away.
    const verdict = assertTargetAllowed({
      experiment, allowlist: devices, serial: row.apSerial,
      liveAp: bySerial.get(row.apSerial) ?? null, sourceId: source.id, intent: 'restore',
    });
    if (!verdict.allowed) {
      unverified.push({ serial: row.apSerial, error: verdict.detail, reason: verdict.reason });
      await repo.recordRestoreResult({ experimentId, serial: row.apSerial, verified: false, error: verdict.detail });
      await event({
        experimentId, sourceId: source.id, kind: 'restoration_blocked', severity: 'critical',
        side: 'north', apSerial: row.apSerial,
        message: `${row.apSerial} could not be restored: ${verdict.detail}`,
        detail: { reason: verdict.reason },
      });
      continue;
    }

    const outcome = await restoreRadioState({ session, serial: row.apSerial, original: row.original });
    await repo.recordRestoreResult({
      experimentId, serial: row.apSerial, verified: outcome.verified, error: outcome.error ?? null,
    });
    if (outcome.verified) {
      restored.push(row.apSerial);
      await event({
        experimentId, sourceId: source.id, kind: 'configuration_restored', side: 'north', apSerial: row.apSerial,
        message: `${row.apSerial} restored to its captured configuration and confirmed by read-back.`,
        detail: { intended: outcome.intended },
      });
    } else {
      unverified.push({ serial: row.apSerial, error: outcome.error, stage: outcome.stage });
      await event({
        experimentId, sourceId: source.id, kind: 'restoration_failed', severity: 'critical',
        side: 'north', apSerial: row.apSerial,
        message: `${row.apSerial} was NOT confirmed back at baseline: ${outcome.error}`,
        detail: { mismatches: outcome.mismatches, stage: outcome.stage },
      });
    }
  }

  const allBack = unverified.length === 0;
  const updated = await repo.updateExperiment(experimentId, {
    state: allBack ? 'complete' : 'error',
    recovery_start: experiment.recovery_start ?? now.toISOString(),
    treatment_end: experiment.treatment_end ?? now.toISOString(),
    ended_at: allBack ? now.toISOString() : null,
    error_summary: allBack ? null : `${unverified.length} AP(s) not confirmed restored.`,
  });

  await event({
    experimentId, sourceId: source.id,
    kind: allBack ? 'restoration_verified' : 'restoration_incomplete',
    severity: allBack ? 'info' : 'critical',
    side: 'north',
    message: allBack
      ? `North restored: ${restored.length} AP(s) confirmed back at baseline.`
      : `North restoration INCOMPLETE: ${unverified.length} AP(s) unconfirmed. Manual intervention required.`,
    detail: { restored, unverified },
  });

  return { ok: allBack, restored, unverified, experiment: updated };
}

/** Light returned: restore, then finish. */
export async function recover({ source, session, experimentId, reason, provenance = 'live', detail = {}, now = new Date() }) {
  const experiment = await repo.getExperiment(experimentId);
  if (!experiment) return { ok: false, error: 'Experiment not found.' };

  await repo.updateExperiment(experimentId, { state: 'recovering', recovery_start: now.toISOString() });
  await event({
    experimentId, sourceId: source.id, kind: 'light_restored', side: 'north',
    message: reason === 'light_restored'
      ? `Light restored across ${detail.satisfiedCount ?? '?'}/${detail.reportingCount ?? '?'} reporting North sensors.`
      : `Recovery triggered (${reason}).`,
    detail,
    provenance,
  });

  const result = await restoreNorth({ source, session, experimentId, reason, now });
  await finalize({ source, experimentId, now });
  return { ...result, action: 'recovered' };
}

/* ---------------------------------------------------------------- analysis */

/**
 * Compute (or recompute) the treatment metrics and savings for an experiment.
 * Idempotent and safe to call at any time — the UI calls it on every poll, and
 * a completed experiment recomputes to the same numbers from the same rows.
 */
export async function summarize({ source, experiment, now = new Date() }) {
  const siteIds = [experiment.north_site_id, experiment.south_site_id];
  const treatmentStart = experiment.treatment_start;
  const treatmentEnd = experiment.treatment_end ?? now.toISOString();

  const baseline = experiment.baseline_metrics ?? (await computeBaseline({ source, experiment, anchor: now }));

  if (!treatmentStart) {
    return {
      baseline,
      treatment: null,
      savings: null,
      quality: null,
      state: experiment.state,
    };
  }

  const rows = await repo.fetchSiteEnergy({
    sourceId: source.id, siteIds, start: treatmentStart, end: treatmentEnd,
  });
  const northTreatment = summarizeSide(rows.filter((r) => r.siteId === experiment.north_site_id));
  const southTreatment = summarizeSide(rows.filter((r) => r.siteId === experiment.south_site_id));

  const elapsedSeconds = Math.max(0, (new Date(treatmentEnd) - new Date(treatmentStart)) / 1000);
  const quality = assessQuality({
    north: northTreatment, south: southTreatment, windowSeconds: elapsedSeconds,
  });

  const attribution = attribute({
    northBaseline: baseline.north,
    northTreatment,
    southBaseline: baseline.south,
    southTreatment,
  });

  const prefs = (await getRatePreferences(source.id)) ?? {
    currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14, emissionsFactorKgPerKwh: null,
  };
  const emissionsFactor = prefs.emissionsFactorKgPerKwh ?? DEFAULT_EMISSIONS_FACTOR_KG_PER_KWH;

  const projected = quality.savingsClaimSupported
    ? projectSavings({
        attributedSiteWatts: attribution.attributed.siteWatts,
        elapsedSeconds,
        ratePerKwh: prefs.ratePerKwh,
        emissionsFactorKgPerKwh: emissionsFactor,
        calc,
      })
    : null;

  const savings = {
    ...attribution,
    projected,
    elapsedSeconds,
    currency: { code: prefs.currencyCode, symbol: prefs.currencySymbol, ratePerKwh: prefs.ratePerKwh },
    emissionsFactorKgPerKwh: emissionsFactor,
    emissionsFactorSource: prefs.emissionsFactorSource ?? 'US eGRID national average (default)',
    // The single most important field in this payload. Everything downstream —
    // the headline percentage, the report, the scenario extrapolation — is
    // labelled from here.
    provenance: experiment.controller_writes_applied
      ? experiment.trigger_source === 'simulated'
        ? 'measured-telemetry-simulated-trigger'
        : 'measured'
      : 'simulated',
    claimSupported: quality.savingsClaimSupported,
  };

  const treatment = { north: northTreatment, south: southTreatment, start: treatmentStart, end: treatmentEnd };
  return { baseline, treatment, savings, quality, state: experiment.state };
}

/** Persist the computed summary onto the experiment row. */
export async function finalize({ source, experimentId, now = new Date() }) {
  const experiment = await repo.getExperiment(experimentId);
  if (!experiment) return null;
  const summary = await summarize({ source, experiment, now });
  return repo.updateExperiment(experimentId, {
    baseline_metrics: summary.baseline,
    treatment_metrics: summary.treatment,
    savings: summary.savings,
    telemetry_quality: summary.quality,
  });
}

export { DEFAULT_ACTION, DEFAULT_EMISSIONS_FACTOR_KG_PER_KWH, readAp };
