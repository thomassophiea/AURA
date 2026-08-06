/**
 * PostgreSQL-backed replacement for the in-memory `throughputStore` array that
 * used to live in server.js.
 *
 * That array was capped at 1000 entries, shared across every tenant, and wiped
 * on every Railway redeploy. Snapshots now land in `metric_samples` under the
 * `throughput` family, so they survive restarts and expire on the normal
 * retention schedule.
 *
 * The HTTP response shapes are unchanged, so `src/services/throughput.ts` and
 * its tests keep working.
 */

import { insertSamples, queryHistory, upsertCurrentState } from './sampleRepository.js';

export const THROUGHPUT_FAMILY = 'throughput';

const TOTAL_METRICS = [
  ['totalUpload', 'bps'],
  ['totalDownload', 'bps'],
  ['totalTraffic', 'bps'],
  ['clientCount', 'clients'],
  ['avgPerClient', 'bps'],
];

const NETWORK_METRICS = [
  ['upload', 'bps'],
  ['download', 'bps'],
  ['total', 'bps'],
  ['clients', 'clients'],
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a numeric field, treating absent values as absent.
 *
 * `Number(null)` and `Number('')` are both 0, so a plain Number() call would
 * turn "this field was not reported" into "this field was zero" — the exact
 * fabrication this subsystem exists to avoid.
 */
function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Flatten a snapshot into samples.
 *
 * The per-network breakdown becomes one series per network via the `network`
 * dimension, so `/network/:name` is a filter rather than a scan of every stored
 * snapshot.
 */
export function snapshotToSamples(snapshot, { sourceId, siteId = null, retentionDays, now = new Date() }) {
  const sourceTimestamp = toNumber(snapshot?.timestamp);
  const hasSourceTimestamp = sourceTimestamp !== null;
  const observedAt = hasSourceTimestamp ? new Date(sourceTimestamp) : now;
  const expiresAt = new Date(now.getTime() + retentionDays * MS_PER_DAY);

  const base = {
    monitoredSourceId: sourceId,
    orgId: null,
    siteGroupId: null,
    siteId,
    deviceExternalId: null,
    radioExternalId: null,
    wlanExternalId: null,
    clientExternalId: null,
    metricFamily: THROUGHPUT_FAMILY,
    observedAt,
    bucketStart: null,
    bucketEnd: null,
    numerator: null,
    denominator: null,
    sampleCount: null,
    metricKind: 'gauge',
    qualityState: hasSourceTimestamp ? 'observed' : 'collection_timestamped',
    collectedAt: now,
    expiresAt,
  };

  const samples = [];

  for (const [key, unit] of TOTAL_METRICS) {
    const value = toNumber(snapshot?.[key]);
    if (value === null) continue;
    samples.push({ ...base, metricName: key, numericValue: value, unit, dimensions: {} });
  }

  for (const entry of snapshot?.networkBreakdown ?? []) {
    if (!entry?.network) continue;
    for (const [key, unit] of NETWORK_METRICS) {
      const value = toNumber(entry[key]);
      if (value === null) continue;
      samples.push({
        ...base,
        metricName: `network.${key}`,
        numericValue: value,
        unit,
        dimensions: { network: String(entry.network) },
      });
    }
  }

  return samples;
}

/** Rebuild snapshot objects from stored samples, for the legacy response shape. */
export function samplesToSnapshots(points) {
  const byTimestamp = new Map();

  for (const point of points) {
    const timestamp = new Date(point.observedAt).getTime();
    if (!byTimestamp.has(timestamp)) {
      byTimestamp.set(timestamp, {
        timestamp,
        totalUpload: 0,
        totalDownload: 0,
        totalTraffic: 0,
        clientCount: 0,
        avgPerClient: 0,
        networkBreakdown: [],
      });
    }
    const snapshot = byTimestamp.get(timestamp);

    if (point.metricName.startsWith('network.')) {
      const field = point.metricName.slice('network.'.length);
      const network = point.dimensions?.network;
      if (!network) continue;
      let entry = snapshot.networkBreakdown.find((n) => n.network === network);
      if (!entry) {
        entry = { network, upload: 0, download: 0, total: 0, clients: 0 };
        snapshot.networkBreakdown.push(entry);
      }
      entry[field] = point.numericValue;
    } else {
      snapshot[point.metricName] = point.numericValue;
    }
  }

  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export async function storeSnapshot(snapshot, options) {
  const samples = snapshotToSamples(snapshot, options);
  if (samples.length === 0) return { stored: 0 };
  const result = await insertSamples(samples);
  await upsertCurrentState(samples);
  return { stored: result.inserted + result.updated };
}

export async function fetchSnapshots({ sourceIds, startTime, endTime, limit, retentionDays, maxPoints }) {
  const now = Date.now();
  const start = startTime ? new Date(Number(startTime)) : new Date(now - retentionDays * MS_PER_DAY);
  const end = endTime ? new Date(Number(endTime)) : new Date(now);

  const { points } = await queryHistory({
    sourceIds,
    start,
    end,
    metricFamily: THROUGHPUT_FAMILY,
    maxPoints,
  });

  const snapshots = samplesToSnapshots(points);
  const capped = limit ? snapshots.slice(-Number(limit)) : snapshots;
  return capped;
}

/**
 * Aggregate stored snapshots.
 *
 * Averages are taken over the snapshots that actually exist; an outage window
 * contributes nothing rather than contributing zeros, so a gap does not drag
 * the average down.
 */
export function aggregateSnapshots(snapshots) {
  if (snapshots.length === 0) {
    return {
      avgUpload: 0,
      avgDownload: 0,
      avgTotal: 0,
      maxUpload: 0,
      maxDownload: 0,
      maxTotal: 0,
      avgClientCount: 0,
      snapshotCount: 0,
    };
  }

  const mean = (key) => snapshots.reduce((sum, s) => sum + (s[key] || 0), 0) / snapshots.length;
  const peak = (key) => Math.max(...snapshots.map((s) => s[key] || 0));

  return {
    avgUpload: mean('totalUpload'),
    avgDownload: mean('totalDownload'),
    avgTotal: mean('totalTraffic'),
    maxUpload: peak('totalUpload'),
    maxDownload: peak('totalDownload'),
    maxTotal: peak('totalTraffic'),
    avgClientCount: mean('clientCount'),
    snapshotCount: snapshots.length,
  };
}

/** Per-network trend rows, in the shape the existing endpoint returns. */
export function networkTrends(snapshots, networkName) {
  return snapshots
    .map((snapshot) => {
      const entry = snapshot.networkBreakdown.find((n) => n.network === networkName);
      return entry
        ? {
            timestamp: snapshot.timestamp,
            upload: entry.upload,
            download: entry.download,
            total: entry.total,
            clients: entry.clients,
          }
        : null;
    })
    .filter(Boolean);
}
