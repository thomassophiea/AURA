/**
 * Authenticated controller client for the collector.
 *
 * The collector cannot borrow a browser's token: it runs when nobody is logged
 * in. It mints its own OAuth2 token per source from durable credentials and
 * keeps it in memory only — a token is never written to the database.
 *
 * Mirrors the login negotiation in `src/services/api.ts`, which tries several
 * body shapes because different Extreme controller versions accept different
 * ones.
 */

import https from 'node:https';

import { requestXcc } from '../validationEngine/xccClient.js';
import { sanitizeError } from './errorSanitizer.js';

/**
 * Campus Controllers are routinely deployed with self-signed certificates, and
 * the rest of AURA already accepts them (`server.js` proxies with
 * `secure: false`; `xccClient.js` uses a permissive agent). The collector
 * matches that so it can reach the same controllers the UI reaches — but the
 * choice is explicit and reversible rather than hidden: set
 * MONITORING_TLS_REJECT_UNAUTHORIZED=true to require a verifiable chain.
 */
export function tlsVerificationEnabled(env = process.env) {
  return String(env.MONITORING_TLS_REJECT_UNAUTHORIZED ?? '').toLowerCase() === 'true';
}

const permissiveAgent = new https.Agent({ rejectUnauthorized: false });
const strictAgent = new https.Agent({ rejectUnauthorized: true });

function httpsAgent() {
  return tlsVerificationEnabled() ? strictAgent : permissiveAgent;
}

/** Re-mint slightly before expiry so a poll never starts with a dead token. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Body shapes accepted by different controller versions, in the same order api.ts tries. */
const AUTH_BODIES = [
  (userId, password) => ({ grantType: 'password', userId, password }),
  (userId, password) => ({ grant_type: 'password', userId, password }),
  (userId, password) => ({ grantType: 'password', userId, password, scope: '' }),
  (userId, password) => ({ grantType: 'password', username: userId, password }),
];

export class ControllerAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ControllerAuthError';
    this.status = 401;
  }
}

/**
 * A controller session: holds a token and re-mints it on demand.
 * One instance per monitored source, held by the collector process.
 */
export class ControllerSession {
  #baseUrl;
  #username;
  #password;
  #fetchFn;
  #timeoutMs;
  #token = null;
  #expiresAt = 0;
  #inFlight = null;

