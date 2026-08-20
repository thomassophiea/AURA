/**
 * System introspection API.
 *
 * Exists so a separate QA/validation application can answer questions about a
 * running AURA deployment without shelling into it or holding Railway
 * credentials: what version is this, is it healthy, are its dependencies
 * reachable, and does its configuration match the other environment's.
 *
 * Two rules shape everything here:
 *
 *  1. **No secrets, ever.** Configuration is reported as variable *names* and
 *     whether they are set — never a value, never a length, never a prefix.
 *     These endpoints are reachable by anything that can reach the app.
 *  2. **Degrade, never crash.** Each dependency probe is independently
 *     try/caught. An endpoint that 500s when a dependency is down is useless
 *     precisely when it is needed, so a broken dependency becomes a `status`
 *     field rather than an exception.
 *
 * The pre-existing `/health` and `/api/version` endpoints are untouched;
 * anything already pointed at them keeps working.
 */

import express from 'express';

import { checkDatabaseHealth, isDatabaseConfigured, query } from '../db/pool.js';
import { describeDatabaseEnvironment } from '../db/environmentGuard.js';
import { describeEnvironment, describeVariables } from './environment.js';
import { loadCwpConfig, cwpRequest } from '../guests/cwpClient.js';
import { sanitizeMessage } from '../monitoring/errorSanitizer.js';

/** How long a dependency probe may take before it is called unreachable. */
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Collector liveness, inferred from data rather than from a heartbeat.
 *
 * A heartbeat only proves the process is alive; the age of the newest sample
 * proves it is actually *collecting*, which is the thing anyone cares about.
 * `staleAfterSeconds` comes from the same config the collector runs on, so the
 * threshold cannot drift away from the poll interval.
 */
async function probeCollector(config, queryFn = query) {
  if (!isDatabaseConfigured()) return { status: 'not_configured' };
  try {
    const { rows } = await queryFn(
      `SELECT max(observed_at) AS newest, count(*) AS total
         FROM metric_samples
        WHERE observed_at > now() - interval '2 hours'`
    );
    const newest = rows[0]?.newest ? new Date(rows[0].newest) : null;
    if (!newest) {
      return { status: 'idle', newestSampleAt: null, recentSamples: 0 };
    }
    const ageSeconds = Math.round((Date.now() - newest.getTime()) / 1000);
    const threshold = (config?.staleAfterSeconds ?? 180) * 2;
    return {
      status: ageSeconds <= threshold ? 'running' : 'stale',
      newestSampleAt: newest.toISOString(),
      ageSeconds,
      staleAfterSeconds: threshold,
      recentSamples: Number(rows[0].total) || 0,
    };
  } catch (error) {
    return { status: 'unreachable', message: sanitizeMessage(error.message) };
  }
}

/**
 * Cleanup liveness.
 *
 * There is no cleanup-run table, so the observable proof that retention is
 * working is the age of the *oldest* surviving sample: if it is meaningfully
 * older than the retention window, nothing is sweeping.
 */
async function probeCleanup(config, queryFn = query) {
  if (!isDatabaseConfigured()) return { status: 'not_configured' };
  const retentionDays = config?.retentionDays ?? 7;
  try {
    const { rows } = await queryFn(
      `SELECT min(observed_at) AS oldest,
              count(*) FILTER (WHERE expires_at < now()) AS overdue
         FROM metric_samples`
    );
    const oldest = rows[0]?.oldest ? new Date(rows[0].oldest) : null;
    const overdue = Number(rows[0]?.overdue) || 0;
    const windowDays = oldest ? (Date.now() - oldest.getTime()) / 86_400_000 : 0;
    return {
      // One day of slack: the sweep runs hourly, so a little overshoot is normal.
      status: windowDays <= retentionDays + 1 ? 'ok' : 'behind',
      retentionDays,
      oldestSampleAt: oldest ? oldest.toISOString() : null,
      windowDays: Number(windowDays.toFixed(2)),
      expiredRowsAwaitingSweep: overdue,
    };
  } catch (error) {
    return { status: 'unreachable', message: sanitizeMessage(error.message) };
  }
}

/** Schema state, so two environments' migration levels can be compared. */
async function probeSchema(queryFn = query) {
  if (!isDatabaseConfigured()) return { status: 'not_configured' };
  try {
    const { rows } = await queryFn(
      'SELECT name, applied_at FROM schema_migrations ORDER BY name'
    );
    return {
      status: 'ok',
      count: rows.length,
      latest: rows.length ? rows[rows.length - 1].name : null,
      applied: rows.map((r) => r.name),
    };
  } catch (error) {
    if (error.code === '42P01') return { status: 'not_migrated' };
    return { status: 'unreachable', message: sanitizeMessage(error.message) };
  }
}

/**
 * The captive portal, over private networking.
 *
 * This deliberately exercises the *internal guest API* — the path AURA actually
 * depends on — rather than the portal's public `/health`. An earlier version
 * probed `/health` with a fallback that stripped the API prefix, and it reported
 * `ok` for a deployment whose `CWP_INTERNAL_API_URL` already contained
 * `/api/internal`: every real guest call was 404ing on a doubled prefix while
 * this endpoint showed green. A dependency probe that cannot fail the way the
 * dependency actually fails is worse than no probe, because it is believed.
 */
