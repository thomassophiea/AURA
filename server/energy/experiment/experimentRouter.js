/**
 * /api/energy/experiment/* — the Treatment-vs-Control POC API.
 *
 * Reads are open to any caller who can authenticate against the controller
 * (same contract as the rest of the Energy API). Writes — start, activate,
 * restore, demo override — additionally require the operator role, because each
 * of them either changes AP configuration or changes what the recorded evidence
 * says.
 *
 * The browser never talks to the controller here and never computes a saving.
 * It renders what this router returns.
 */

import { Router, json as expressJson } from 'express';
import { createRequireControllerScope } from '../../monitoring/requireControllerScope.js';
import { listSources } from '../../monitoring/sourceRepository.js';
import { ingestLightReport } from '../lightAware/lightIngest.js';
import * as repo from './experimentRepository.js';
import * as engine from './experimentEngine.js';
import { discover } from './siteDiscovery.js';
import { assessReadiness } from './readiness.js';
import { fetchRecentLightSamples, evaluateSide } from './lightSignal.js';
import { extrapolateObserved } from '../scenarioEngine.js';
import { summarizeSide } from './analysis.js';
import { getRatePreferences } from '../energyRepository.js';

import {
  attachEpisode,
  clearOverride,
  describeOverride,
  evaluationSampleSource,
  setOverride,
  __resetOverrides,
} from './demoOverrideRegistry.js';
import {
  decideOverlay,
  computeOverlay,
  mergeSeriesPoints,
  publicOverlay,
  VALUE_SOURCE,
} from './demoOverlay.js';
import { MEASURED_RADIO_DISABLE_SHARE, shareAt } from './demoProjection.js';
import * as calc from '../energyCalculator.js';

