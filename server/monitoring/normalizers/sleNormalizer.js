/**
 * Computes persistable SLE samples from raw controller station/AP rows.
 *
 * This is the server-side mirror of the *counting* logic in
 * `src/services/sleCalculationEngine.ts`. It deliberately does NOT reproduce the
 * classifier / honeycomb breakdown — that is presentation, computed live from
 * the current data. What has to be persisted is the part that cannot be
 * recovered later: how many entities were in scope and how many were affected,
 * at a given moment.
 *
 * Every sample therefore carries `numerator` (healthy) and `denominator`
 * (in scope) as well as the percentage, so a multi-site or multi-hour average
 * can be recomputed from the parts. Averaging the stored percentages would
 * weight a 3-client site the same as a 300-client one.
 *
 * A metric with nothing in scope emits NO sample. An empty site is "no data",
 * not "100% healthy" — the same rule `markSLEDataPresence` enforces in the UI.
 */

import { METRIC_FAMILIES } from '../metricRegistry.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Mirrors DEFAULT_SLE_THRESHOLDS in src/types/sle.ts. */
export const DEFAULT_SLE_THRESHOLDS = Object.freeze({
  coverage: { rssiMin: -70 },
  throughput: { minRateBps: 1_000_000 },
  capacity: { maxClientsPerAp: 25 },
  timeToConnect: { slowConnectRssi: -75 },
  roaming: { stickyRssi: -75, stickyUptimeSeconds: 300 },
});

/** Matches `pct()` in the UI engine: one decimal place. */
function pct(count, total) {
  return total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0;
}

const rssiOf = (s, fallback = 0) => s.rssi ?? s.rss ?? fallback;
const txOf = (s) => s.transmittedRate || s.txRate || 0;
const rxOf = (s) => s.receivedRate || s.rxRate || 0;

/** Stable per-station key used only for in-memory de-duplication. Never stored. */
const stationKey = (s, index) => s.macAddress ?? s.mac ?? `idx:${index}`;

function countAffectedStations(stations, predicates) {
  const affected = new Set();
  stations.forEach((s, index) => {
    if (predicates.some((predicate) => predicate(s))) affected.add(stationKey(s, index));
  });
  return affected.size;
}

/** Coverage: weak signal or badly asymmetric rates. */
function coverageAffected(wireless, thresholds) {
  const min = thresholds.coverage.rssiMin;
  return countAffectedStations(wireless, [
    (s) => {
      const rssi = rssiOf(s);
      return rssi !== 0 && rssi < min;
    },
    (s) => {
      const tx = txOf(s);
      const rx = rxOf(s);
      return tx > 0 && rx > 0 && rx / tx > 3;
    },
    (s) => {
      const tx = txOf(s);
      const rx = rxOf(s);
      return tx > 0 && rx > 0 && tx / rx > 3;
    },
  ]);
}

/** Throughput: below the minimum rate while actually passing traffic. */
function throughputAffected(wireless, thresholds) {
  const min = thresholds.throughput.minRateBps;
  return countAffectedStations(wireless, [
    (s) => {
      const combined = txOf(s) + rxOf(s);
      return combined > 0 && combined < min;
    },
  ]);
}

/** AP health: disconnected, low power, or degraded. */
function apHealthAffected(aps) {
  const unhealthy = new Set();
  aps.forEach((apRow, index) => {
    const status = String(
      apRow.status || apRow.connectionState || apRow.operationalState || ''
    ).toLowerCase();
    const lowPower =
      Boolean(apRow.lowPower) || String(apRow.powerMode || '').toLowerCase().includes('low');
    const bad =
      status.includes('disconnect') ||
      status.includes('offline') ||
      status === 'outofservice' ||
      status.includes('degraded') ||
      status.includes('warning') ||
      lowPower;
    if (bad) unhealthy.add(apRow.serialNumber ?? `idx:${index}`);
  });
  return unhealthy.size;
}

