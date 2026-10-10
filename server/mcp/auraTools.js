/**
 * MCP-native tools: the broad, intent-shaped reads that Mist's MCP leads with
 * (self, config, inventory, universal lookup) plus a Meraki-style read-only API
 * passthrough. The Cortex diagnostic tools answer "what is wrong"; these answer
 * "what is there, where is it, and how is it configured" — the questions an
 * agent needs settled before a diagnosis is worth running.
 *
 * Every handler receives `ctx = { session, controllerUrl, evidence, version }`
 * and returns evidence in the Cortex shape: `basis` observed/inferred/unknown,
 * `unavailable: true` when a read failed (never an empty world), and network
 * strings wrapped as untrusted.
 */

import { untrusted } from '../cortex/diagnosticTools.js';
import { flexCircuitState } from '../cortex/gatewayEvidence.js';
import { isNotReporting } from '../cortex/deviceHealth.js';
import { normaliseSiteKey } from '../cortex/scopeResolver.js';
import { redactSecrets, untrustedData } from './redact.js';
import {
  OPERATIONS,
  CATALOGUE_SOURCE,
  callGatewayApi,
  listTags,
  searchOperations,
} from './gatewayApi.js';

const fail = (what, res) => ({
  basis: 'unknown',
  unavailable: true,
  reason: `Could not read ${what}: ${res?.errorSummary ?? res?.error ?? `HTTP ${res?.status ?? 'no response'}`}.`,
});

async function readList(session, path) {
  const res = await session.get(path);
  if (!res.ok) return { ok: false, res };
  const rows = Array.isArray(res.data) ? res.data : null;
  if (!rows) return { ok: false, res: { errorSummary: `${path} did not return a list` } };
  return { ok: true, rows };
}

const macKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
const isMacLike = (q) => /^[0-9a-f:.\-\s]+$/i.test(q) && macKey(q).length >= 4;
const isIpLike = (q) => /^\d{1,3}(\.\d{1,3}){1,3}\.?$/.test(q) || /^[0-9a-f]*:[0-9a-f:]+$/i.test(q);

/** One AP row → the inventory shape. Placeholder readings on an offline AP are dropped. */
function apSummary(a) {
  const offline = isNotReporting(a);
  return {
    type: 'ap',
    name: untrusted(a.apName),
    serial: a.serialNumber,
    model: a.hardwareType ?? a.platformName ?? null,
    site: untrusted(a.hostSite ?? null),
    status: a.status ?? null,
    connected: !offline,
    ip: a.ipAddress ?? null,
    mac: a.macAddress ?? null,
    firmware: a.softwareVersion ?? null,
    adoptedBy: a.adoptedBy ?? null,
    profile: untrusted(a.profileName ?? null),
    uptimeSeconds: offline ? null : (a.sysUptime ?? null),
    poe: offline
      ? null
      : {
          status: a.ethPowerStatus ?? null,
          watts: a.pwrUsage ?? null,
          source: a.powerSource ?? null,
        },
    tunnel: offline ? null : (a.tunnel ?? null),
    radios: offline
      ? null
      : (a.radios ?? []).map((r) => ({
          index: r.radioIndex,
          mode: r.mode,
          channel: r.channel ?? r.opChannel,
          width: r.channelwidth,
          txPowerDbm: r.txPower,
          clients: r.clients,
          utilisationPct: r.channelUtilization,
          noiseDbm: r.noise,
        })),
  };
}

const nameOf = (o) =>
  o?.name ??
  o?.serviceName ??
  o?.siteName ??
  o?.profileName ??
  o?.ssid ??
  o?.policyName ??
  o?.displayName ??
  null;

