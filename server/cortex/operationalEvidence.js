/**
 * AURA's OWN operational insight surfaces, as Cortex evidence.
 *
 * WHY THIS EXISTS
 * ---------------
 * AURA already renders two pages of correlated operational truth that Cortex
 * could not see at all:
 *
 *   - Wireless service levels: seven metrics, scored, plus a per-site
 *     scoreboard sorted worst-first with the weakest metric named.
 *   - Infrastructure Sentinel: eight active probes (VLAN trunks, DHCP, RADIUS,
 *     DNS, certificates, firmware, AP status, client DHCP failure rates) with
 *     alerts that carry a target, a repeat count and an acknowledgement state.
 *
 * Neither reached the investigation agent. `diagnosticTools.js` imported no
 * sentinel and no SLE module, and the only SLE reach — `getMetricHistory`'s
 * `metricFamily:'sle'` — cannot scope by site, because it exposes `deviceId`
 * and every SLE sample has `deviceExternalId: null`. So the operator could be
 * looking at "PrimarySite 94.5%, Coverage 70.6%, 34 clients" while Cortex, on
 * the same platform, reported no telemetry anywhere.
 *
 * THE PATTERN THIS FOLLOWS
 * ------------------------
 * `historyEvidence.js`, deliberately: import the owning subsystem's repository
 * and call it IN-PROCESS — no self-HTTP, no second auth path — and return a
 * discriminated `{ ok, ..., error }` so a failed read can never be mistaken for
 * an empty world.
 *
 * TWO HONESTY CONSTRAINTS THAT ARE NOT OPTIONAL
 * ---------------------------------------------
 * 1. THESE NUMBERS ARE NOT THE PAGE'S NUMBERS, AND MUST NOT BE PRESENTED AS
 *    SUCH. The browser computes SLE in `src/services/sleCalculationEngine.ts`
 *    against operator thresholds from `/api/sle/thresholds/:siteKey`. The
 *    server re-derives it independently in
 *    `server/monitoring/normalizers/sleNormalizer.js`, whose DEFAULT_SLE_THRESHOLDS
 *    genuinely diverge for `capacity`, `time_to_connect` and `roaming` — and
 *    which never reads the operator's saved thresholds at all. Coverage and
 *    throughput agree; the other three can legitimately differ from what the
 *    operator is looking at. Every payload says so.
 *
 * 2. A MISSING METRIC IS NOT A PASSING ONE. The normalizer emits NO sample when
 *    `denominator <= 0`. So a metric absent from this read was not measured, and
 *    reporting it as 100% would invent a clean bill out of a collection gap —
 *    the same failure the doctrine already forbids for an empty poll table.
 */

import { queryLatest } from '../monitoring/sampleRepository.js';
import { METRIC_FAMILIES } from '../monitoring/metricRegistry.js';

/**
 * Sentinel is loaded on FIRST USE, not at import.
 *
 * `sentinelEngine` is a module-level singleton, so importing it constructs the
 * engine — which builds an AlertStore and starts timers. An evidence module
 * must not have that side effect: `diagnosticTools.js` imports this file, and
 * every test, script and tool-spec dump that touches the tool layer would
 * otherwise spin up a scheduler it never asked for.
 *
 * Cached after the first resolve, so the dynamic import costs one tick once.
 */
let sentinelPromise = null;
function loadSentinel() {
  if (!sentinelPromise) {
    sentinelPromise = Promise.all([
      import('../sentinel/sentinelEngine.js'),
      import('../sentinel/sentinelRepository.js'),
    ]).then(([engineMod, repoMod]) => ({
      engine: engineMod.sentinelEngine,
      getAlertAnalytics: repoMod.getAlertAnalytics,
    }));
  }
  return sentinelPromise;
}

/** The seven wireless service levels, in the order the page shows them. */
export const SLE_METRIC_ORDER = [
  'time_to_connect',
  'successful_connects',
  'coverage',
  'roaming',
  'throughput',
  'capacity',
  'ap_health',
];

