/**
 * Historical evidence, from AURA's own monitoring database.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Gateway's report API serves exactly one duration on this build — 3H —
 * so live telemetry cannot answer the single most common troubleshooting
 * sentence: "it was fine yesterday". AURA's collector has been quietly solving
 * that all along. Measured on Integration:
 *
 *   /api/monitoring/coverage -> 70,366 samples on 2026-08-29, 24 hours present
 *   retention                -> 30 days, 60-second poll
 *   families                 -> ap_report, sle, throughput, site_report
 *
 * Cortex read none of it. This module is the bridge, in-process against the
 * same repository the monitoring API uses — no self-HTTP, no second auth path.
 *
 * WHAT HISTORY CAN AND CANNOT ANSWER
 * ----------------------------------
 * `MONITORING_PERSIST_CLIENT_IDENTIFIERS` is false by default, so
 * `client_external_id` is NULL on every row. History is therefore per-DEVICE,
 * per-radio, per-WLAN and per-site — never per-client. Asked about a client's
 * history, the honest answer is that it is not collected, and `clientHistory`
 * below says exactly that rather than letting a caller infer it from silence.
 *
 * EPISTEMICS THE API ALREADY GETS RIGHT
 * ------------------------------------
 * The monitoring layer distinguishes "no data in this window" from "nothing was
 * ever collected" (`neverCollected`), reports how far back data actually goes
 * (`earliestAvailable`), and says when a requested window was trimmed by
 * retention or a point cap. That maps directly onto Cortex's observed/unknown
 * line, so those signals are carried through rather than flattened.
 */

import { queryHistory, getEarliestObservedAt, queryLatest } from '../monitoring/sampleRepository.js';
import { listSources, normalizeBaseUrl } from '../monitoring/sourceRepository.js';

/** History is per-device; the client dimension is deliberately not collected. */
export const CLIENT_HISTORY_UNAVAILABLE =
  'Per-client history is not collected. MONITORING_PERSIST_CLIENT_IDENTIFIERS is off by ' +
  'default, so client_external_id is NULL on every stored sample. Device, radio, WLAN and ' +
  'site history are available; a specific client\'s past is not. Enabling it is a ' +
  'deliberate privacy decision and would store pseudonymised identifiers, not raw MACs.';

/**
 * Monitoring source ids for one Gateway.
 *
 * Mirrors what requireControllerScope does for the HTTP API: match on the
 * normalised base URL so Cortex only ever reads history for the Gateway the
 * caller is actually pointed at.
 *
 * @returns {Promise<{ok: boolean, sourceIds: string[], sources: object[], error: string|null}>}
 */
export async function resolveSourceIds(controllerUrl) {
  try {
    const wanted = normalizeBaseUrl(controllerUrl);
    if (!wanted) return { ok: false, sourceIds: [], sources: [], error: 'no controller URL' };
    const sources = await listSources();
    const scoped = sources.filter((s) => normalizeBaseUrl(s.baseUrl) === wanted);
    return { ok: true, sourceIds: scoped.map((s) => s.id), sources: scoped, error: null };
  } catch (err) {
    // No DATABASE_URL, or the database is unreachable. History is simply
    // unavailable — which is a different answer from "nothing happened".
    return { ok: false, sourceIds: [], sources: [], error: err?.message ?? String(err) };
  }
}

/** Numeric summary of one metric's points. Nulls are dropped, never zeroed. */
export function summarise(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const at = (p) => {
    const k = (sorted.length - 1) * (p / 100);
    const lo = Math.floor(k);
    const hi = Math.min(lo + 1, sorted.length - 1);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
  };
  return {
    count: nums.length,
    min: sorted[0],
    median: at(50),
    p90: at(90),
    max: sorted[sorted.length - 1],
  };
}