/** The configuration object types `get_config` serves, in the operator's words. */
export const CONFIG_TYPES = {
  wlans: { path: '/v1/services', label: 'WLANs (services)' },
  sites: { path: '/v3/sites', label: 'sites' },
  device_profiles: {
    path: '/v3/profiles',
    label: 'AP device profiles (radios, channels, WLAN bindings)',
  },
  roles: { path: '/v3/roles', label: 'roles (firewall/policy rules, captive portal)' },
  vlans: { path: '/v1/topologies', label: 'topologies (VLANs)' },
  aaa_policies: { path: '/v1/aaapolicy', label: 'AAA / RADIUS policies' },
  rf_policies: { path: '/v3/rfmgmt', label: 'RF management (Smart RF / ACS) policies' },
  class_of_service: { path: '/v1/cos', label: 'class of service (QoS)' },
  rate_limiters: { path: '/v1/ratelimiters', label: 'rate limiters' },
  mesh: { path: '/v3/meshpoints', label: 'mesh points' },
  air_defense: { path: '/v3/adsp', label: 'ADSP (air defence / WIPS) profiles' },
  iot: { path: '/v3/iotprofile', label: 'IoT profiles' },
  positioning: { path: '/v3/positioning', label: 'positioning profiles' },
  location: { path: '/v3/xlocation', label: 'ExtremeLocation profiles' },
  rtls: { path: '/v1/rtlsprofile', label: 'RTLS profiles' },
  guest: { path: '/v1/eguest', label: 'ExtremeGuest profiles' },
  analytics: { path: '/v3/analytics', label: 'analytics profiles' },
  switch_port_profiles: { path: '/v3/switchportprofile', label: 'switch port profiles' },
  snmp: { path: '/v1/snmp', label: 'SNMP configuration' },
  adoption_rules: { path: '/v1/devices/adoptionrules', label: 'device adoption rules' },
  access_control: { path: '/v1/accesscontrol', label: 'access control (MAC allow/deny)' },
};