export function createExperimentRouter(options = {}) {
  const {
    scopeMiddleware = createRequireControllerScope({ graceMs: 900_000 }),
    requireOperator = (_req, _res, next) => next(),
    audit = null,
    nowFn = () => new Date(),
    deps = {},
  } = options;

  const sessionFor = deps.sessionFor ?? engine.sessionFor;
  const listSourcesFn = deps.listSources ?? listSources;

  const router = Router();
  const jsonBody = expressJson({ limit: '64kb' });
  const BASE = '/energy/experiment';
  router.use(BASE, scopeMiddleware);

  function scopeSourceId(req) {
    return req.monitoringScope?.sources?.[0]?.id ?? null;
  }

  /** The full source row (base url + org) — needed to mint a controller session. */
  async function resolveSource(req) {
    const id = scopeSourceId(req);
    if (!id) return null;
    const sources = await listSourcesFn({ enabledOnly: false });
    return sources.find((s) => s.id === id) ?? null;
  }

  function fail(res, status, message, extra = {}) {
    return res.status(status).json({ error: message, ...extra });
  }

  async function withSource(req, res, fn) {
    try {
      const source = await resolveSource(req);
      if (!source) return fail(res, 400, 'No monitored controller is in scope for this session.');
      return await fn(source);
    } catch (error) {
      return fail(res, 500, 'Request failed', { detail: error?.message });
    }
  }

  function record(req, action, detail) {
    if (typeof audit === 'function') {
      try {
        audit({ req, action, detail });
      } catch {
        /* auditing must never break the operation it describes */
      }
    }
  }

  /* ------------------------------------------------- demo fail-safe overlay */

  /**
   * Resolve the demo projection for this request, if one applies.
   *
   * Called by every read route so the whole payload tells one story. It fetches
   * only what the projection needs — the optimized site's MEASURED watts from
   * before the override began — and hands the arithmetic to demoOverlay.js.
   *
   * Failing soft here is deliberate: a broken fallback must not take out the
   * real Energy view it exists to protect.
   */
  async function resolveOverlay({
    source,
    experiment = null,
    config = null,
    savings = null,
    baseline = null,
    controlCurrent = null,
    bucketSeconds = 60,
  }) {
    const override = describeOverride(source.id);
    const decision = decideOverlay({ override, experiment, savings });
    if (!decision.apply) return { override, decision, overlay: null };

    const treatmentSiteId = experiment?.treatment_site_id ?? config?.treatment_site_id ?? null;
    if (!treatmentSiteId) {
      return { override, decision, overlay: null };
    }

    const controlSiteId = experiment?.control_site_id ?? config?.control_site_id ?? null;

    try {
      const [baselineAps, controlAps, prefs] = await Promise.all([
        repo.fetchApBaselineWatts({
          sourceId: source.id,
          siteId: treatmentSiteId,
          before: decision.startedAt,
        }),
        // The control's own MEASURED level. Needed because the cross-site
        // comparison is the story — "the optimized site used less than the
        // control" — and without an experiment there is no established baseline
        // to borrow one from. The control is by definition unmodified, so its
        // recent measured average IS its current level; it stays real data
        // either way, and it is the only side that must never be projected.
        controlSiteId && !controlCurrent
          ? repo.fetchApBaselineWatts({ sourceId: source.id, siteId: controlSiteId, before: nowFn().toISOString() })
          : Promise.resolve([]),
        getRatePreferences(source.id),
      ]);
      const rates = prefs ?? { currencyCode: 'USD', currencySymbol: '$', ratePerKwh: 0.14 };

      const asSide = (rows, windowSeconds) =>
        summarizeSide(
          rows
            .filter((a) => Number.isFinite(a.baselineWatts) && a.baselineWatts > 0)
            .map((a) => ({
              apSerial: a.apSerial,
              model: a.model ?? null,
              avgWatts: a.baselineWatts,
              kwh: 0,
              observedSeconds: Math.max(60, windowSeconds),
              sampleCount: a.sampleCount ?? 1,
            }))
        );

      const elapsed = Math.max(60, (nowFn().getTime() - Date.parse(decision.startedAt)) / 1000);
      const measuredControl = controlCurrent ?? (controlAps.length ? asSide(controlAps, elapsed) : null);
      const effectiveBaseline =
        baseline ??
        (baselineAps.length || controlAps.length
          ? { treatment: asSide(baselineAps, elapsed), control: measuredControl, provenance: 'measured' }
          : null);

      const overlay = computeOverlay({
        decision,
        baselineAps,
        treatmentSiteId,
        baseline: effectiveBaseline,
        controlCurrent: measuredControl,
        prefs: rates,
        emissionsFactor: rates.emissionsFactorKgPerKwh ?? engine.DEFAULT_EMISSIONS_FACTOR_KG_PER_KWH,
        calc,
        now: nowFn(),
        bucketSeconds,
      });
      return { override, decision, overlay };
    } catch {
      return { override, decision, overlay: null };
    }
  }

  /* ------------------------------------------------------------- discovery */

  router.get(`${BASE}/discovery`, (req, res) =>
    withSource(req, res, async (source) => {
      const config = await repo.getConfig(source.id);
      const session = await sessionFor(source);
      const found = await discover({
        session,
        configuredPair: { treatmentSiteId: config?.treatment_site_id, controlSiteId: config?.control_site_id },
      });
      if (!found.ok) return fail(res, 502, found.error);
      res.json({
        sites: found.sites.map((s) => ({ siteId: s.siteId, siteName: s.siteName, timezone: s.timezone })),
        pair: found.pair,
        membership: found.membership,
        anomalies: found.anomalies,
        configured: config
          ? { treatmentSiteId: config.treatment_site_id, controlSiteId: config.control_site_id }
          : null,
      });
    })
  );

  router.get(`${BASE}/readiness`, (req, res) =>
    withSource(req, res, async (source) => {
      const session = await sessionFor(source);
      res.json(await assessReadiness({ source, session, now: nowFn() }));
    })
  );

  /* ---------------------------------------------------------------- config */

  router.get(`${BASE}/config`, (req, res) =>
    withSource(req, res, async (source) => {
      res.json((await repo.getConfig(source.id)) ?? null);
    })
  );

  router.put(`${BASE}/config`, requireOperator, jsonBody, (req, res) =>
    withSource(req, res, async (source) => {
      const body = req.body ?? {};
      if (body.treatmentSiteId && body.controlSiteId && body.treatmentSiteId === body.controlSiteId) {
        return fail(res, 400, 'Treatment and Control must be different sites.', { errorClass: 'validation' });
      }
      const saved = await repo.upsertConfig({ sourceId: source.id, ...body });
      record(req, 'energy.experiment.config', { treatmentSiteId: saved.treatment_site_id, controlSiteId: saved.control_site_id });
      res.json(saved);
    })
  );

  /* ------------------------------------------------------------ experiment */

  /** Everything the UI needs to render, reconstructed from Postgres. */
  router.get(`${BASE}/state`, (req, res) =>
    withSource(req, res, async (source) => {
      const experimentId = req.query.experimentId;
      const experiment = experimentId
        ? await repo.getExperiment(experimentId)
        : (await repo.getActiveExperiment(source.id)) ??
          (await repo.listExperiments(source.id, 1))[0] ??
          null;

      if (!experiment) {
        // No experiment, but the fail-safe must still work: if the call that
        // would have started one is what failed, the operator needs the story
        // on screen regardless. The projection is display-only, so there is
        // nothing here it could corrupt.
        const config = await repo.getConfig(source.id);
        const { override, overlay } = await resolveOverlay({ source, config });
        return res.json({
          experiment: null,
          pair: config
            ? {
                treatment: { siteId: config.treatment_site_id, siteName: config.treatment_site_name },
                control: { siteId: config.control_site_id, siteName: config.control_site_name },
              }
            : null,
          savings: overlay?.applied ? overlay.savings : null,
          treatment: overlay?.applied ? overlay.treatment : null,
          quality: overlay?.applied ? overlay.quality : null,
          demoOverride: override,
          demoSimulation: publicOverlay(overlay),
          outstandingRestores: await repo.listOutstandingRestores(source.id),
        });
      }

      const [devices, events, rollback, summary] = await Promise.all([
        repo.listDevices(experiment.id),
        repo.listEvents(experiment.id),
        repo.listRollback(experiment.id),
        engine.summarize({ source, experiment, now: nowFn() }),
      ]);

      const { override, overlay } = await resolveOverlay({
        source,
        experiment,
        savings: summary.savings,
        baseline: summary.baseline,
        controlCurrent: summary.treatment?.control ?? null,
      });

      res.json({
        experiment: {
          id: experiment.id,
          name: experiment.name,
          state: experiment.state,
          treatment: { siteId: experiment.treatment_site_id, siteName: experiment.treatment_site_name },
          control: { siteId: experiment.control_site_id, siteName: experiment.control_site_name },
          baselineStart: experiment.baseline_start,
          baselineEnd: experiment.baseline_end,
          treatmentStart: experiment.treatment_start,
          treatmentEnd: experiment.treatment_end,
          recoveryStart: experiment.recovery_start,
          endedAt: experiment.ended_at,
          triggerSource: experiment.trigger_source,
          controllerWritesApplied: experiment.controller_writes_applied,
          action: experiment.action,
          errorSummary: experiment.error_summary,
        },
        devices,
        events,
        rollback,
        ...summary,
        // The projection replaces the measured figures ONLY where
        // `decideOverlay` permitted it — never when the real path already has a
        // supported measured claim. See demoOverlay.js for the precedence.
        ...(overlay?.applied
          ? { savings: overlay.savings, treatment: overlay.treatment, quality: overlay.quality }
          : {}),
        demoOverride: override,
        demoSimulation: publicOverlay(overlay),
        outstandingRestores: await repo.listOutstandingRestores(source.id),
      });
    })
  );

  router.get(`${BASE}/history`, (req, res) =>
    withSource(req, res, async (source) => {
      res.json({ experiments: await repo.listExperiments(source.id, req.query.limit) });
    })
  );

  /**
   * The comparison series. Ranges are server-side so the browser never pulls
   * raw telemetry: Live/24H/3D/7D/POC all resolve to one bucketed query.
   */
  router.get(`${BASE}/series`, (req, res) =>
    withSource(req, res, async (source) => {
      const range = String(req.query.range ?? '24h');
      const experimentId = req.query.experimentId;
      const experiment = experimentId
        ? await repo.getExperiment(experimentId)
        : (await repo.getActiveExperiment(source.id)) ?? (await repo.listExperiments(source.id, 1))[0];

      const config = await repo.getConfig(source.id);
      const treatmentSiteId = experiment?.treatment_site_id ?? config?.treatment_site_id;
      const controlSiteId = experiment?.control_site_id ?? config?.control_site_id;
      if (!treatmentSiteId || !controlSiteId) return fail(res, 400, 'No site pair is configured.');

      const now = nowFn();
      const RANGES = {
        live: { seconds: 2 * 3600, bucket: 60 },
        '24h': { seconds: 24 * 3600, bucket: 300 },
        '3d': { seconds: 3 * 86400, bucket: 900 },
        '7d': { seconds: 7 * 86400, bucket: 3600 },
      };

      let start;
      let end = now.toISOString();
      let bucket;
      if (range === 'poc' && experiment?.baseline_start) {
        start = experiment.baseline_start;
        end = experiment.ended_at ?? now.toISOString();
        const span = (new Date(end) - new Date(start)) / 1000;
        bucket = span > 6 * 3600 ? 300 : 60;
      } else {
        const r = RANGES[range] ?? RANGES['24h'];
        start = new Date(now.getTime() - r.seconds * 1000).toISOString();
        bucket = r.bucket;
      }

      const rows = await repo.fetchSiteSeries({
        sourceId: source.id,
        siteIds: [treatmentSiteId, controlSiteId],
        start,
        end,
        bucketSeconds: bucket,
      });

      const { overlay } = await resolveOverlay({
        source,
        experiment: experiment ?? null,
        config,
        bucketSeconds: bucket,
      });
      // Measured points win on any bucket where both exist; the projection
      // fills only what the real feed does not cover.
      const points = mergeSeriesPoints(rows, overlay?.seriesPoints ?? [], treatmentSiteId);

      const annotations = experiment
        ? (await repo.listEvents(experiment.id))
            .filter((e) =>
              ['optimization_activated', 'light_restored', 'darkness_persistence_satisfied',
               'restoration_verified', 'baseline_established'].includes(e.kind)
            )
            .map((e) => ({ at: e.occurredAt, kind: e.kind, message: e.message, provenance: e.provenance }))
        : [];

      res.json({
        range,
        start,
        end,
        bucketSeconds: bucket,
        treatment: { siteId: treatmentSiteId, siteName: experiment?.treatment_site_name ?? config?.treatment_site_name ?? null },
        control: { siteId: controlSiteId, siteName: experiment?.control_site_name ?? config?.control_site_name ?? null },
        points,
        annotations: overlay?.applied
          ? [
              ...annotations,
              {
                at: overlay.startedAt,
                kind: overlay.mode === 'lights_off' ? 'demo_simulation_started' : 'demo_simulation_recovering',
                message:
                  overlay.mode === 'lights_off'
                    ? 'Demo simulation: projected optimization begins here.'
                    : 'Demo simulation: projected recovery begins here.',
                provenance: 'simulated',
              },
            ]
          : annotations,
        demoSimulation: overlay
          ? { active: overlay.active, applied: overlay.applied, mode: overlay.mode, startedAt: overlay.startedAt }
          : null,
      });
    })
  );

  router.get(`${BASE}/aps`, (req, res) =>
    withSource(req, res, async (source) => {
      const experiment =
        (await repo.getActiveExperiment(source.id)) ?? (await repo.listExperiments(source.id, 1))[0];
      if (!experiment) return res.json({ aps: [] });

      const [devices, rollback, state] = await Promise.all([
        repo.listDevices(experiment.id),
        repo.listRollback(experiment.id),
        repo.fetchApCurrentState({
          sourceId: source.id,
          siteIds: [experiment.treatment_site_id, experiment.control_site_id],
        }),
      ]);
      const { overlay } = await resolveOverlay({ source, experiment });
      const projectedBySerial = overlay?.apInstant ?? new Map();

      const rollbackBySerial = new Map(rollback.map((r) => [r.apSerial, r]));
      const stateBySerial = new Map();
      for (const row of state) {
        if (!stateBySerial.has(row.apSerial)) stateBySerial.set(row.apSerial, { radios: [] });
        const entry = stateBySerial.get(row.apSerial);
        if (row.metricName === 'ap.power_watts') {
          entry.watts = row.value;
          entry.wattsAt = row.observedAt;
          entry.model = row.dimensions?.model ?? null;
        } else if (row.metricName === 'ap.client_count') {
          entry.clients = row.value;
        } else if (row.radioIndex) {
          let radio = entry.radios.find((r) => r.radioIndex === row.radioIndex);
          if (!radio) {
            radio = { radioIndex: row.radioIndex, band: row.dimensions?.band ?? null };
            entry.radios.push(radio);
          }
          if (row.metricName === 'radio.tx_power') radio.txPower = row.value;
          if (row.metricName === 'radio.admin_enabled') radio.enabled = row.value === 1;
          if (row.metricName === 'radio.clients') radio.clients = row.value;
        }
      }

      res.json({
        aps: devices.map((d) => {
          const live = stateBySerial.get(d.apSerial) ?? {};
          const rb = rollbackBySerial.get(d.apSerial) ?? null;
          // The control side is never projected, whatever the override says.
          const projected = d.side === 'treatment' ? projectedBySerial.get(d.apSerial) ?? null : null;
          const realState =
            d.side === 'control'
              ? 'control'
              : rb?.appliedAt && !rb?.restoreVerified
                // applyError is set by the effectiveness sweep when the config
                // landed but the radio is still transmitting. Such an AP is
                // changed — it still needs restoring — but it is NOT saving
                // anything, so it must not be counted as optimized.
                ? rb.applyError
                  ? 'changed_not_effective'
                  : 'optimized'
                : 'normal';
          return {
            ...d,
            currentWatts: projected?.watts ?? live.watts ?? null,
            observedAt: projected?.observedAt ?? live.wattsAt ?? null,
            clients: live.clients ?? null,
            radios: (live.radios ?? []).sort((a, b) => Number(a.radioIndex) - Number(b.radioIndex)),
            energyState:
              projected && overlay?.mode === 'lights_off' && realState === 'normal'
                ? 'optimized'
                : realState,
            telemetrySource: projected
              ? VALUE_SOURCE.DEMO_SIMULATED
              : live.watts != null
                ? 'measured'
                : 'none',
            valueSource: projected
              ? VALUE_SOURCE.DEMO_SIMULATED
              : live.watts != null
                ? VALUE_SOURCE.REAL
                : null,
            rollback: rb
              ? {
                  capturedAt: rb.capturedAt,
                  appliedAt: rb.appliedAt,
                  applyVerified: rb.applyVerified,
                  restoreVerified: rb.restoreVerified,
                  restoreError: rb.restoreError,
                }
              : null,
          };
        }),
        demoSimulation: overlay
          ? { active: overlay.active, applied: overlay.applied, mode: overlay.mode }
          : null,
      });
    })
  );

  /* ------------------------------------------------------------- lifecycle */

  router.post(`${BASE}/start`, requireOperator, jsonBody, (req, res) =>
    withSource(req, res, async (source) => {
      const session = await sessionFor(source);
      const result = await engine.startExperiment({
        source,
        session,
        name: req.body?.name,
        startedBy: req.user?.userId ?? req.body?.startedBy ?? null,
        now: nowFn(),
      });
      record(req, 'energy.experiment.start', { ok: result.ok, experimentId: result.experiment?.id });
      if (!result.ok) return fail(res, 409, result.error, { anomalies: result.anomalies });
      res.json(result);
    })
  );

  router.post(`${BASE}/baseline/close`, requireOperator, jsonBody, (req, res) =>
    withSource(req, res, async (source) => {
      const experiment = await repo.getActiveExperiment(source.id);
      if (!experiment) return fail(res, 404, 'No experiment is in flight.');
      const result = await engine.establishBaseline({ source, experimentId: experiment.id, now: nowFn() });
      record(req, 'energy.experiment.baseline_close', { experimentId: experiment.id, ok: result.ok });
      if (!result.ok) return fail(res, 409, result.error);
      res.json(result);
    })
  );

  /** Manual activation. Recorded as trigger_source='manual' — never as a sensor event. */
  router.post(`${BASE}/activate`, requireOperator, jsonBody, (req, res) =>
    withSource(req, res, async (source) => {
      const experiment = await repo.getActiveExperiment(source.id);
      if (!experiment) return fail(res, 404, 'No experiment is in flight.');
      const session = await sessionFor(source);
      const result = await engine.activateOptimization({
        source,
        session,
        experimentId: experiment.id,
        triggerSource: 'manual',
        provenance: 'live',
        applyWrites: req.body?.applyWrites !== false,
        now: nowFn(),
      });
      record(req, 'energy.experiment.activate', { experimentId: experiment.id, ok: result.ok });
      if (!result.ok) return fail(res, 409, result.error);
      await engine.finalize({ source, experimentId: experiment.id, now: nowFn() });
      res.json(result);
    })
  );

  router.post(`${BASE}/restore`, requireOperator, jsonBody, (req, res) =>
    withSource(req, res, async (source) => {
      const experimentId =
        req.body?.experimentId ?? (await repo.getActiveExperiment(source.id))?.id ??
        (await repo.listExperiments(source.id, 1))[0]?.id;
      if (!experimentId) return fail(res, 404, 'No experiment to restore.');
      const session = await sessionFor(source);
      const result = await engine.restoreTreatment({
        source, session, experimentId, reason: req.body?.reason ?? 'operator_request', now: nowFn(),
      });
      record(req, 'energy.experiment.restore', {
        experimentId, ok: result.ok, unverified: result.unverified?.length ?? 0,
      });
      await engine.finalize({ source, experimentId, now: nowFn() });
      // A partial restore is not a server error — it is a true, important result.
      res.status(result.ok ? 200 : 207).json(result);
    })
  );

  /**
   * Emergency restore, independent of any experiment state: sweep every AP this
   * system ever changed and did not confirm back. This is the button someone
   * reaches for when they do not know what state the lab is in.
   */
  router.post(`${BASE}/restore-all`, requireOperator, jsonBody, (req, res) =>
    withSource(req, res, async (source) => {
      const outstanding = await repo.listOutstandingRestores(source.id);
      const byExperiment = [...new Set(outstanding.map((o) => o.experimentId))];
      const session = await sessionFor(source);
      const results = [];
      for (const experimentId of byExperiment) {
        results.push(await engine.restoreTreatment({
          source, session, experimentId, reason: 'emergency_restore_all', now: nowFn(),
        }));
      }
      const unverified = results.flatMap((r) => r.unverified ?? []);
      record(req, 'energy.experiment.restore_all', {
        experiments: byExperiment.length, unverified: unverified.length,
      });
      res.status(unverified.length === 0 ? 200 : 207).json({
        ok: unverified.length === 0,
        experiments: byExperiment.length,
        restored: results.flatMap((r) => r.restored ?? []),
        unverified,
      });
    })
  );

  /* --------------------------------------------------------- demo override */

  /**
   * Drive the sensor INPUT, not the output.
   *
   * A simulated lights-off writes the same shaped rows the real lightguard
   * agent writes, into the same table, and then the same evaluateTrigger, the
   * same scope guard, the same controller write and the same read-back run. The
   * only difference is one column that says `simulated` forever.
   */
  router.post(`${BASE}/demo`, requireOperator, jsonBody, (req, res) =>
    withSource(req, res, async (source) => {
      const mode = String(req.body?.mode ?? '');
      const valid = ['lights_off', 'lights_on', 'sensor_failure', 'reset'];
      if (!valid.includes(mode)) {
        return fail(res, 400, `mode must be one of ${valid.join(', ')}.`, { errorClass: 'validation' });
      }

      /**
       * The projected reduction share in effect at this instant, carried into
       * the next mode.
       *
       * Without it, toggling lights off → on → off part-way through a ramp
       * makes the projected curve jump: the recovery would start from zero
       * rather than from where the line actually was. Repeated toggling is
       * exactly what a nervous presenter does, so it has to be stable.
       *
       * Read from the live overlay where there is one, because that is the
       * share the screen is ACTUALLY showing — it is the mean of the per-AP
       * varied shares, not the base constant. Using the constant here left a
       * visible half-point step at the handover. The pure computation is the
       * fallback for when the overlay cannot be built.
       */
      const previous = describeOverride(source.id);
      let fromShare = 0;
      if (previous.projection) {
        const priorConfig = await repo.getConfig(source.id);
        const priorExperiment = await repo.getActiveExperiment(source.id);
        const { overlay: priorOverlay } = await resolveOverlay({
          source,
          experiment: priorExperiment,
          config: priorConfig,
        });
        if (Number.isFinite(priorOverlay?.reductionShare)) {
          fromShare = priorOverlay.reductionShare;
        } else {
          const elapsed = (nowFn().getTime() - Date.parse(previous.projection.startedAt)) / 1000;
          fromShare = shareAt({
            mode: previous.projection.mode,
            elapsedSeconds: elapsed,
            targetShare: MEASURED_RADIO_DISABLE_SHARE,
            fromShare: previous.projection.fromShare ?? 0,
          });
        }
      }

      clearOverride(source.id);
      record(req, 'energy.experiment.demo_override', { mode });

      if (mode === 'reset') {
        const experiment = await repo.getActiveExperiment(source.id);
        if (experiment) {
          await repo.insertEvent({
            experimentId: experiment.id, sourceId: source.id, kind: 'simulation_disabled',
            severity: 'warning', message: 'Demo override cleared; the live sensor feed is authoritative again.',
            provenance: 'simulated',
          });
        }
        // Close the audit record. The live override is already gone; this is
        // the history of it, and an episode left open would block the next one.
        const closed = await repo
          .closeDemoEpisode({ sourceId: source.id, reason: 'reset_to_live_sensor', reductionShare: fromShare })
          .catch(() => null);
        return res.json({ demoOverride: describeOverride(source.id), episode: closed });
      }

      const experiment = await repo.getActiveExperiment(source.id);

      // A simulated sensor failure is a simulation of the TRIGGER only, so it
      // needs an experiment whose trigger it can starve. The light modes do
      // not: if the call that would have started the experiment is what failed,
      // the fallback still has to put the story on screen.
      if (mode === 'sensor_failure' && !experiment) {
        return fail(res, 409, 'Start an experiment before simulating a sensor failure.');
      }

      const devices = experiment ? await repo.listDevices(experiment.id) : [];
      const treatmentSerials = devices.filter((d) => d.side === 'treatment').map((d) => d.apSerial);

      if (mode === 'sensor_failure') {
        setOverride(source.id, {
          mode, startedAt: nowFn().toISOString(), startedBy: req.user?.userId ?? null, timer: null,
        });
        await repo.insertEvent({
          experimentId: experiment.id, sourceId: source.id, kind: 'simulation_activated',
          severity: 'warning', side: 'treatment',
          message: 'Simulated sensor failure: the Treatment sensor feed is being withheld. No trigger will fire.',
          provenance: 'simulated',
        });
        return res.json({ demoOverride: describeOverride(source.id) });
      }

      const config = await repo.getConfig(source.id);
      const raw =
        mode === 'lights_off'
          ? Math.max(0, (config?.darkness_threshold_raw ?? 3) - 1)
          : (config?.recovery_threshold_raw ?? 6) + 20;
      const state = mode === 'lights_off' ? 'dark' : 'light';

      async function emit() {
        for (const serial of treatmentSerials) {
          await ingestLightReport({
            sourceId: source.id, serial, state, data: raw, sampleSource: 'simulated',
          }).catch(() => undefined);
        }
      }

      // Persistence is a real requirement, not a formality: emit immediately
      // and then on a cadence, so the configured dwell has to genuinely elapse
      // before the policy fires. The demo does not skip its own safety logic.
      //
      // This drives the REAL path — sensor rows, trigger, controller write. It
      // runs whenever there is an experiment to run it against, and the
      // display-layer projection runs alongside it as the fail-safe. If the
      // real path works, `decideOverlay` stands the projection down.
      let timer = null;
      if (experiment && treatmentSerials.length > 0) {
        await emit();
        timer = setInterval(() => {
          emit()
            .then(() => engine.sessionFor(source))
            .then((session) => engine.evaluateTrigger({ source, session, now: nowFn() }))
            .catch(() => undefined);
        }, 15_000);
        if (typeof timer.unref === 'function') timer.unref();
      }

      const startedAt = nowFn().toISOString();
      setOverride(source.id, {
        mode,
        startedAt,
        startedBy: req.user?.userId ?? null,
        timer,
        // Where the projected curve resumes from, so a mid-ramp toggle is smooth.
        fromShare,
      });

      if (experiment) {
        await repo.insertEvent({
          experimentId: experiment.id, sourceId: source.id, kind: 'simulated_light_event',
          severity: 'warning', side: 'treatment',
          message: `Simulated ${mode === 'lights_off' ? 'lights off' : 'lights on'} at Treatment (raw ${raw}) across ${treatmentSerials.length} AP(s).`,
          detail: { raw, state, serials: treatmentSerials },
          provenance: 'simulated',
        });
      }

      // The audit record of this activation. Separate table, DEMO_SIMULATED by
      // constraint, never read by the environmental report.
      const treatmentSiteId = experiment?.treatment_site_id ?? config?.treatment_site_id ?? null;
      const baselineAps = treatmentSiteId
        ? await repo
            .fetchApBaselineWatts({ sourceId: source.id, siteId: treatmentSiteId, before: startedAt })
            .catch(() => [])
        : [];
      const usableBaseline = baselineAps.filter((a) => Number.isFinite(a.baselineWatts) && a.baselineWatts > 0);
      const episode = await repo
        .openDemoEpisode({
          sourceId: source.id,
          experimentId: experiment?.id ?? null,
          siteId: treatmentSiteId,
          siteName: experiment?.treatment_site_name ?? config?.treatment_site_name ?? null,
          controlSiteId: experiment?.control_site_id ?? config?.control_site_id ?? null,
          controlSiteName: experiment?.control_site_name ?? config?.control_site_name ?? null,
          mode,
          startedBy: req.user?.userId ?? null,
          baselineWattsPerAp: usableBaseline.length
            ? usableBaseline.reduce((sum, a) => sum + a.baselineWatts, 0) / usableBaseline.length
            : null,
          apCount: usableBaseline.length,
          reductionShare: mode === 'lights_off' ? MEASURED_RADIO_DISABLE_SHARE : 0,
          projection: {
            fromShare,
            baseShare: MEASURED_RADIO_DISABLE_SHARE,
            controllerPathDriven: Boolean(experiment && treatmentSerials.length > 0),
            baselineSerials: usableBaseline.map((a) => a.apSerial),
          },
        })
        .catch(() => null);

      if (episode?.id) attachEpisode(source.id, episode.id);

      res.json({
        demoOverride: describeOverride(source.id),
        emitted: treatmentSerials.length,
        raw,
        episode,
        projectionOnly: !experiment,
        persistenceSeconds:
          mode === 'lights_off'
            ? config?.darkness_persistence_seconds ?? 120
            : config?.recovery_persistence_seconds ?? 60,
      });
    })
  );

  /**
   * The demo-simulation audit trail.
   *
   * Every activation of the fail-safe, what it was projecting from, and how long
   * it ran. Read-only and deliberately findable: "was any of this simulated?"
   * must be answerable without reading code.
   */
  router.get(`${BASE}/demo/episodes`, (req, res) =>
    withSource(req, res, async (source) => {
      res.json({ episodes: await repo.listDemoEpisodes(source.id, req.query.limit) });
    })
  );

  /**
   * Extrapolate the OBSERVED result to a larger deployment.
   *
   * Feeds the existing Energy scenario engine rather than adding a second one,
   * and prefers the measured per-AP watt saving over the band-share model —
   * which, on the first controlled measurement, was 57% optimistic.
   */
  router.get(`${BASE}/scenario`, (req, res) =>
    withSource(req, res, async (source) => {
      const experiment = req.query.experimentId
        ? await repo.getExperiment(req.query.experimentId)
        : (await repo.getActiveExperiment(source.id)) ?? (await repo.listExperiments(source.id, 1))[0];
      if (!experiment) return fail(res, 404, 'No experiment to extrapolate from.');

      const summary = await engine.summarize({ source, experiment, now: nowFn() });
      const prefs = (await getRatePreferences(source.id)) ?? { ratePerKwh: 0.14, currencySymbol: '$', currencyCode: 'USD' };

      const apCounts = String(req.query.apCounts ?? '10,100,1000,10000')
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 1_000_000)
        .slice(0, 12);
      const hours = String(req.query.hoursPerDay ?? '1,4,8,12')
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 24)
        .slice(0, 8);

      const observedWattsPerAp = summary.savings?.attributed?.deltaWattsPerAp ?? null;
      const baselineWattsPerAp = summary.baseline?.treatment?.wattsPerAp ?? null;

      const projections = [];
      for (const apCount of apCounts) {
        for (const hoursPerDay of hours) {
          projections.push(
            extrapolateObserved({
              observedWattsPerAp,
              apCount,
              hoursPerDay,
              ratePerKwh: prefs.ratePerKwh,
              emissionsFactorKgPerKwh:
                prefs.emissionsFactorKgPerKwh ?? summary.savings?.emissionsFactorKgPerKwh ?? null,
              observedBaselineWattsPerAp: baselineWattsPerAp,
            })
          );
        }
      }

      res.json({
        observed: {
          wattsPerAp: observedWattsPerAp,
          baselineWattsPerAp,
          percent: summary.savings?.attributed?.percent ?? null,
          apCount: summary.treatment?.treatment?.apCount ?? 0,
          method: summary.savings?.attributed?.method ?? null,
          provenance: summary.savings?.provenance ?? null,
          claimSupported: summary.savings?.claimSupported ?? false,
        },
        currency: { code: prefs.currencyCode, symbol: prefs.currencySymbol, ratePerKwh: prefs.ratePerKwh },
        projections,
        // Said plainly so nobody reads a projection as a measurement.
        note:
          'Projections scale a measured per-AP watt reduction. They assume the same action, the same AP class, and the stated hours per day.',
      });
    })
  );

  /** The live trigger view — what the sensor logic currently believes. */
  router.get(`${BASE}/trigger`, (req, res) =>
    withSource(req, res, async (source) => {
      const experiment = await repo.getActiveExperiment(source.id);
      if (!experiment) return res.json({ active: false });
      const config = await repo.getConfig(source.id);
      const devices = await repo.listDevices(experiment.id);
      const treatmentSerials = devices.filter((d) => d.side === 'treatment').map((d) => d.apSerial);
      const samples = await fetchRecentLightSamples({
        sourceId: source.id, serials: treatmentSerials, sinceSeconds: 1800,
        sampleSource: evaluationSampleSource(source.id),
      });
      const now = nowFn();
      res.json({
        active: true,
        state: experiment.state,
        darkness: evaluateSide({
          samplesByAp: samples, serials: treatmentSerials, mode: 'dark', now,
          threshold: config?.darkness_threshold_raw ?? 3,
          persistenceSeconds: config?.darkness_persistence_seconds ?? 120,
        }),
        light: evaluateSide({
          samplesByAp: samples, serials: treatmentSerials, mode: 'light', now,
          threshold: config?.recovery_threshold_raw ?? 6,
          persistenceSeconds: config?.recovery_persistence_seconds ?? 60,
        }),
        demoOverride: describeOverride(source.id),
      });
    })
  );

  return router;
}

export const __resetDemoOverridesForTests = __resetOverrides;
