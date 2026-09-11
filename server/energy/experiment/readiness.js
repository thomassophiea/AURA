/**
 * POC readiness.
 *
 * Answers one question — "can this demonstration be given right now?" — and
 * refuses to answer it optimistically. Every check reports what it actually
 * found; nothing defaults to ready. A check that cannot run is `unknown`, which
 * is not `pass`.
 */

import { query, checkDatabaseHealth } from '../../db/pool.js';
import * as repo from './experimentRepository.js';
import { discover } from './siteDiscovery.js';
import { selectBaselineWindow } from './analysis.js';

const SENSOR_MODELS = ['AP4020', 'AP4060', 'AP5020', 'AP5022'];

function supportsLightSensor(model) {
  const m = String(model ?? '').toUpperCase();
  return SENSOR_MODELS.some((s) => m.includes(s));
}

function check(id, label, status, detail, extra = {}) {
  return { id, label, status, detail, ...extra };
}

/** Freshness of the measured energy feed, per site. */
async function energyFreshness(sourceId, siteIds) {
  if (!siteIds.length) return [];
  const { rows } = await query(
    `SELECT site_id AS "siteId",
            MAX(observed_at) AS "latest",
            COUNT(DISTINCT device_external_id)::int AS "apCount"
     FROM metric_samples
     WHERE monitored_source_id = $1
       AND metric_family = 'energy_ap_state'
       AND metric_name = 'ap.power_watts'
       AND site_id = ANY($2::text[])
       AND observed_at >= now() - interval '2 hours'
     GROUP BY site_id`,
    [sourceId, siteIds]
  );
  return rows;
}

/** Last successful run of the energy collector. */
async function collectorHealth(sourceId) {
  const { rows } = await query(
    `SELECT status, started_at AS "startedAt", completed_at AS "completedAt",
            records_inserted AS "recordsInserted", error_class AS "errorClass"
     FROM collection_runs
     WHERE monitored_source_id = $1 AND collector_name = 'energy_ap_state'
     ORDER BY started_at DESC LIMIT 1`,
    [sourceId]
  );
  return rows[0] ?? null;
}

/** Sensor feed state per AP, and whether anything is simulated. */
async function sensorHealth(sourceId, serials) {
  if (!serials.length) return { perAp: [], anySimulated: false };
  const { rows } = await query(
    `SELECT DISTINCT ON (ap_serial)
            ap_serial AS "apSerial", lux AS raw, sample_source AS "sampleSource",
            observed_at AS "observedAt",
            EXTRACT(EPOCH FROM (now() - observed_at))::int AS "ageSeconds"
     FROM light_sensor_samples
     WHERE monitored_source_id = $1 AND ap_serial = ANY($2::text[])
     ORDER BY ap_serial, observed_at DESC`,
    [sourceId, serials]
  );
  return { perAp: rows, anySimulated: rows.some((r) => r.sampleSource === 'simulated') };
}

/**
 * Full readiness assessment.
 *
 * @returns {Promise<{ ready: boolean, summary: string, checks: object[], discovery: object|null }>}
 */