/** Capacity: APs carrying more than the per-AP client limit. */
function capacityCounts(wireless, aps, thresholds) {
  const perAp = new Map();
  for (const s of wireless) {
    const serial = s.apSerialNumber || s.apSerial || '';
    if (serial) perAp.set(serial, (perAp.get(serial) || 0) + 1);
  }
  const total = aps.length || perAp.size;
  const overloaded = [...perAp.values()].filter(
    (count) => count > thresholds.capacity.maxClientsPerAp
  ).length;
  return { total, affected: overloaded };
}

/** Successful connects: authentication outcome across all stations, wired included. */
function successfulConnectsAffected(stations) {
  return stations.filter((s) => s.authenticated === false).length;
}

/** Time to connect: weak signal is the only proxy the snapshot API exposes. */
function timeToConnectAffected(wireless, thresholds) {
  return wireless.filter((s) => rssiOf(s, -50) < thresholds.timeToConnect.slowConnectRssi).length;
}

/** Roaming: sticky clients — poor signal held for longer than the dwell threshold. */
function roamingAffected(wireless, thresholds) {
  const { stickyRssi, stickyUptimeSeconds } = thresholds.roaming;
  return wireless.filter(
    (s) => rssiOf(s, -50) < stickyRssi && (s.uptime || 0) > stickyUptimeSeconds
  ).length;
}

/**
 * @param {any[]} stations Raw controller station rows.
 * @param {any[]} aps Raw controller AP rows.
 * @param {object} context
 * @param {string} context.monitoredSourceId
 * @param {Date}   context.collectedAt
 * @param {number} context.retentionDays
 * @param {string} [context.orgId]
 * @param {string} [context.siteGroupId]
 * @param {string} [context.siteId]
 * @param {object} [context.thresholds]
 * @returns {{ samples: object[] }}
 */
export function normalizeSleSamples(stations, aps, context) {
  const {
    monitoredSourceId,
    collectedAt,
    retentionDays,
    orgId = null,
    siteGroupId = null,
    siteId = null,
    thresholds = DEFAULT_SLE_THRESHOLDS,
  } = context;

  const stationRows = Array.isArray(stations) ? stations : [];
  const apRows = Array.isArray(aps) ? aps : [];
  const wireless = stationRows.filter((s) => !s.isWired);

  const capacity = capacityCounts(wireless, apRows, thresholds);

  /** [metricName, denominator, affectedCount] */
  const definitions = [
    ['coverage', wireless.length, coverageAffected(wireless, thresholds)],
    ['throughput', wireless.length, throughputAffected(wireless, thresholds)],
    ['ap_health', apRows.length, apHealthAffected(apRows)],
    ['capacity', capacity.total, capacity.affected],
    ['successful_connects', stationRows.length, successfulConnectsAffected(stationRows)],
    ['time_to_connect', wireless.length, timeToConnectAffected(wireless, thresholds)],
    ['roaming', wireless.length, roamingAffected(wireless, thresholds)],
  ];

  // Anchored to the observation, which for these snapshot APIs is collection
  // time — see reportNormalizer for why observation is the right anchor.
  const expiresAt = new Date(collectedAt.getTime() + retentionDays * MS_PER_DAY);
  const samples = [];

  for (const [metricName, denominator, affected] of definitions) {
    // Nothing in scope: emit nothing. A fabricated 100% would read as a
    // measurement of a healthy site rather than an absence of data.
    if (denominator <= 0) continue;

    const numerator = denominator - affected;
    samples.push({
      monitoredSourceId,
      orgId,
      siteGroupId,
      siteId,
      deviceExternalId: null,
      radioExternalId: null,
      wlanExternalId: null,
      clientExternalId: null,
      metricFamily: METRIC_FAMILIES.SLE,
      metricName,
      // Snapshot APIs carry no observation timestamp of their own, so collection
      // time is used and the substitution is recorded rather than hidden.
      observedAt: collectedAt,
      bucketStart: null,
      bucketEnd: null,
      numericValue: pct(numerator, denominator),
      numerator,
      denominator,
      sampleCount: denominator,
      unit: '%',
      metricKind: 'percentage',
      dimensions: {},
      qualityState: 'collection_timestamped',
      collectedAt,
      expiresAt,
    });
  }

  return { samples };
}
