/**
 * Multi-Gateway tools: which Gateways this connection can read, and one
 * rollup across all of them.
 *
 * Every other tool takes an optional `gateway` argument (added by the router),
 * so "how is the Boston Gateway's lobby site?" is the same call as for the
 * primary Gateway with one more argument. These two exist for the questions
 * that span Gateways.
 *
 * A Gateway that cannot be reached is a ROW in the rollup, never a missing
 * one: an estate view that quietly drops the broken Gateway reports a healthy
 * estate precisely when it is not.
 */

import { untrusted } from '../cortex/diagnosticTools.js';
import { isNotReporting } from '../cortex/deviceHealth.js';
import { serviceLevels } from '../cortex/operationalEvidence.js';

export const FLEET_PROBE_TIMEOUT_MS = 20_000;
const FLEET_CONCURRENCY = 4;

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000} s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** One Gateway's headline numbers. Cheap reads only (~0.3 s on the lab Gateway). */
export async function summariseGateway({ session, controllerUrl, sourceIdsFor }) {
  const [sites, aps, wlans] = await Promise.all([
    session.get('/v3/sites'),
    session.get('/v1/aps/query'),
    session.get('/v1/services'),
  ]);
  const apRows = aps.ok && Array.isArray(aps.data) ? aps.data : null;
  const offline = apRows ? apRows.filter(isNotReporting).length : null;

  let serviceLevel = null;
  try {
    const src = await sourceIdsFor(controllerUrl);
    if (src?.ok && src.sourceIds.length) {
      const sle = await serviceLevels({ sourceIds: src.sourceIds });
      if (sle.ok) {
        const siteNames = new Map(
          (sites.ok && Array.isArray(sites.data) ? sites.data : []).map((s) => [
            String(s.id),
            s.siteName ?? s.name,
          ])
        );
        const scored = sle.sites.filter((s) => s.overall !== null);
        const worst = scored[0] ?? null;
        serviceLevel = {
          sitesScored: scored.length,
          average: scored.length
            ? Number((scored.reduce((a, s) => a + s.overall, 0) / scored.length).toFixed(1))
            : null,
          poorSites: scored.filter((s) => s.overallStatus === 'poor').length,
          worstSite: worst
            ? {
                site: untrusted(siteNames.get(String(worst.siteId)) ?? worst.siteId),
                overall: worst.overall,
                weakest: worst.weakestMetric?.label ?? null,
              }
            : null,
        };
      }
    }
  } catch {
    serviceLevel = null;
  }

  return {
    sites: sites.ok && Array.isArray(sites.data) ? sites.data.length : null,
    accessPoints: apRows
      ? { total: apRows.length, connected: apRows.length - offline, offline }
      : null,
    wlans: wlans.ok && Array.isArray(wlans.data) ? wlans.data.length : null,
    serviceLevel,
    ...(sites.ok && aps.ok && wlans.ok
      ? {}
      : { partial: 'Some inventory reads failed; null means unknown, not zero.' }),
  };
}

export const FLEET_TOOLS = [
  {
    name: 'list_gateways',
    title: 'List Gateways',
    description:
      'The Gateways (Campus Controllers) this AURA connection can read. Pass one of these as `gateway` to any other tool; omit it for the primary Gateway.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_args, ctx) => {
      const all = await ctx.gateways.list();
      return {
        basis: 'observed',
        count: all.length,
        gateways: all.map((g) => ({
          id: g.id,
          name: untrusted(g.name),
          host: g.host ?? null,
          primary: Boolean(g.isDefault),
          ...(g.note ? { note: g.note } : {}),
        })),
        note:
          all.length <= 1
            ? 'Only the primary Gateway is exposed. More are added by registering them as AURA monitoring sources and listing them in MCP_GATEWAYS.'
            : undefined,
      };
    },
  },
  {
    name: 'get_fleet_overview',
    title: 'Fleet overview',
    description:
      'One row per Gateway across the whole estate: sites, APs connected/offline, WLANs, and service-level average with the worst site. An unreachable Gateway is reported as a row with its error, never dropped. Use for "how is the whole network?" across Gateways.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_args, ctx) => {
      const all = await ctx.gateways.list();
      const rows = await mapWithConcurrency(all, FLEET_CONCURRENCY, async (g) => {
        const started = Date.now();
        try {
          const resolved = await withTimeout(
            ctx.gateways.resolve(g.isDefault ? null : g.id),
            FLEET_PROBE_TIMEOUT_MS,
            'login'
          );
          if (!resolved)
            return { gateway: untrusted(g.name), reachable: false, error: 'no credentials' };
          const summary = await withTimeout(
            summariseGateway({
              session: resolved.session,
              controllerUrl: resolved.controllerUrl,
              sourceIdsFor: ctx.sourceIdsFor,
            }),
            FLEET_PROBE_TIMEOUT_MS,
            'inventory read'
          );
          return {
            gateway: untrusted(g.name),
            host: g.host ?? null,
            primary: Boolean(g.isDefault),
            reachable: true,
            durationMs: Date.now() - started,
            ...summary,
          };
        } catch (err) {
          return {
            gateway: untrusted(g.name),
            host: g.host ?? null,
            primary: Boolean(g.isDefault),
            reachable: false,
            error: err.message,
          };
        }
      });
      const reachable = rows.filter((r) => r.reachable);
      const sum = (f) => reachable.reduce((a, r) => a + (f(r) ?? 0), 0);
      return {
        basis: 'observed',
        totals: {
          gateways: rows.length,
          reachable: reachable.length,
          unreachable: rows.length - reachable.length,
          sites: sum((r) => r.sites),
          accessPoints: sum((r) => r.accessPoints?.total),
          offlineAccessPoints: sum((r) => r.accessPoints?.offline),
          wlans: sum((r) => r.wlans),
          poorSites: sum((r) => r.serviceLevel?.poorSites),
        },
        gateways: rows,
        ...(rows.length - reachable.length
          ? {
              warning:
                'One or more Gateways could not be read; the totals cover reachable Gateways only.',
            }
          : {}),
      };
    },
  },
];