/** Stored `metric_name` -> the label the operator sees. */
export const SLE_METRIC_LABELS = {
  time_to_connect: 'Time to Connect',
  successful_connects: 'Successful Connects',
  coverage: 'Coverage',
  roaming: 'Roaming',
  throughput: 'Throughput',
  capacity: 'Capacity',
  ap_health: 'AP Health',
};

/**
 * The three metrics whose server-side thresholds differ from the browser's.
 *
 * Named explicitly rather than described, so the tool can list them and the
 * model cannot claim agreement it does not have.
 */
export const SLE_SERVER_DIVERGENT_METRICS = ['capacity', 'time_to_connect', 'roaming'];

/** The same banding the UI applies (`getSLEStatus` in src/types/sle.ts). */
export function sleStatus(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return 'no_data';
  if (rate >= 95) return 'good';
  if (rate >= 80) return 'warn';
  return 'poor';
}

/**
 * Per-site wireless service levels from AURA's monitoring database.
 *
 * `queryLatest` returns the newest value per series from `current_metric_state`,
 * and every SLE sample carries `site_id` — which is what makes the per-site
 * rollup reconstructable here even though nothing server-side renders one.
 *
 * @param {{sourceIds: string[], siteId?: string|null, now?: number}} params
 * @returns {Promise<{ok: boolean, sites: object[], meta: object, error: string|null}>}
 */
export async function serviceLevels({ sourceIds, siteId = null, now = Date.now() }) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    return {
      ok: false,
      sites: [],
      meta: {},
      error:
        'No monitoring source matches this Gateway, so AURA has collected no service levels ' +
        'for it. This needs the collector enabled and the database reachable.',
    };
  }

  let rows;
  try {
    rows = await queryLatest({ sourceIds, siteId, metricFamily: METRIC_FAMILIES.SLE });
  } catch (err) {
    return { ok: false, sites: [], meta: {}, error: err?.message ?? 'history query failed' };
  }

  const bySite = new Map();
  for (const row of rows) {
    const key = row.siteId ?? '__unattributed__';
    if (!bySite.has(key)) bySite.set(key, { siteId: row.siteId ?? null, metrics: new Map() });
    const entry = bySite.get(key);
    // `numericValue` is the success percentage; `denominator` is the entity
    // count it was computed over. A metric present with denominator 0 should
    // not exist (the normalizer suppresses it), but if one appears it is a
    // collection artefact, not a 100% score.
    const value = Number(row.numericValue);
    entry.metrics.set(row.metricName, {
      metricName: row.metricName,
      label: SLE_METRIC_LABELS[row.metricName] ?? row.metricName,
      successRate: Number.isFinite(value) ? value : null,
      sampleBasis: Number(row.denominator) || 0,
      unit: row.unit ?? '%',
      qualityState: row.qualityState ?? null,
      observedAt: row.observedAt ?? null,
      ageSeconds: row.observedAt
        ? Math.max(0, Math.round((now - new Date(row.observedAt).getTime()) / 1000))
        : null,
    });
  }

  const sites = [...bySite.values()].map(({ siteId: id, metrics }) => {
    const present = SLE_METRIC_ORDER.filter((m) => metrics.has(m)).map((m) => metrics.get(m));
    const scored = present.filter((m) => m.successRate !== null && m.sampleBasis > 0);
    const overall = scored.length
      ? Number((scored.reduce((sum, m) => sum + m.successRate, 0) / scored.length).toFixed(1))
      : null;
    // The page nulls the weakest metric when nothing is below 100. Same rule,
    // so a healthy site does not get handed a spurious "worst".
    const weakest = scored.length
      ? scored.reduce((worst, m) => (m.successRate < worst.successRate ? m : worst))
      : null;
    const newest = present.reduce(
      (acc, m) => (m.ageSeconds !== null && (acc === null || m.ageSeconds < acc) ? m.ageSeconds : acc),
      null
    );

    return {
      siteId: id,
      overall,
      overallStatus: sleStatus(overall),
      weakestMetric:
        weakest && weakest.successRate < 100
          ? { metricName: weakest.metricName, label: weakest.label, successRate: weakest.successRate }
          : null,
      metrics: present,
      // The distinction that stops a collection gap reading as a pass.
      metricsMeasured: present.map((m) => m.metricName),
      metricsNotMeasured: SLE_METRIC_ORDER.filter((m) => !metrics.has(m)),
      freshestSampleAgeSeconds: newest,
    };
  });

  // Worst first, exactly as the scoreboard orders it; a site with no score
  // sorts last rather than being treated as perfect.
  sites.sort((a, b) => (a.overall ?? 101) - (b.overall ?? 101));

  return {
    ok: true,
    sites,
    meta: {
      sampleCount: rows.length,
      sitesWithData: sites.filter((s) => s.overall !== null).length,
      serverComputed: true,
      divergentMetrics: SLE_SERVER_DIVERGENT_METRICS,
    },
    error: null,
  };
}