  constructor({ baseUrl, username, password, fetchFn = null, timeoutMs = 15_000 }) {
    if (!baseUrl) throw new Error('baseUrl is required for a controller session.');
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#username = username;
    this.#password = password;
    this.#fetchFn = fetchFn;
    this.#timeoutMs = timeoutMs;
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  hasCredentials() {
    return Boolean(this.#username && this.#password);
  }

  /** Drop the cached token so the next request re-authenticates. */
  invalidate() {
    this.#token = null;
    this.#expiresAt = 0;
  }

  async #login() {
    const fn = this.#fetchFn ?? globalThis.fetch;
    const url = `${this.#baseUrl}/management/v1/oauth2/token`;
    let lastStatus = null;

    for (const buildBody of AUTH_BODIES) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const init = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(buildBody(this.#username, this.#password)),
          signal: controller.signal,
        };
        if (!this.#fetchFn && url.startsWith('https')) init.agent = httpsAgent();

        const resp = await fn(url, init);
        lastStatus = resp.status;
        if (!resp.ok) {
          // 401 means the credentials are wrong, not the body shape — stop
          // retrying rather than hammering the controller four times.
          if (resp.status === 401) break;
          continue;
        }

        const body = await resp.json();
        const token = body.access_token ?? body.accessToken;
        if (!token) continue;

        const ttlSeconds = Number(body.expires_in ?? body.expiresIn);
        const ttlMs = Number.isFinite(ttlSeconds) && ttlSeconds > 0
          ? ttlSeconds * 1000
          : DEFAULT_TOKEN_TTL_MS;

        this.#token = token;
        this.#expiresAt = Date.now() + ttlMs - TOKEN_REFRESH_MARGIN_MS;
        return this.#token;
      } catch (error) {
        // Network/timeout on one shape: try the next, but surface the failure
        // if every shape fails.
        lastStatus = lastStatus ?? null;
        if (error?.name === 'AbortError') break;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new ControllerAuthError(
      `Could not authenticate to the controller${lastStatus ? ` (HTTP ${lastStatus})` : ''}.`
    );
  }

  /** Current token, minting or refreshing as needed. Concurrent callers share one login. */
  async getToken() {
    if (this.#token && Date.now() < this.#expiresAt) return this.#token;
    if (!this.hasCredentials()) {
      throw new ControllerAuthError('No credentials configured for this source.');
    }
    if (!this.#inFlight) {
      this.#inFlight = this.#login().finally(() => {
        this.#inFlight = null;
      });
    }
    return this.#inFlight;
  }

  /**
   * GET a controller path. Returns the response envelope rather than throwing,
   * so a collector can record a partial failure and continue.
   *
   * A 401 triggers exactly one re-auth + retry, matching apiService's behaviour.
   *
   * @returns {Promise<{ ok: boolean, status: number|null, data: any,
   *                     errorClass: string|null, errorSummary: string|null }>}
   */
  async get(path, { retryOnAuthFailure = true } = {}) {
    let token;
    try {
      token = await this.getToken();
    } catch (error) {
      const { errorClass, summary } = sanitizeError(error, { status: error.status });
      return { ok: false, status: error.status ?? null, data: null, errorClass, errorSummary: summary };
    }

    try {
      const result = await requestXcc(path, {
        authToken: `Bearer ${token}`,
        controllerUrl: this.#baseUrl,
        fetchFn: this.#fetchFn,
        timeoutMs: this.#timeoutMs,
        agent: httpsAgent(),
      });

      if (result.ok) {
        return { ok: true, status: result.status, data: result.data, errorClass: null, errorSummary: null };
      }

      if (result.status === 401 && retryOnAuthFailure) {
        this.invalidate();
        return this.get(path, { retryOnAuthFailure: false });
      }

      const { errorClass, summary } = sanitizeError(new Error(result.errorText ?? 'request failed'), {
        status: result.status,
        endpoint: path,
      });
      return { ok: false, status: result.status, data: null, errorClass, errorSummary: summary };
    } catch (error) {
      const { errorClass, summary } = sanitizeError(error, { endpoint: path });
      return { ok: false, status: null, data: null, errorClass, errorSummary: summary };
    }
  }

  /**
   * Write (POST/PUT/DELETE) to a controller path. Same envelope and 401
   * retry-once contract as `get()`. Used only by gated, audited flows (config
   * restore) — everything else in AURA reads the controller through `get()`.
   *
   * @returns {Promise<{ ok: boolean, status: number|null, data: any,
   *                     errorClass: string|null, errorSummary: string|null }>}
   */
  async write(path, { method = 'POST', body = null, retryOnAuthFailure = true } = {}) {
    let token;
    try {
      token = await this.getToken();
    } catch (error) {
      const { errorClass, summary } = sanitizeError(error, { status: error.status });
      return { ok: false, status: error.status ?? null, data: null, errorClass, errorSummary: summary };
    }

    try {
      const result = await requestXcc(path, {
        authToken: `Bearer ${token}`,
        controllerUrl: this.#baseUrl,
        fetchFn: this.#fetchFn,
        timeoutMs: this.#timeoutMs,
        agent: httpsAgent(),
        method,
        body,
      });

      if (result.ok) {
        return { ok: true, status: result.status, data: result.data, errorClass: null, errorSummary: null };
      }

      if (result.status === 401 && retryOnAuthFailure) {
        this.invalidate();
        return this.write(path, { method, body, retryOnAuthFailure: false });
      }

      const { errorClass, summary } = sanitizeError(new Error(result.errorText ?? 'request failed'), {
        status: result.status,
        endpoint: path,
      });
      return { ok: false, status: result.status, data: null, errorClass, errorSummary: summary };
    } catch (error) {
      const { errorClass, summary } = sanitizeError(error, { endpoint: path });
      return { ok: false, status: null, data: null, errorClass, errorSummary: summary };
    }
  }
}

/** Cache of sessions by source id, so tokens survive across polls in one process. */
const sessions = new Map();

export function getSession(sourceId, options) {
  const existing = sessions.get(sourceId);
  // Rebuild if the base URL or username changed under us.
  if (existing && existing.baseUrl === options.baseUrl?.replace(/\/+$/, '')) return existing;
  const session = new ControllerSession(options);
  sessions.set(sourceId, session);
  return session;
}

export function clearSessions() {
  sessions.clear();
}