/** Group raw points into `{ [metricName]: summary }`, per device when asked. */
function groupByMetric(points) {
  const byName = new Map();
  for (const p of points) {
    // mapSampleRow() names these `metricName` and `numericValue`. Guessing
    // `value` here produced NaN for every point, which summarise() then dropped
    // — so the tool would have reported "no data" for a fully populated window.
    const name = p.metricName;
    const value = Number(p.numericValue);
    if (!name || !Number.isFinite(value)) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(value);
  }
  const out = {};
  for (const [name, values] of byName) {
    const s = summarise(values);
    if (s) out[name] = s;
  }
  return out;
}

/**
 * One historical window for a device / site / WLAN.
 *
 * @returns {Promise<{ok: boolean, metrics: object, meta: object, error: string|null}>}
 */
export async function historyWindow({
  sourceIds,
  start,
  end,
  deviceExternalId = null,
  siteId = null,
  wlanExternalId = null,
  metricFamily = null,
  metricNames = [],
  maxPoints = 20_000,
}) {
  if (!sourceIds?.length) {
    return { ok: false, metrics: {}, meta: {}, error: 'no monitoring source for this Gateway' };
  }
  try {
    const [{ points, truncated, effectiveStart }, earliest] = await Promise.all([
      queryHistory({
        sourceIds,
        start,
        end,
        deviceExternalId,
        siteId,
        wlanExternalId,
        radioExternalId: null,
        metricFamily,
        metricNames,
        maxPoints,
      }),
      getEarliestObservedAt(sourceIds),
    ]);

    return {
      ok: true,
      metrics: groupByMetric(points),
      meta: {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        pointCount: points.length,
        truncated,
        effectiveStart: effectiveStart ? new Date(effectiveStart).toISOString() : null,
        earliestAvailable: earliest ? new Date(earliest).toISOString() : null,
        // The distinction that matters most: an empty window inside a
        // collecting system is "nothing happened"; an empty window in a system
        // that never collected is "we cannot know".
        neverCollected: earliest === null,
      },
      error: null,
    };
  } catch (err) {
    return { ok: false, metrics: {}, meta: {}, error: err?.message ?? String(err) };
  }
}

/**
 * Devices present in history but absent from the live Gateway inventory.
 *
 * This is the case live telemetry cannot see at all. Measured: AP5010-LAB
 * (WM012243W-30032) read `status: critical` on the Gateway, and an hour later
 * had gone from inventory entirely — /v1/aps/{serial} answering
 * 422 "Can not find AP". The fleet then looked perfect, because the broken AP
 * had stopped being counted. History still holds it, so the disappearance is
 * detectable rather than merely disclaimed.
 *
 * @param {object} args
 * @param {string[]} args.sourceIds
 * @param {string[]} args.liveDeviceIds  serials the Gateway reports right now
 * @param {number} [args.days]           how far back to look for a device
 */
export async function findVanishedDevices({ sourceIds, liveDeviceIds, days = 7 }) {
  if (!sourceIds?.length) {
    return { ok: false, vanished: [], error: 'no monitoring source for this Gateway' };
  }
  try {
    // queryLatest returns rows.map(mapSampleRow) — a bare array, not an
    // envelope. Tolerate both so a future envelope does not silently yield [].
    const latest = await queryLatest({ sourceIds });
    const rows = Array.isArray(latest) ? latest : (latest?.metrics ?? []);
    const live = new Set((liveDeviceIds ?? []).map((s) => String(s).toUpperCase()));

    const seen = new Map();
    for (const r of rows) {
      const id = r.deviceExternalId;
      if (!id) continue;
      const at = r.observedAt;
      const prev = seen.get(id);
      if (!prev || new Date(at) > new Date(prev)) seen.set(id, at);
    }

    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    const vanished = [];
    for (const [id, lastSeen] of seen) {
      if (live.has(String(id).toUpperCase())) continue;
      const ts = new Date(lastSeen).getTime();
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      vanished.push({ deviceExternalId: id, lastSeenAt: new Date(ts).toISOString() });
    }
    vanished.sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
    return { ok: true, vanished, historyDeviceCount: seen.size, error: null };
  } catch (err) {
    return { ok: false, vanished: [], error: err?.message ?? String(err) };
  }
}