/**
 * AP and radio state from AURA's database, for when the Gateway will not answer.
 *
 * WHAT THIS CAN AND CANNOT REPLACE
 * -------------------------------
 * The `energy_ap_state` family is collected from `/v1/aps/query` and carries,
 * per AP: serial, site (id and name), model, operational status, client count,
 * and per radio the tx power, admin state, client count and channel occupancy.
 * That is enough to answer AP-level and radio-level questions when the live
 * read is failing.
 *
 * It replaces NOTHING at client or configuration level, and the tools that use
 * it must not pretend otherwise:
 *   - No WLAN, topology, profile, role or AAA configuration is stored anywhere
 *     in Postgres. getWlanConfig and reconcileConfiguration have no fallback.
 *   - Per-client state is pseudonymised, opt-in and forward-only, so no stored
 *     row can be resolved back to "this laptop".
 *   - The neighbour table, and therefore named co-channel offenders, is not
 *     stored.
 *
 * AND IT IS ALWAYS IN THE PAST. Every row is `collection_timestamped` — the
 * source supplies no per-field time, so the collector's own clock is the
 * timestamp. A caller must report the age and must never say "right now".
 */
export async function storedFleetState({ sourceIds, siteId = null, now = Date.now() }) {
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    return {
      ok: false,
      aps: [],
      meta: {},
      error: 'No monitoring source matches this Gateway, so nothing has been stored for it.',
    };
  }

  let rows;
  try {
    rows = await queryLatest({
      sourceIds,
      siteId,
      metricFamily: METRIC_FAMILIES.ENERGY_AP_STATE,
    });
  } catch (err) {
    return { ok: false, aps: [], meta: {}, error: err?.message ?? 'stored state query failed' };
  }

  const byAp = new Map();
  let newestObservedAt = null;

  for (const row of rows) {
    const serial = row.deviceExternalId;
    if (!serial) continue;
    if (!byAp.has(serial)) {
      byAp.set(serial, { serial, siteId: row.siteId ?? null, siteName: null, model: null, status: null, clientCount: null, radios: new Map(), observedAt: null });
    }
    const ap = byAp.get(serial);
    const dims = row.dimensions ?? {};
    if (dims.siteName) ap.siteName = dims.siteName;
    if (dims.model) ap.model = dims.model;
    // `status` rides on the AP-level samples only, never the per-radio ones.
    if (dims.status && !row.radioExternalId) ap.status = dims.status;

    const observed = row.observedAt ? new Date(row.observedAt).getTime() : null;
    if (observed && (ap.observedAt === null || observed > ap.observedAt)) ap.observedAt = observed;
    if (observed && (newestObservedAt === null || observed > newestObservedAt)) {
      newestObservedAt = observed;
    }

    const value = Number(row.numericValue);
    const num = Number.isFinite(value) ? value : null;

    if (!row.radioExternalId) {
      if (row.metricName === 'ap.client_count') ap.clientCount = num;
      continue;
    }

    const key = row.radioExternalId;
    if (!ap.radios.has(key)) {
      ap.radios.set(key, { radio: key, txPower: null, adminEnabled: null, clients: null, channelOccupancy: null });
    }
    const radio = ap.radios.get(key);
    if (row.metricName === 'radio.tx_power') radio.txPower = num;
    // Stored as 1/0. Null stays null: a radio whose admin state was never
    // sampled is not a disabled radio.
    if (row.metricName === 'radio.admin_enabled') radio.adminEnabled = num === null ? null : num === 1;
    if (row.metricName === 'radio.clients') radio.clients = num;
    if (row.metricName === 'radio.channel_occupancy') radio.channelOccupancy = num;
  }

  const aps = [...byAp.values()].map((ap) => ({
    ...ap,
    radios: [...ap.radios.values()],
    ageSeconds: ap.observedAt === null ? null : Math.max(0, Math.round((now - ap.observedAt) / 1000)),
  }));

  const statusCounts = {};
  for (const ap of aps) {
    const key = ap.status ?? 'unknown';
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  return {
    ok: true,
    aps,
    meta: {
      apCount: aps.length,
      statusCounts,
      newestObservedAt: newestObservedAt ? new Date(newestObservedAt).toISOString() : null,
      ageSeconds:
        newestObservedAt === null ? null : Math.max(0, Math.round((now - newestObservedAt) / 1000)),
      sampleCount: rows.length,
    },
    error: null,
  };
}

