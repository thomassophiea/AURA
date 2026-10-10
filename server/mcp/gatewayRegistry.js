/**
 * The Gateways the MCP server may read, and how to get a session for one.
 *
 * SOURCE OF TRUTH. AURA's monitoring sources (`monitored_sources`) already hold
 * each Gateway's URL and its encrypted service credentials, and the estate
 * rollup already logs into every one without a browser user. The MCP reuses
 * that registry rather than inventing a second one.
 *
 * NEVER AN ARBITRARY URL. A tool's `gateway` argument is matched against
 * registered sources only (id, display name, URL or host). There is no path by
 * which a caller supplies a URL and makes the server connect to it.
 *
 * OPT-IN. Holding the MCP token must not silently widen to every Gateway AURA
 * monitors. `MCP_GATEWAYS` decides: unset → the default Gateway only; `*` →
 * every enabled source; otherwise a comma list of source ids or names.
 *
 * SESSIONS. A fresh RequestScopedSession per call, built from the cached token
 * of a per-source ControllerSession — the same split the single-Gateway path
 * uses, because RequestScopedSession carries the 90 s budget slow reports need
 * and ControllerSession owns login and token refresh.
 */

const hostOf = (url) => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
};

export class GatewayNotFoundError extends Error {
  constructor(requested, available) {
    super(
      `No Gateway matches "${requested}". Available: ${available.map((g) => g.name).join(', ') || '(none)'}. Use list_gateways.`
    );
    this.available = available;
  }
}

/**
 * @param {object} deps
 * @param {() => Promise<{controllerUrl: string, session: object}|null>} deps.resolveDefault  today's single-Gateway path
 * @param {string|null} deps.defaultUrl
 * @param {() => Promise<object[]>} [deps.listSources]          enabled monitoring sources
 * @param {(id: string) => Promise<{username, password}|null>} [deps.getCredentials]
 * @param {(source: object, creds: object) => Promise<object>} [deps.openSession]  → {controllerUrl, session}
 * @param {(url: string) => string|null} deps.normalizeBaseUrl
 * @param {string|undefined} [deps.allow]                        MCP_GATEWAYS
 */
export function createGatewayRegistry({
  resolveDefault,
  defaultUrl,
  listSources = null,
  getCredentials = null,
  openSession = null,
  normalizeBaseUrl,
  allow,
}) {
  const norm = (u) => (u ? normalizeBaseUrl(u) : null);
  const defaultKey = norm(defaultUrl);
  const allowAll = String(allow ?? '').trim() === '*';
  const allowList = String(allow ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== '*');

  const defaultEntry = () => ({
    id: 'default',
    name: hostOf(defaultUrl) ?? 'default',
    host: hostOf(defaultUrl),
    isDefault: true,
    source: null,
  });

  /** Gateways this deployment exposes. Never throws: a DB failure leaves the default. */
  async function list() {
    if (!listSources) return defaultUrl ? [defaultEntry()] : [];
    let sources = [];
    try {
      sources = await listSources();
    } catch {
      return defaultUrl
        ? [{ ...defaultEntry(), note: 'source registry unreadable; default Gateway only' }]
        : [];
    }
    const out = [];
    let sawDefault = false;
    for (const s of sources) {
      const key = norm(s.baseUrl);
      const isDefault = Boolean(defaultKey && key === defaultKey);
      // The seeded default source is labelled after its env variable, which
      // means nothing to an operator; its host does.
      const seededLabel = /CAMPUS_CONTROLLER_URL/.test(s.displayName ?? '');
      const name = (!seededLabel && s.displayName) || hostOf(s.baseUrl) || s.baseUrl;
      const permitted =
        isDefault ||
        allowAll ||
        allowList.includes(String(s.id).toLowerCase()) ||
        allowList.includes(String(name).toLowerCase());
      if (!permitted) continue;
      if (isDefault) sawDefault = true;
      out.push({ id: s.id, name, host: hostOf(s.baseUrl), isDefault, source: s });
    }
    if (!sawDefault && defaultUrl) out.unshift(defaultEntry());
    return out;
  }

  function matches(g, wanted) {
    const w = String(wanted).trim().toLowerCase();
    return (
      String(g.id).toLowerCase() === w ||
      String(g.name).toLowerCase() === w ||
      (g.host && (g.host === w || g.host.split(':')[0] === w)) ||
      (g.source && norm(g.source.baseUrl)?.toLowerCase() === norm(w)?.toLowerCase())
    );
  }

  /**
   * Resolve a Gateway selector to a live session.
   * @returns {Promise<{controllerUrl: string, session: object, gateway: object}|null>}
   */
  async function resolve(gatewaySelector = null) {
    const all = await list();
    const target = gatewaySelector
      ? all.find((g) => matches(g, gatewaySelector))
      : all.find((g) => g.isDefault);
    if (gatewaySelector && !target) throw new GatewayNotFoundError(gatewaySelector, all);

    const describe = (g) => ({ id: g.id, name: g.name, host: g.host });
    if (!target || target.isDefault) {
      const resolved = await resolveDefault();
      return resolved ? { ...resolved, gateway: describe(target ?? defaultEntry()) } : null;
    }
    if (!getCredentials || !openSession) return null;
    let creds = null;
    try {
      creds = await getCredentials(target.source.id);
    } catch {
      creds = null; // wrong MONITORING_CREDENTIAL_KEY: unavailable, not a crash
    }
    if (!creds?.username || !creds?.password) {
      throw new Error(`Gateway "${target.name}" has no stored credentials AURA can use.`);
    }
    const opened = await openSession(target.source, creds);
    return { ...opened, gateway: describe(target) };
  }

  return { list, resolve };
}