export const NATIVE_TOOLS = [
  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'get_aura_context',
    title: 'AURA context',
    description:
      'START HERE. Who and what this AURA connection can see: the Gateway it reads, AURA version, estate size (sites, APs online/offline, WLANs), the health of the Gateway telemetry service, and which tool answers which kind of question. Cheap (<1 s).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_args, ctx) => {
      const [sites, aps, wlans] = await Promise.all([
        readList(ctx.session, '/v3/sites'),
        readList(ctx.session, '/v1/aps/query'),
        readList(ctx.session, '/v1/services'),
      ]);
      const apRows = aps.ok ? aps.rows : [];
      const offline = apRows.filter(isNotReporting).length;
      let host = null;
      try {
        host = ctx.controllerUrl ? new URL(ctx.controllerUrl).host : null;
      } catch {
        host = null;
      }
      return {
        basis: 'observed',
        platform:
          'AURA — Extreme Networks wireless management, reading an Extreme Campus Controller (Gateway)',
        auraVersion: ctx.version,
        gateway: host,
        access: 'read-only (changes are made and approved inside AURA, never over this connection)',
        estate: {
          sites: sites.ok ? sites.rows.length : null,
          siteNames: sites.ok ? sites.rows.map((s) => untrusted(s.siteName ?? s.name)) : null,
          accessPoints: aps.ok
            ? { total: apRows.length, connected: apRows.length - offline, offline }
            : null,
          wlans: wlans.ok ? wlans.rows.length : null,
          ...(sites.ok && aps.ok && wlans.ok
            ? {}
            : {
                partial:
                  'One or more inventory reads failed; counts shown as null are unknown, not zero.',
              }),
        },
        telemetry: {
          clientReportService: flexCircuitState(ctx.controllerUrl),
          note: 'When the Gateway report service is down, client lists come from per-site station reads and SNR is derived from radio noise (errs low). RFQI/RTT are then per-client only.',
        },
        toolGuide: {
          'what is wrong / is X healthy': [
            'get_site_health',
            'get_service_levels',
            'get_alerts',
            'correlate_problem',
          ],
          'one client': [
            'find_entity',
            'diagnose_client',
            'get_client_timeline',
            'compare_client_to_peers',
            'get_client_history',
          ],
          'access points': [
            'list_devices',
            'get_device_health',
            'get_ap_rf_health',
            'get_ap_reboot_history',
            'build_rma_evidence',
          ],
          'RF / WLAN': [
            'get_site_rf_health',
            'get_wlan_health',
            'get_wlan_config',
            'reconcile_wlan_configuration',
          ],
          configuration: ['get_config', 'get_recent_changes', 'list_available_changes'],
          'history / trends': ['get_metric_history', 'find_vanished_devices'],
          'anything else': ['search_gateway_api', 'call_gateway_api'],
        },
      };
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'find_entity',
    title: 'Find anything',
    description:
      'Universal lookup: give a MAC (any format, partial ok), IP, hostname, username, AP name or serial, site name, or SSID and get every matching client, access point, site and WLAN, each with the tool to call next. Use when you do not yet know what kind of thing an identifier is.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'MAC, IP, hostname, username, AP name/serial, site name or SSID',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Max matches per kind (default 25)',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: async ({ query, limit = 25 }, ctx) => {
      const q = String(query ?? '').trim();
      if (q.length < 2)
        return {
          basis: 'unknown',
          unavailable: true,
          reason: 'query must be at least 2 characters.',
        };
      const cap = Math.max(1, Math.min(Number(limit) || 25, 100));
      const [sites, aps, wlans, stations] = await Promise.all([
        readList(ctx.session, '/v3/sites'),
        readList(ctx.session, '/v1/aps/query'),
        readList(ctx.session, '/v1/services'),
        ctx.evidence.stations().catch((err) => ({ ok: false, error: err.message })),
      ]);
      const mac = isMacLike(q) ? macKey(q) : null;
      const ip = isIpLike(q) ? q.replace(/\.$/, '') : null;
      const text = q.toLowerCase();
      const has = (v) => v != null && String(v).toLowerCase().includes(text);
      const siteById = new Map(
        (sites.ok ? sites.rows : []).map((s) => [s.id, s.siteName ?? s.name])
      );
      const ssidById = new Map((wlans.ok ? wlans.rows : []).map((w) => [w.id, w.ssid]));

      const clients = (stations.ok ? stations.rows : [])
        .filter((c) =>
          mac
            ? macKey(c.MAC).includes(mac)
            : ip
              ? String(c.IP ?? '').startsWith(ip)
              : has(c.HostName) || has(c.UserName) || has(c.MAC)
        )
        .slice(0, cap)
        .map((c) => ({
          type: 'client',
          mac: c.MAC,
          ip: c.IP,
          hostname: untrusted(c.HostName),
          username: untrusted(c.UserName),
          manufacturer: untrusted(c.Manufacturer),
          ssid: untrusted(ssidById.get(c.RFSUUID) ?? null),
          ap: untrusted(c.ApName),
          site: untrusted(siteById.get(c.SiteId) ?? null),
          rssDbm: c.Rss,
          next: { tool: 'diagnose_client', arguments: { mac: c.MAC } },
        }));

      const apMatches = (aps.ok ? aps.rows : [])
        .filter((a) =>
          mac
            ? macKey(a.macAddress).includes(mac) || macKey(a.serialNumber).includes(mac)
            : ip
              ? String(a.ipAddress ?? '').startsWith(ip)
              : has(a.apName) || has(a.serialNumber) || has(a.hostname) || has(a.hostSite)
        )
        .slice(0, cap)
        .map((a) => ({
          ...apSummary(a),
          radios: undefined,
          next: { tool: 'get_device_health', arguments: { apSerial: a.serialNumber } },
        }));

      const siteMatches =
        mac || ip
          ? []
          : (sites.ok ? sites.rows : [])
              .filter(
                (s) =>
                  has(s.siteName ?? s.name) ||
                  normaliseSiteKey(s.siteName ?? s.name) === normaliseSiteKey(q)
              )
              .slice(0, cap)
              .map((s) => ({
                type: 'site',
                name: untrusted(s.siteName ?? s.name),
                id: s.id,
                country: s.country ?? null,
                next: { tool: 'get_site_health', arguments: { siteName: s.siteName ?? s.name } },
              }));

      const wlanMatches =
        mac || ip
          ? []
          : (wlans.ok ? wlans.rows : [])
              .filter((w) => has(w.ssid) || has(w.serviceName))
              .slice(0, cap)
              .map((w) => ({
                type: 'wlan',
                ssid: untrusted(w.ssid),
                serviceName: untrusted(w.serviceName),
                id: w.id,
                status: w.status ?? null,
                next: { tool: 'get_wlan_health', arguments: { serviceId: w.id } },
              }));

      const failed = [
        !sites.ok && 'sites',
        !aps.ok && 'access points',
        !wlans.ok && 'WLANs',
        !stations.ok && 'clients',
      ].filter(Boolean);
      const total = clients.length + apMatches.length + siteMatches.length + wlanMatches.length;
      return {
        basis: 'observed',
        query: untrusted(q),
        interpretedAs: mac ? 'mac' : ip ? 'ip' : 'text',
        total,
        clients,
        accessPoints: apMatches,
        sites: siteMatches,
        wlans: wlanMatches,
        ...(stations.via ? { clientSource: stations.via } : {}),
        ...(failed.length
          ? {
              incomplete: `Could not read ${failed.join(', ')}; a miss there is unknown, not absent.`,
            }
          : {}),
        ...(total === 0 && !failed.length
          ? {
              note: 'Nothing currently connected or configured matches. A client that left is not in live data; try get_client_history.',
            }
          : {}),
      };
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'list_devices',
    title: 'Device inventory',
    description:
      'Inventory of access points (and switches) with live state: model, site, status, connected/offline, IP/MAC, firmware, uptime, PoE, tunnel, and per-radio channel/width/power/clients/utilisation/noise. Filter by site, status, model, firmware or text. Offline APs show null for readings the Gateway only fakes when an AP is disconnected.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['aps', 'switches', 'all'], description: 'Default aps' },
        siteName: { type: 'string', description: 'Only this site (name from list_sites)' },
        connected: { type: 'boolean', description: 'true = only connected, false = only offline' },
        model: { type: 'string', description: 'Substring of the hardware model, e.g. AP5020' },
        firmware: { type: 'string', description: 'Substring of the software version' },
        text: { type: 'string', description: 'Substring of name, serial, IP or MAC' },
        includeRadios: { type: 'boolean', description: 'Include per-radio detail (default true)' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Default 100' },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const kind = args.kind ?? 'aps';
      const out = { basis: 'observed' };
      if (kind === 'aps' || kind === 'all') {
        const aps = await readList(ctx.session, '/v1/aps/query');
        if (!aps.ok) return fail('the access point inventory', aps.res);
        let rows = aps.rows;
        if (args.siteName) {
          const key = normaliseSiteKey(args.siteName);
          rows = rows.filter((a) => normaliseSiteKey(a.hostSite) === key);
          if (!rows.length && aps.rows.length) {
            return {
              basis: 'unknown',
              unavailable: true,
              status: 'scope_matched_nothing',
              reason: `No access point is homed at "${args.siteName}". This is a name mismatch, not an empty site.`,
              sitesWithAps: [...new Set(aps.rows.map((a) => a.hostSite).filter(Boolean))].map(
                untrusted
              ),
            };
          }
        }
        if (typeof args.connected === 'boolean')
          rows = rows.filter((a) => !isNotReporting(a) === args.connected);
        const sub = (v, n) =>
          !n ||
          String(v ?? '')
            .toLowerCase()
            .includes(String(n).toLowerCase());
        rows = rows.filter(
          (a) =>
            sub(`${a.hardwareType} ${a.platformName}`, args.model) &&
            sub(a.softwareVersion, args.firmware) &&
            (!args.text ||
              [a.apName, a.serialNumber, a.ipAddress, a.macAddress, a.hostname].some((v) =>
                sub(v, args.text)
              ))
        );
        const limit = Math.max(1, Math.min(Number(args.limit) || 100, 500));
        const statusCounts = {};
        for (const a of rows) {
          const k = isNotReporting(a) ? 'offline' : (a.status ?? 'unknown');
          statusCounts[k] = (statusCounts[k] ?? 0) + 1;
        }
        out.accessPoints = {
          total: rows.length,
          statusCounts,
          returned: Math.min(rows.length, limit),
          rows: rows.slice(0, limit).map((a) => {
            const s = apSummary(a);
            if (args.includeRadios === false) delete s.radios;
            return s;
          }),
        };
      }
      if (kind === 'switches' || kind === 'all') {
        const sw = await readList(ctx.session, '/v1/switches');
        out.switches = sw.ok
          ? { total: sw.rows.length, rows: untrustedData(redactSecrets(sw.rows)) }
          : fail('the switch inventory', sw.res);
      }
      out.source = 'GET /v1/aps/query' + (kind !== 'aps' ? ' + /v1/switches' : '');
      return out;
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'get_config',
    title: 'Configuration',
    description: `Intended-state configuration of any object type, secrets redacted. Without name/id it returns a compact index (id + name) so you can pick one; with name or id it returns the full object. Types: ${Object.keys(CONFIG_TYPES).join(', ')}.`,
    inputSchema: {
      type: 'object',
      properties: {
        objectType: { type: 'string', enum: Object.keys(CONFIG_TYPES) },
        name: {
          type: 'string',
          description: 'Exact or partial name (SSID, profile, site, role, policy…)',
        },
        id: { type: 'string', description: 'Object id' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only these fields (dot paths allowed)',
        },
      },
      required: ['objectType'],
      additionalProperties: false,
    },
    handler: async ({ objectType, name, id, fields }, ctx) => {
      const type = CONFIG_TYPES[objectType];
      if (!type)
        return { basis: 'unknown', unavailable: true, reason: `Unknown objectType ${objectType}.` };
      const res = await ctx.session.get(type.path);
      if (!res.ok) return fail(type.label, res);
      const data = redactSecrets(res.data);
      if (!Array.isArray(data)) {
        return {
          basis: 'observed',
          source: `GET ${type.path}`,
          objectType,
          secretsRedacted: true,
          config: untrustedData(data),
        };
      }
      const pickFields = (o) => {
        if (!fields?.length) return o;
        const r = { id: o.id };
        for (const f of fields) {
          const v = String(f)
            .split('.')
            .reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), o);
          if (v !== undefined) r[f] = v;
        }
        return r;
      };
      if (!name && !id) {
        return {
          basis: 'observed',
          source: `GET ${type.path}`,
          objectType,
          count: data.length,
          ...(fields?.length
            ? { objects: data.map((o) => untrustedData(pickFields(o))) }
            : { index: data.map((o) => ({ id: o.id ?? null, name: untrusted(nameOf(o)) })) }),
          next: 'Call again with name or id for the full object, or pass fields to project specific settings across all objects.',
        };
      }
      const needle = name ? String(name).toLowerCase() : null;
      const hits = data.filter(
        (o) =>
          (id && o.id === id) ||
          (needle &&
            [
              o.name,
              o.serviceName,
              o.siteName,
              o.profileName,
              o.ssid,
              o.policyName,
              o.displayName,
            ].some((v) => v != null && String(v).toLowerCase().includes(needle)))
      );
      if (!hits.length) {
        return {
          basis: 'observed',
          status: 'not_found',
          note: `No ${type.label} matches ${id ? `id ${id}` : `"${name}"`}.`,
          available: data.map((o) => untrusted(nameOf(o))).slice(0, 60),
        };
      }
      return {
        basis: 'observed',
        source: `GET ${type.path}`,
        objectType,
        matched: hits.length,
        secretsRedacted: true,
        objects: hits.slice(0, 10).map((o) => untrustedData(pickFields(o))),
        ...(hits.length > 10
          ? { truncated: `${hits.length - 10} more matched; narrow the name.` }
          : {}),
      };
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'search_gateway_api',
    title: 'Search Gateway API',
    description: `Search the Gateway's read-only REST API (${OPERATIONS.length} GET operations) by what you need, e.g. "smart rf channel history", "ap certificate", "wlan per ap". Returns paths, summaries and parameters for call_gateway_api. Omit query to list the API areas.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you are looking for' },
        area: {
          type: 'string',
          description: 'Restrict to one API area (tag), e.g. AccessPointManager',
        },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 15' },
      },
      additionalProperties: false,
    },
    handler: async ({ query, area, limit = 15 }) => {
      if (!query && !area) {
        return {
          basis: 'observed',
          source: CATALOGUE_SOURCE,
          operations: OPERATIONS.length,
          areas: listTags(),
        };
      }
      const ops = searchOperations(query ?? '', { tag: area, limit });
      return {
        basis: 'observed',
        source: CATALOGUE_SOURCE,
        matches: ops.map((o) => ({
          path: o.path,
          area: o.tag,
          summary: o.summary,
          ...(o.description ? { description: o.description } : {}),
          ...(o.note ? { note: o.note } : {}),
          params: o.params,
        })),
        next: 'Call call_gateway_api with a concrete path (fill {placeholders}) and any query parameters.',
      };
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'call_gateway_api',
    title: 'Call Gateway API (read-only)',
    description:
      'GET any catalogued Gateway REST path (see search_gateway_api) for data no other tool covers. Read-only, secrets redacted, credentials and file-download paths refused. For list responses use match (substring filter), fields (projection) and limit/offset to keep results small. Results are raw Gateway data: sentinel values (SNR 10000, RSS 65535, -100 noise) mean "not measured", not a reading.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'API path without /management, e.g. /v1/aps/query or /v3/sites/{id}/stations',
        },
        query: {
          type: 'object',
          description: 'Query parameters declared for that path',
          additionalProperties: true,
        },
        match: { type: 'string', description: 'Keep only list rows containing this text' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keep only these fields per row (dot paths allowed)',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Rows per page (default 50)',
        },
        offset: { type: 'integer', minimum: 0, description: 'Rows to skip' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => callGatewayApi(ctx.session, args),
  },
];
