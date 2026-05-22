/**
 * Cortex tool catalog — read-only functions the LLM can invoke to investigate
 * any part of the controller API surface. Each tool maps to a Campus Controller
 * /api/management endpoint. No PUT / POST / DELETE here — write operations go
 * through the existing executionPlan + approval path, never the LLM directly.
 *
 * Shape:
 *   spec       OpenAI-compatible function definition (sent to the LLM)
 *   method     HTTP method (always GET for now)
 *   buildPath  (args) => "/v1/..." — encodes/inserts user-supplied args safely
 */

function enc(v) {
  return encodeURIComponent(String(v));
}

function withQs(path, params) {
  const qs = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join('&');
  return qs ? `${path}?${qs}` : path;
}

export const TOOLS = {
  listSites: {
    spec: {
      name: 'listSites',
      description:
        'List all sites known to the controller, with operational state. Use to answer "which sites are unhealthy", "how many sites do we have", or to enumerate siteIds before drilling in.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    method: 'GET',
    buildPath: () => '/v1/state/sites',
  },

  getSiteHealth: {
    spec: {
      name: 'getSiteHealth',
      description:
        'Fetch detailed health for a single site, including SLE rollup and AP rollup. Use after listSites to drill into a problem site.',
      parameters: {
        type: 'object',
        properties: { siteId: { type: 'string', description: 'Site identifier' } },
        required: ['siteId'],
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ siteId }) => `/v1/state/sites/${enc(siteId)}`,
  },

  getSiteReport: {
    spec: {
      name: 'getSiteReport',
      description:
        'Time-windowed SLE report for a site (uptime, latency, packet loss). Use to answer "how has site X been performing".',
      parameters: {
        type: 'object',
        properties: {
          siteId: { type: 'string' },
          duration: {
            type: 'string',
            description: 'Time window, e.g. 1h, 24h, 7d',
            default: '24h',
          },
        },
        required: ['siteId'],
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ siteId, duration = '24h' }) =>
      withQs(`/v1/report/sites/${enc(siteId)}`, { duration }),
  },

  getSiteSmartRf: {
    spec: {
      name: 'getSiteSmartRf',
      description:
        'Smart RF history for a site (channel changes, power changes, DFS events). Use when investigating widespread RF issues.',
      parameters: {
        type: 'object',
        properties: {
          siteId: { type: 'string' },
          duration: { type: 'string', default: '24h' },
        },
        required: ['siteId'],
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ siteId, duration = '24h' }) =>
      withQs(`/v1/report/sites/${enc(siteId)}/smartrf`, { duration }),
  },

  listAps: {
    spec: {
      name: 'listAps',
      description:
        'List access points, optionally filtered by site. Returns operational state, serial, uptime. Use for "which APs are offline", "how many APs do we have".',
      parameters: {
        type: 'object',
        properties: {
          siteId: { type: 'string', description: 'Optional site filter' },
        },
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ siteId } = {}) =>
      siteId ? `/v1/state/sites/${enc(siteId)}/aps` : '/v1/state/aps',
  },

  getApDetail: {
    spec: {
      name: 'getApDetail',
      description: 'Full detail for a single AP by serial number.',
      parameters: {
        type: 'object',
        properties: { apSerialNumber: { type: 'string' } },
        required: ['apSerialNumber'],
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ apSerialNumber }) => `/v1/state/aps/${enc(apSerialNumber)}`,
  },

  getApRfStats: {
    spec: {
      name: 'getApRfStats',
      description:
        'Interface / radio statistics for one or all APs: channel utilization, noise, client count, retry rate. Pass apSerialNumber to scope to a single AP.',
      parameters: {
        type: 'object',
        properties: { apSerialNumber: { type: 'string' } },
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ apSerialNumber } = {}) =>
      withQs(
        apSerialNumber ? `/v1/aps/ifstats/${enc(apSerialNumber)}` : '/v1/aps/ifstats',
        { rfStats: 'true' }
      ),
  },

  getApSmartRf: {
    spec: {
      name: 'getApSmartRf',
      description: 'Smart RF history for a single AP — channel/power changes, DFS events.',
      parameters: {
        type: 'object',
        properties: {
          apSerialNumber: { type: 'string' },
          duration: { type: 'string', default: '24h' },
        },
        required: ['apSerialNumber'],
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ apSerialNumber, duration = '24h' }) =>
      withQs(`/v1/report/aps/${enc(apSerialNumber)}/smartrf`, { duration }),
  },

  listClients: {
    spec: {
      name: 'listClients',
      description:
        'Query connected clients (stations) with optional filters. Use to enumerate clients, find impacted clients, or look up by SSID/site.',
      parameters: {
        type: 'object',
        properties: {
          siteId: { type: 'string' },
          serviceId: { type: 'string', description: 'WLAN/service id filter' },
        },
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ siteId, serviceId } = {}) => {
      if (siteId) return `/v3/sites/${enc(siteId)}/stations`;
      if (serviceId) return `/v1/services/${enc(serviceId)}/stations`;
      return '/v1/stations/query';
    },
  },

  getClientDetail: {
    spec: {
      name: 'getClientDetail',
      description: 'Detailed state of a single client by MAC address.',
      parameters: {
        type: 'object',
        properties: { mac: { type: 'string', description: 'Client MAC address' } },
        required: ['mac'],
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ mac }) => `/v1/stations/${enc(mac)}`,
  },

  getClientEvents: {
    spec: {
      name: 'getClientEvents',
      description: 'Connection/auth events for a client by MAC, within a time window.',
      parameters: {
        type: 'object',
        properties: {
          mac: { type: 'string' },
          startTime: { type: 'string', description: 'ISO timestamp' },
          endTime: { type: 'string', description: 'ISO timestamp' },
        },
        required: ['mac'],
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ mac, startTime, endTime }) =>
      withQs(`/v1/stations/events/${enc(mac)}`, { startTime, endTime }),
  },

  listServices: {
    spec: {
      name: 'listServices',
      description: 'List WLAN services (SSIDs / network policies) defined on the controller.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    method: 'GET',
    buildPath: () => '/v1/services',
  },

  getServiceDetail: {
    spec: {
      name: 'getServiceDetail',
      description: 'Configuration for a single WLAN service (security mode, AAA policy, etc.).',
      parameters: {
        type: 'object',
        properties: { serviceId: { type: 'string' } },
        required: ['serviceId'],
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ serviceId }) => `/v1/services/${enc(serviceId)}`,
  },

  getAuditLogs: {
    spec: {
      name: 'getAuditLogs',
      description:
        'Recent configuration audit logs. Use to answer "what changed", or to correlate config changes with issues.',
      parameters: {
        type: 'object',
        properties: {
          startTime: { type: 'string' },
          endTime: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    method: 'GET',
    buildPath: ({ startTime, endTime } = {}) =>
      withQs('/v1/auditlogs', { startTime, endTime }),
  },

  getDriftAlerts: {
    spec: {
      name: 'getDriftAlerts',
      description:
        'Return current infrastructure drift alerts — topology changes, AP profile changes, VLAN removals detected since last poll. Use when operator asks "what has changed", "is anything drifted", or "what went wrong since I last checked".',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    method: 'RESOLVER',
    buildPath: () => '',
  },
};

/** OpenAI-compatible tool definitions for createLlmProvider({ tools }). */
export function getToolSpecs() {
  return Object.values(TOOLS).map((t) => t.spec);
}

export function isKnownTool(name) {
  return Object.prototype.hasOwnProperty.call(TOOLS, name);
}

export function getTool(name) {
  return TOOLS[name];
}
