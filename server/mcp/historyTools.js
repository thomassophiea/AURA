/**
 * "As of" questions: what did the estate look like at a past instant, and what
 * has changed since.
 *
 * The Gateway itself only serves a 3-hour window. AURA's collector stores
 * service levels and per-AP/radio state every minute for 30 days, so "what did
 * PrimarySite look like at 2 pm?" and "which APs went down since this morning?"
 * are answerable — from stored samples, and said to be stored samples.
 *
 * What is NOT stored, and therefore never invented here: per-client state
 * (only pseudonymised series, and only when enabled), RFQI, and RTT.
 */

import { untrusted } from '../cortex/diagnosticTools.js';
import { serviceLevels, storedFleetState } from '../cortex/operationalEvidence.js';
import { normaliseSiteKey } from '../cortex/scopeResolver.js';

export const RETENTION_DAYS = 30;

const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/**
 * Parse an instant: ISO 8601, epoch ms/s, or relative ("-2h", "90m ago", "1d").
 * @returns {{ok: true, at: Date} | {ok: false, error: string}}
 */
export function parseAt(value, now = Date.now()) {
  if (value === undefined || value === null || value === '')
    return { ok: false, error: '`at` is required.' };
  let t = null;
  if (typeof value === 'number' || /^\d{9,13}$/.test(String(value))) {
    const n = Number(value);
    t = n < 1e12 ? n * 1000 : n;
  } else {
    const rel =
      /^\s*-?\s*(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?)\s*(ago)?\s*$/i.exec(
        String(value)
      );
    if (rel) {
      t = now - Number(rel[1]) * UNIT_MS[rel[2][0].toLowerCase()];
    } else {
      const parsed = Date.parse(String(value));
      if (Number.isFinite(parsed)) t = parsed;
    }
  }
  if (t === null)
    return {
      ok: false,
      error: `Could not read "${value}" as a time. Use ISO 8601 (2026-10-10T14:00:00Z) or relative ("2h ago").`,
    };
  if (t > now + 60_000) return { ok: false, error: 'That time is in the future.' };
  if (t < now - RETENTION_DAYS * UNIT_MS.d) {
    return {
      ok: false,
      error: `AURA keeps ${RETENTION_DAYS} days of history; that time is older.`,
    };
  }
  return { ok: true, at: new Date(t) };
}

function siteRow(s, nameById) {
  return {
    site: untrusted(nameById.get(String(s.siteId)) ?? `site id ${s.siteId}`),
    overall: s.overall,
    status: s.overallStatus,
    weakestMetric: s.weakestMetric
      ? `${s.weakestMetric.label} ${s.weakestMetric.successRate}%`
      : null,
    sampleAgeSeconds: s.freshestSampleAgeSeconds,
  };
}