/**
 * Current infrastructure probe state and alerts.
 *
 * Synchronous: the engine holds these in memory (Postgres is its write-through
 * and boot-hydrate path, not its read path).
 *
 * Deliberately NOT routed through the old `getSentinelAlerts` resolver, which
 * was registered process-globally in server.js and passed through
 * `truncateResult()` — that capped alerts at 20 and replaced every nested
 * object with the literal string '<object>', so `context.apSerial`,
 * `context.vlanId` and `context.gateway` were destroyed before the model saw
 * them, and a repeat count of 497 arrived as one of twenty rows.
 *
 * @param {{severity?: string|null, check?: string|null, limit?: number}} params
 */
export async function infrastructureAlerts({ severity = null, check = null, limit = 40 } = {}) {
  let status;
  let alerts;
  try {
    const { engine } = await loadSentinel();
    status = engine.getStatus();
    alerts = engine.getAllAlerts({ severity, check });
  } catch (err) {
    return { ok: false, status: null, alerts: [], error: err?.message ?? 'sentinel read failed' };
  }

  const rank = { critical: 3, warning: 2, info: 1 };
  const ordered = [...(alerts ?? [])].sort((a, b) => {
    const bySeverity = (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
    if (bySeverity !== 0) return bySeverity;
    // Then by how often it has recurred — a 497x repeat is a sustained
    // condition and outranks a one-off of the same severity.
    return (Number(b.occurrences) || 0) - (Number(a.occurrences) || 0);
  });

  const counts = { critical: 0, warning: 0, info: 0 };
  for (const a of alerts ?? []) {
    if (counts[a.severity] !== undefined) counts[a.severity] += 1;
  }

  return {
    ok: true,
    status,
    counts,
    alertCount: (alerts ?? []).length,
    alerts: ordered.slice(0, limit),
    truncated: (alerts ?? []).length > limit,
    error: null,
  };
}

/** Alert aggregates over a window: MTTA, MTTR, noisiest checks and targets. */
export async function infrastructureAnalytics({ days = 30 } = {}) {
  try {
    const { getAlertAnalytics } = await loadSentinel();
    const analytics = await getAlertAnalytics({ days });
    if (!analytics) {
      return {
        ok: false,
        analytics: null,
        error:
          'Alert history is not persisting (no database), so MTTA, MTTR and the noisiest ' +
          'checks cannot be computed. Current alerts are still readable.',
      };
    }
    return { ok: true, analytics, error: null };
  } catch (err) {
    return { ok: false, analytics: null, error: err?.message ?? 'analytics query failed' };
  }
}
