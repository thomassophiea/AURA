/**
 * Serial -> AP name, for energy rows.
 *
 * No energy series stores the AP's name: `energy_ap_state` dimensions carry
 * model and site name, the AP report series carries neither. Rather than widen a
 * collector this module owns nothing of, names are resolved at read time from:
 *
 *   1. the live AP inventory (`/v1/aps/query`, the same call the measured
 *      collector already makes every minute), cached per source for a few
 *      minutes and bounded by a short timeout so a slow Gateway cannot stall the
 *      Energy page;
 *   2. failing that, the names snapshotted when APs were enrolled in an energy
 *      experiment;
 *   3. failing both, the serial — a row is never left nameless.
 *
 * Best effort by design: every failure path degrades to the serial.
 */

import { query } from '../db/pool.js';
import { normalizeAp, rows as extractRows } from './experiment/siteDiscovery.js';

const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 4_000;

/** Enrollment snapshot names, newest first per serial. */
export async function listEnrolledApNames({ sourceIds, serials }) {
  if (!serials?.length || !sourceIds?.length) return new Map();
  const { rows } = await query(
    `SELECT DISTINCT ON (d.ap_serial) d.ap_serial AS serial, d.ap_name AS name
     FROM energy_experiment_devices d
     JOIN energy_experiments e ON e.id = d.experiment_id
     WHERE e.monitored_source_id = ANY($1::uuid[])
       AND d.ap_serial = ANY($2::text[])
       AND d.ap_name IS NOT NULL AND d.ap_name <> ''
     ORDER BY d.ap_serial, d.enrolled_at DESC`,
    [sourceIds, serials]
  );
  return new Map(rows.map((r) => [r.serial, r.name]));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('AP inventory timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {{ sessionForFn?: (source:object)=>Promise<{get:Function}>,
 *           listEnrolledFn?: Function, nowFn?: ()=>number,
 *           ttlMs?: number, timeoutMs?: number }} [deps]
 */
export function createApNameResolver(deps = {}) {
  const {
    sessionForFn = null,
    listEnrolledFn = listEnrolledApNames,
    nowFn = () => Date.now(),
    ttlMs = DEFAULT_TTL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = deps;
  const cache = new Map(); // sourceId -> { at, names: Map, pending?: Promise }

  async function liveNames(source) {
    const hit = cache.get(source.id);
    if (hit?.names && nowFn() - hit.at < ttlMs) return hit.names;
    if (hit?.pending) return hit.pending;
    if (!sessionForFn) return new Map();

    const pending = (async () => {
      const session = await sessionForFn(source);
      const resp = await session.get('/v1/aps/query');
      if (!resp?.ok) throw new Error('AP inventory unavailable');
      const names = new Map();
      for (const ap of extractRows(resp.data, ['aps', 'accessPoints'])) {
        const n = normalizeAp(ap);
        if (n.serial && n.apName) names.set(String(n.serial), String(n.apName));
      }
      cache.set(source.id, { at: nowFn(), names });
      return names;
    })();
    cache.set(source.id, { ...(hit ?? {}), pending });
    try {
      return await withTimeout(pending, timeoutMs);
    } catch {
      // A stale map beats none; otherwise fall through to the snapshot names.
      const prior = cache.get(source.id);
      if (prior?.pending === pending) cache.set(source.id, { at: hit?.at ?? 0, names: hit?.names });
      return hit?.names ?? new Map();
    }
  }

  /**
   * @param {{ sources: Array<{id:string}>, serials: string[] }} args
   * @returns {Promise<Map<string,string>>} serial -> name, for every serial asked
   */
  return async function resolveApNames({ sources = [], serials = [] }) {
    const wanted = [...new Set(serials.filter(Boolean).map(String))];
    const out = new Map();
    if (wanted.length === 0) return out;

    for (const source of sources) {
      try {
        const names = await liveNames(source);
        for (const serial of wanted) {
          if (!out.has(serial) && names?.get(serial)) out.set(serial, names.get(serial));
        }
      } catch {
        /* best effort */
      }
    }

    const missing = wanted.filter((s) => !out.has(s));
    if (missing.length > 0) {
      try {
        const enrolled = await listEnrolledFn({
          sourceIds: sources.map((s) => s.id),
          serials: missing,
        });
        for (const serial of missing) {
          if (enrolled.get(serial)) out.set(serial, enrolled.get(serial));
        }
      } catch {
        /* best effort */
      }
    }

    for (const serial of wanted) if (!out.has(serial)) out.set(serial, serial);
    return out;
  };
}