async function probeCwp(fetchFn = fetch) {
  const config = loadCwpConfig();
  if (!config.configured) return { status: 'not_configured' };
  try {
    // limit=1 keeps it cheap; the point is that the route resolves and
    // authenticates, not the contents.
    const listed = await cwpRequest('/api/internal/guests?limit=1', { config, fetchFn });
    const health = await cwpRequest('/health', { config, fetchFn }).catch(() => null);
    return {
      status: 'ok',
      internalApi: 'reachable',
      guestsKnown: typeof listed?.total === 'number' ? listed.total : null,
      service: health?.service ?? null,
      commit: health?.commit ?? null,
      checks: health?.checks ?? null,
    };
  } catch (error) {
    return {
      status: 'unreachable',
      internalApi: 'failed',
      // The base URL is not a secret and naming it is the fastest way to spot a
      // doubled or missing path prefix.
      baseUrl: config.baseUrl,
      httpStatus: error.status ?? null,
      message: sanitizeMessage(error.message),
    };
  }
}

/**
 * Gateway reachability.
 *
 * Unauthenticated on purpose — a 401 proves the controller is up and answering,
 * which is the whole question, and it avoids spending a login on a health probe.
 */
async function probeGateway(fetchFn = fetch) {
  const raw = (process.env.CAMPUS_CONTROLLER_URL ?? '').trim();
  if (!raw) return { status: 'not_configured' };
  const base = raw.replace(/\/+$/, '').replace(/\/(api\/)?management$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetchFn(`${base}/management/v1/aps`, {
      method: 'GET',
      signal: controller.signal,
    });
    return {
      status: 'reachable',
      httpStatus: res.status,
      authenticated: res.status !== 401,
      latencyMs: Date.now() - started,
      host: new URL(base).host,
    };
  } catch (error) {
    return { status: 'unreachable', message: sanitizeMessage(error.message) };
  } finally {
    clearTimeout(timer);
  }
}

/** Read the build stamp written by scripts/generate-version.js, or Railway's env. */
async function readVersion(dirname) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  for (const candidate of ['build/version.json', 'public/version.json']) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dirname, candidate), 'utf8'));
      if (data.commit && data.commit !== 'unknown') return { ...data, source: candidate };
    } catch {
      /* try the next candidate */
    }
  }
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.AURA_GIT_COMMIT_SHA || '';
  const source = process.env.RAILWAY_GIT_COMMIT_SHA ? 'railway-env' : 'aura-env';
  return {
    version: sha ? `v0.${sha.slice(0, 7)}` : 'unknown',
    commit: sha ? sha.slice(0, 7) : 'unknown',
    commitFull: sha || null,
    branch: process.env.RAILWAY_GIT_BRANCH || process.env.AURA_GIT_BRANCH || 'unknown',
    source,
  };
}

/**
 * @param {{ config: object|null, dirname: string, deps?: object }} options
 */
export function createSystemRouter({ config = null, dirname = process.cwd(), deps = {} } = {}) {
  const router = express.Router();
  const {
    queryFn = query,
    fetchFn = fetch,
    probeCwpFn = probeCwp,
    probeGatewayFn = probeGateway,
  } = deps;

  /** Identity and version. Cheap, no dependencies — safe to poll. */
  router.get('/v1/system/version', async (_req, res) => {
    const env = describeEnvironment();
    const version = await readVersion(dirname);
    res.json({
      ...env,
      ...version,
      releaseTag: process.env.AURA_RELEASE_TAG || null,
      deployedAt: process.env.RAILWAY_DEPLOYMENT_CREATED_AT || null,
      serviceName: process.env.RAILWAY_SERVICE_NAME || null,
      nodeEnv: process.env.NODE_ENV || null,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Rollup health. 200 when every configured dependency is usable, 503
   * otherwise, so a QA app can treat the status code alone as the answer.
   */
  router.get('/v1/system/health', async (_req, res) => {
    const env = describeEnvironment();
    const [database, dbEnvironment, collector, cleanup, cwp] = await Promise.all([
      checkDatabaseHealth(),
      describeDatabaseEnvironment({ queryFn }),
      probeCollector(config, queryFn),
      probeCleanup(config, queryFn),
      probeCwpFn(fetchFn),
    ]);

    const components = { database, collector, cleanup, cwp };
    const failing = [];
    if (isDatabaseConfigured() && !database.ok) failing.push('database');
    // A mismatched stamp is the most serious thing this endpoint can report:
    // the app is talking to the wrong environment's data.
    if (dbEnvironment.matches === false) failing.push('databaseEnvironment');
    if (collector.status === 'unreachable' || collector.status === 'stale') failing.push('collector');
    if (cleanup.status === 'unreachable' || cleanup.status === 'behind') failing.push('cleanup');
    if (cwp.status === 'unreachable') failing.push('cwp');

    const healthy = failing.length === 0;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      ...env,
      failing,
      databaseEnvironment: dbEnvironment,
      components,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Per-dependency detail plus configuration *shape*, for drift comparison
   * between Integration and Production Demo. Names only — never values.
   */
  router.get('/v1/system/dependencies', async (_req, res) => {
    const env = describeEnvironment();
    const [database, dbEnvironment, schema, collector, cleanup, cwp, gateway] = await Promise.all([
      checkDatabaseHealth(),
      describeDatabaseEnvironment({ queryFn }),
      probeSchema(queryFn),
      probeCollector(config, queryFn),
      probeCleanup(config, queryFn),
      probeCwpFn(fetchFn),
      probeGatewayFn(fetchFn),
    ]);

    res.json({
      ...env,
      timestamp: new Date().toISOString(),
      dependencies: {
        database: { ...database, ...dbEnvironment, schema },
        collector,
        cleanup,
        cwp,
        gateway,
      },
      configuration: describeVariables(process.env, env.role),
      features: {
        monitoring: Boolean(config),
        guestManagement: loadCwpConfig().configured,
        collectorInProcess: config?.collectorInProcess ?? false,
        cleanupInProcess: config?.cleanupInProcess ?? false,
        retentionDays: config?.retentionDays ?? null,
      },
    });
  });

  return router;
}

export const __testables = { probeCollector, probeCleanup, probeSchema, probeGateway, probeCwp };
