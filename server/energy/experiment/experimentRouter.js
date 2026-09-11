/**
 * /api/energy/experiment/* — the North-vs-South POC API.
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
import { getRatePreferences } from '../energyRepository.js';

import {
  clearOverride,
  describeOverride,
  evaluationSampleSource,
  setOverride,
  __resetOverrides,
} from './demoOverrideRegistry.js';

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

  /* ------------------------------------------------------------- discovery */

  router.get(`${BASE}/discovery`, (req, res) =>
    withSource(req, res, async (source) => {
      const config = await repo.getConfig(source.id);
      const session = await sessionFor(source);
      const found = await discover({
        session,
        configuredPair: { northSiteId: config?.north_site_id, southSiteId: config?.south_site_id },
      });
      if (!found.ok) return fail(res, 502, found.error);
      res.json({
        sites: found.sites.map((s) => ({ siteId: s.siteId, siteName: s.siteName, timezone: s.timezone })),
        pair: found.pair,
        membership: found.membership,
        anomalies: found.anomalies,
        configured: config
          ? { northSiteId: config.north_site_id, southSiteId: config.south_site_id }
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
      if (body.northSiteId && body.southSiteId && body.northSiteId === body.southSiteId) {
        return fail(res, 400, 'North and South must be different sites.', { errorClass: 'validation' });
      }
      const saved = await repo.upsertConfig({ sourceId: source.id, ...body });
      record(req, 'energy.experiment.config', { northSiteId: saved.north_site_id, southSiteId: saved.south_site_id });
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
        return res.json({
          experiment: null,
          demoOverride: describeOverride(source.id),
          outstandingRestores: await repo.listOutstandingRestores(source.id),
        });
      }

      const [devices, events, rollback, summary] = await Promise.all([
        repo.listDevices(experiment.id),
        repo.listEvents(experiment.id),
        repo.listRollback(experiment.id),
        engine.summarize({ source, experiment, now: nowFn() }),
      ]);

      res.json({
        experiment: {
          id: experiment.id,
          name: experiment.name,
          state: experiment.state,
          north: { siteId: experiment.north_site_id, siteName: experiment.north_site_name },
          south: { siteId: experiment.south_site_id, siteName: experiment.south_site_name },
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
        demoOverride: describeOverride(source.id),
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
      const northSiteId = experiment?.north_site_id ?? config?.north_site_id;
      const southSiteId = experiment?.south_site_id ?? config?.south_site_id;
      if (!northSiteId || !southSiteId) return fail(res, 400, 'No site pair is configured.');

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
        siteIds: [northSiteId, southSiteId],
        start,
        end,
        bucketSeconds: bucket,
      });

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
        north: { siteId: northSiteId, siteName: experiment?.north_site_name ?? config?.north_site_name ?? null },
        south: { siteId: southSiteId, siteName: experiment?.south_site_name ?? config?.south_site_name ?? null },
        points: rows,
        annotations,
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
          siteIds: [experiment.north_site_id, experiment.south_site_id],
        }),
      ]);
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
          return {
            ...d,
            currentWatts: live.watts ?? null,
            observedAt: live.wattsAt ?? null,
            clients: live.clients ?? null,
            radios: (live.radios ?? []).sort((a, b) => Number(a.radioIndex) - Number(b.radioIndex)),
            energyState:
              d.side === 'south'
                ? 'control'
                : rb?.appliedAt && !rb?.restoreVerified
                  // applyError is set by the effectiveness sweep when the config
                  // landed but the radio is still transmitting. Such an AP is
                  // changed — it still needs restoring — but it is NOT saving
                  // anything, so it must not be counted as optimized.
                  ? rb.applyError
                    ? 'changed_not_effective'
                    : 'optimized'
                  : 'normal',
            telemetrySource: live.watts != null ? 'measured' : 'none',
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
      const result = await engine.restoreNorth({
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
        results.push(await engine.restoreNorth({
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
        return res.json({ demoOverride: describeOverride(source.id) });
      }

      const experiment = await repo.getActiveExperiment(source.id);
      if (!experiment) return fail(res, 409, 'Start an experiment before using the demo override.');
      const devices = await repo.listDevices(experiment.id);
      const northSerials = devices.filter((d) => d.side === 'north').map((d) => d.apSerial);

      if (mode === 'sensor_failure') {
        setOverride(source.id, {
          mode, startedAt: nowFn().toISOString(), startedBy: req.user?.userId ?? null, timer: null,
        });
        await repo.insertEvent({
          experimentId: experiment.id, sourceId: source.id, kind: 'simulation_activated',
          severity: 'warning', side: 'north',
          message: 'Simulated sensor failure: the North sensor feed is being withheld. No trigger will fire.',
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
        for (const serial of northSerials) {
          await ingestLightReport({
            sourceId: source.id, serial, state, data: raw, sampleSource: 'simulated',
          }).catch(() => undefined);
        }
      }

      // Persistence is a real requirement, not a formality: emit immediately
      // and then on a cadence, so the configured dwell has to genuinely elapse
      // before the policy fires. The demo does not skip its own safety logic.
      await emit();
      const timer = setInterval(() => {
        emit()
          .then(() => engine.sessionFor(source))
          .then((session) => engine.evaluateTrigger({ source, session, now: nowFn() }))
          .catch(() => undefined);
      }, 15_000);
      if (typeof timer.unref === 'function') timer.unref();

      setOverride(source.id, {
        mode, startedAt: nowFn().toISOString(), startedBy: req.user?.userId ?? null, timer,
      });

      await repo.insertEvent({
        experimentId: experiment.id, sourceId: source.id, kind: 'simulated_light_event',
        severity: 'warning', side: 'north',
        message: `Simulated ${mode === 'lights_off' ? 'lights off' : 'lights on'} at North (raw ${raw}) across ${northSerials.length} AP(s).`,
        detail: { raw, state, serials: northSerials },
        provenance: 'simulated',
      });

      res.json({
        demoOverride: describeOverride(source.id),
        emitted: northSerials.length,
        raw,
        persistenceSeconds:
          mode === 'lights_off'
            ? config?.darkness_persistence_seconds ?? 120
            : config?.recovery_persistence_seconds ?? 60,
      });
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
      const baselineWattsPerAp = summary.baseline?.north?.wattsPerAp ?? null;

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
          apCount: summary.treatment?.north?.apCount ?? 0,
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
      const northSerials = devices.filter((d) => d.side === 'north').map((d) => d.apSerial);
      const samples = await fetchRecentLightSamples({
        sourceId: source.id, serials: northSerials, sinceSeconds: 1800,
        sampleSource: evaluationSampleSource(source.id),
      });
      const now = nowFn();
      res.json({
        active: true,
        state: experiment.state,
        darkness: evaluateSide({
          samplesByAp: samples, serials: northSerials, mode: 'dark', now,
          threshold: config?.darkness_threshold_raw ?? 3,
          persistenceSeconds: config?.darkness_persistence_seconds ?? 120,
        }),
        light: evaluateSide({
          samplesByAp: samples, serials: northSerials, mode: 'light', now,
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