export const HISTORY_TOOLS = [
  {
    name: 'get_state_at',
    title: 'State at a past time',
    description: `What the estate looked like at a past instant (up to ${RETENTION_DAYS} days back), from AURA's stored samples: per-site service levels and per-AP status/clients/radios. Set compareToNow to list what changed since (sites that got better or worse, APs that went down or came back). Answers "it was fine at 2 pm" and "what changed since this morning". Per-client state is not stored.`,
    inputSchema: {
      type: 'object',
      properties: {
        at: {
          type: 'string',
          description: 'ISO 8601 time, or relative like "2h ago", "90m", "1d"',
        },
        siteName: { type: 'string', description: 'Optional: one site' },
        compareToNow: {
          type: 'boolean',
          description: 'Also diff that state against now (default true)',
        },
      },
      required: ['at'],
      additionalProperties: false,
    },
    handler: async ({ at, siteName, compareToNow = true }, ctx) => {
      const when = parseAt(at);
      if (!when.ok) return { basis: 'unknown', unavailable: true, reason: when.error };
      const src = await ctx.sourceIdsFor(ctx.controllerUrl);
      if (!src?.ok || !src.sourceIds?.length) {
        return {
          basis: 'unknown',
          unavailable: true,
          reason:
            'AURA has no stored history for this Gateway (no monitoring source, or the database is unreachable).',
        };
      }
      const sites = await ctx.evidence.sites().catch(() => ({ ok: false, rows: [] }));
      const nameById = new Map((sites.rows ?? []).map((s) => [String(s.id), s.siteName ?? s.name]));
      let siteId = null;
      if (siteName) {
        const hit = (sites.rows ?? []).find(
          (s) => normaliseSiteKey(s.siteName ?? s.name) === normaliseSiteKey(siteName)
        );
        if (!hit) {
          return {
            basis: 'unknown',
            unavailable: true,
            status: 'scope_matched_nothing',
            reason: `No site named "${siteName}".`,
            availableSites: [...nameById.values()].map(untrusted),
          };
        }
        siteId = hit.id;
      }

      const [sleThen, fleetThen, sleNow, fleetNow] = await Promise.all([
        serviceLevels({ sourceIds: src.sourceIds, siteId, at: when.at }),
        storedFleetState({ sourceIds: src.sourceIds, siteId, at: when.at }),
        compareToNow ? serviceLevels({ sourceIds: src.sourceIds, siteId }) : null,
        compareToNow ? storedFleetState({ sourceIds: src.sourceIds, siteId }) : null,
      ]);
      if (!sleThen.ok && !fleetThen.ok) {
        return {
          basis: 'unknown',
          unavailable: true,
          reason: `Stored history could not be read: ${sleThen.error ?? fleetThen.error}`,
        };
      }

      const apName = new Map();
      const live = await ctx.session.get('/v1/aps/query').catch(() => null);
      for (const a of live?.ok && Array.isArray(live.data) ? live.data : [])
        apName.set(a.serialNumber, a.apName);
      const apRow = (a) => ({
        ap: untrusted(apName.get(a.serial) ?? a.serial),
        serial: a.serial,
        site: untrusted(a.siteName ?? nameById.get(String(a.siteId)) ?? null),
        status: a.status,
        clients: a.clientCount,
        sampleAgeSeconds: a.ageSeconds,
      });

      const out = {
        basis: 'observed',
        source: 'AURA monitoring DB (stored samples, 60 s cadence)',
        at: when.at.toISOString(),
        scope: siteName ? untrusted(siteName) : 'all sites',
        serviceLevels: sleThen.ok
          ? sleThen.sites.map((s) => siteRow(s, nameById))
          : { unavailable: true, reason: sleThen.error },
        accessPoints: fleetThen.ok
          ? {
              total: fleetThen.aps.length,
              statusCounts: fleetThen.meta.statusCounts,
              rows: fleetThen.aps.map(apRow),
            }
          : { unavailable: true, reason: fleetThen.error },
        note: 'A site or AP missing from this snapshot had no sample within 2 hours before that time: not measured, not healthy. Service levels use server-side thresholds (see get_service_levels).',
      };

      if (compareToNow && sleNow?.ok && sleThen.ok) {
        const thenBy = new Map(sleThen.sites.map((s) => [String(s.siteId), s]));
        out.changedSinceThen = {
          serviceLevels: sleNow.sites
            .map((s) => {
              const before = thenBy.get(String(s.siteId));
              const delta =
                before?.overall != null && s.overall != null
                  ? Number((s.overall - before.overall).toFixed(1))
                  : null;
              return {
                site: untrusted(nameById.get(String(s.siteId)) ?? s.siteId),
                then: before?.overall ?? null,
                now: s.overall,
                delta,
                statusThen: before?.overallStatus ?? null,
                statusNow: s.overallStatus,
              };
            })
            .filter((r) =>
              r.delta === null
                ? r.then !== r.now
                : Math.abs(r.delta) >= 1 || r.statusThen !== r.statusNow
            ),
        };
      }
      if (compareToNow && fleetNow?.ok && fleetThen.ok) {
        const thenBy = new Map(fleetThen.aps.map((a) => [a.serial, a]));
        const nowBy = new Map(fleetNow.aps.map((a) => [a.serial, a]));
        const statusChanged = [];
        for (const a of fleetNow.aps) {
          const b = thenBy.get(a.serial);
          if (b && b.status !== a.status)
            statusChanged.push({ ...apRow(a), statusThen: b.status, statusNow: a.status });
        }
        out.changedSinceThen = {
          ...(out.changedSinceThen ?? {}),
          apStatusChanged: statusChanged,
          apsNewSinceThen: fleetNow.aps.filter((a) => !thenBy.has(a.serial)).map(apRow),
          apsNoLongerReporting: fleetThen.aps.filter((a) => !nowBy.has(a.serial)).map(apRow),
        };
      }
      return out;
    },
  },
];