export async function assessReadiness({ source, session, now = new Date() }) {
  const checks = [];
  const sourceId = source.id;

  const db = await checkDatabaseHealth();
  checks.push(
    check('database', 'PostgreSQL', db.ok ? 'pass' : 'fail', db.ok ? 'Connected.' : `Unavailable: ${db.reason}`)
  );
  if (!db.ok) {
    return { ready: false, summary: 'PostgreSQL is unavailable; nothing can be collected or restored.', checks, discovery: null };
  }

  const config = await repo.getConfig(sourceId);
  let found = null;
  try {
    found = await discover({
      session,
      configuredPair: { northSiteId: config?.north_site_id, southSiteId: config?.south_site_id },
    });
  } catch (error) {
    found = { ok: false, error: error.message };
  }

  checks.push(
    check(
      'controller',
      'Controller',
      found?.ok ? 'pass' : 'fail',
      found?.ok ? `Reachable; ${found.sites.length} site(s), ${found.aps.length} AP(s).` : `Unreachable: ${found?.error ?? 'unknown error'}`
    )
  );

  if (!found?.ok) {
    return { ready: false, summary: 'The controller is unreachable.', checks, discovery: null };
  }

  const north = found.pair.north;
  const south = found.pair.south;

  checks.push(
    check(
      'site_pair',
      'Site pair',
      north && south ? (found.pair.proposed && !config?.north_site_id ? 'warn' : 'pass') : 'fail',
      north && south
        ? `North = '${north.siteName}', South = '${south.siteName}'` +
          (found.pair.proposed && !config?.north_site_id ? ' (proposed by name; confirm in the control panel).' : '.')
        : 'North and/or South could not be resolved. Choose them in the POC control panel.',
      { north: north ?? null, south: south ?? null }
    )
  );

  const nMembers = found.membership.north ?? [];
  const sMembers = found.membership.south ?? [];

  checks.push(
    check(
      'north_membership',
      'North access points',
      nMembers.length === 0 ? 'fail' : 'pass',
      nMembers.length === 0
        ? `North site '${north?.siteName ?? '—'}' has no access points assigned.`
        : `${nMembers.length} AP(s): ${nMembers.map((a) => `${a.serial} (${a.model})`).join(', ')}.`,
      { aps: nMembers }
    )
  );
  checks.push(
    check(
      'south_membership',
      'South access points (control)',
      sMembers.length === 0 ? 'fail' : 'pass',
      sMembers.length === 0
        ? `South site '${south?.siteName ?? '—'}' has no access points; there is no control group.`
        : `${sMembers.length} AP(s): ${sMembers.map((a) => `${a.serial} (${a.model})`).join(', ')}.`,
      { aps: sMembers }
    )
  );

  const offline = [...nMembers, ...sMembers].filter((a) => a.status && a.status !== 'InService');
  checks.push(
    check(
      'ap_status',
      'AP availability',
      offline.length === 0 ? 'pass' : 'warn',
      offline.length === 0
        ? 'All enrolled APs are in service.'
        : `${offline.length} AP(s) not in service: ${offline.map((a) => `${a.serial} (${a.status})`).join(', ')}.`
    )
  );

  const countDiff = Math.abs(nMembers.length - sMembers.length);
  checks.push(
    check(
      'group_balance',
      'Group balance',
      countDiff === 0 ? 'pass' : 'warn',
      countDiff === 0
        ? `Both sides have ${nMembers.length} AP(s).`
        : `North ${nMembers.length} vs South ${sMembers.length}. All comparisons are normalized per AP; raw site totals are not comparable.`
    )
  );

  const siteIds = [north?.siteId, south?.siteId].filter(Boolean);
  const coverageRows = siteIds.length ? await repo.fetchHistoryCoverage({ sourceId, siteIds }) : [];
  const coverage = Object.fromEntries(coverageRows.map((r) => [r.siteId, r]));
  const window = selectBaselineWindow({ coverage, treatmentStart: now.toISOString(), now });

  const describeHistory = (site) => {
    const c = site ? coverage[site.siteId] : null;
    if (!c) return `${site?.siteName ?? '—'}: none`;
    const hours = (now.getTime() - new Date(c.earliest).getTime()) / 3_600_000;
    return `${site.siteName}: ${hours.toFixed(1)}h (${c.apCount} AP)`;
  };

  checks.push(
    check(
      'history',
      'Historical data',
      window.sufficient ? 'pass' : coverageRows.length ? 'warn' : 'fail',
      `${describeHistory(north)}; ${describeHistory(south)}. Baseline: ${window.label}.`,
      { window, coverage }
    )
  );

  const freshness = siteIds.length ? await energyFreshness(sourceId, siteIds) : [];
  const freshnessBySite = Object.fromEntries(freshness.map((f) => [f.siteId, f]));
  const stale = siteIds.filter((id) => {
    const f = freshnessBySite[id];
    if (!f?.latest) return true;
    return now.getTime() - new Date(f.latest).getTime() > 10 * 60 * 1000;
  });
  checks.push(
    check(
      'telemetry_freshness',
      'Telemetry freshness',
      stale.length === 0 ? 'pass' : 'fail',
      stale.length === 0
        ? 'Measured power for both sides is less than 10 minutes old.'
        : `No measured power in the last 10 minutes for: ${stale.map((id) => (id === north?.siteId ? north.siteName : south?.siteName)).join(', ')}.`,
      { freshness }
    )
  );

  const collector = await collectorHealth(sourceId);
  checks.push(
    check(
      'collector',
      'Energy collector',
      collector?.status === 'succeeded' ? 'pass' : collector ? 'warn' : 'fail',
      collector
        ? `Last run ${collector.status} at ${new Date(collector.startedAt).toISOString()}, ${collector.recordsInserted} sample(s).`
        : 'The energy_ap_state collector has never run. Set ENERGY_AP_STATE_ENABLED=true and confirm the collector service is up.',
      { collector }
    )
  );

  const sensorCapable = nMembers.filter((a) => supportsLightSensor(a.model));
  const sensors = await sensorHealth(sourceId, nMembers.map((a) => a.serial));
  const liveSensors = sensors.perAp.filter((s) => s.sampleSource === 'live' && s.ageSeconds <= 180);
  checks.push(
    check(
      'light_sensor',
      'Light sensor',
      liveSensors.length > 0 ? 'pass' : sensors.perAp.length > 0 ? 'warn' : 'warn',
      liveSensors.length > 0
        ? `${liveSensors.length}/${sensorCapable.length} sensor-capable North AP(s) reporting live.`
        : sensors.perAp.length > 0
          ? `No live sensor reports in the last 3 minutes${sensors.anySimulated ? ' (simulated samples present)' : ''}. The demo override can drive the same pipeline.`
          : `No sensor reports yet. ${sensorCapable.length} North AP(s) are sensor-capable; deploy the lightguard agent, or use the demo override.`,
      { perAp: sensors.perAp, sensorCapableCount: sensorCapable.length, anySimulated: sensors.anySimulated }
    )
  );

  const outstanding = await repo.listOutstandingRestores(sourceId);
  checks.push(
    check(
      'rollback',
      'Rollback state',
      outstanding.length === 0 ? 'pass' : 'fail',
      outstanding.length === 0
        ? 'No AP is left in a state this system applied.'
        : `${outstanding.length} AP(s) changed by a previous experiment and NOT confirmed restored: ${outstanding.map((o) => o.apSerial).join(', ')}. Restore before starting.`,
      { outstanding }
    )
  );

  const active = await repo.getActiveExperiment(sourceId);
  checks.push(
    check(
      'experiment',
      'Experiment',
      active ? 'warn' : 'pass',
      active ? `'${active.name}' is in flight (${active.state}).` : 'Ready to start.',
      { active }
    )
  );

  const failed = checks.filter((c) => c.status === 'fail');
  const warned = checks.filter((c) => c.status === 'warn');
  const ready = failed.length === 0;

  return {
    ready,
    summary: ready
      ? warned.length === 0
        ? 'POC READY.'
        : `POC ready with ${warned.length} caveat(s).`
      : `POC NOT ready: ${failed.map((c) => c.label).join(', ')}.`,
    checks,
    discovery: found,
  };
}
