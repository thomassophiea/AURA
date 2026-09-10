/**
 * A controller session scoped to ONE authenticated request, using that user's
 * own Gateway token.
 *
 * WHY NOT REUSE THE COLLECTOR'S SESSION
 * -------------------------------------
 * `ControllerSession` mints its own token from durable service credentials
 * because the collector runs when nobody is logged in. Handing that to Cortex
 * would give the assistant more access than the person talking to it: a
 * read-only operator could ask Cortex a question and have it answered with
 * admin-level reads.
 *
 * Cortex therefore borrows the caller's bearer token and nothing else. Every
 * Gateway read the agent performs is authorised as that user, so the Gateway's
 * own RBAC is the ceiling — Cortex cannot exceed it, and a 403 from the Gateway
 * is surfaced honestly rather than retried with stronger credentials.
 *
 * It exposes the same `get(path) -> {ok, status, data, errorSummary}` envelope
 * as ControllerSession, so GatewayEvidence and the diagnostic tools work
 * against either without knowing the difference.
 */

import { requestXcc } from '../validationEngine/xccClient.js';
import { sanitizeError } from '../monitoring/errorSanitizer.js';

export class RequestScopedSession {
  #baseUrl;
  #authToken;
  #timeoutMs;
  #fetchFn;

  /**
   * @param {object} opts
   * @param {string} opts.controllerUrl  Gateway base URL (no /management suffix)
   * @param {string} opts.authToken      the CALLER's bearer token, verbatim
   * @param {number} [opts.timeoutMs]
   */
  constructor({ controllerUrl, authToken, timeoutMs = 90_000, fetchFn = null }) {
    if (!controllerUrl) throw new Error('RequestScopedSession requires a controllerUrl');
    if (!authToken) throw new Error('RequestScopedSession requires the caller authToken');
    this.#baseUrl = String(controllerUrl).replace(/\/+$/, '');
    // Accept either "Bearer x" or a bare token; the Gateway wants the header form.
    this.#authToken = /^bearer\s/i.test(authToken) ? authToken : `Bearer ${authToken}`;
    this.#timeoutMs = timeoutMs;
    this.#fetchFn = fetchFn;
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  /**
   * GET a Gateway path as the calling user.
   *
   * There is deliberately NO re-auth-and-retry here. ControllerSession can
   * re-mint from stored credentials; this session cannot and must not — if the
   * user's token has expired, the honest answer is 401, not a privilege
   * escalation to service credentials.
   */
  async get(path) {
    try {
      const result = await requestXcc(path, {
        authToken: this.#authToken,
        controllerUrl: this.#baseUrl,
        fetchFn: this.#fetchFn,
        timeoutMs: this.#timeoutMs,
      });

      if (result.ok) {
        return { ok: true, status: result.status, data: result.data, errorSummary: null };
      }

      // 401/403 are reported as-is. A tool turning "you are not permitted to
      // read this" into an empty result would let the model conclude the
      // network is healthy when it simply could not look.
      const { summary } = sanitizeError(new Error(result.errorText ?? 'request failed'), {
        status: result.status,
        endpoint: path,
      });
      return {
        ok: false,
        status: result.status,
        data: null,
        errorSummary:
          result.status === 401
            ? 'Your Gateway session has expired — sign in again.'
            : result.status === 403
              ? 'Your account is not permitted to read this from the Gateway.'
              : summary,
      };
    } catch (error) {
      const { summary } = sanitizeError(error, { endpoint: path });
      return { ok: false, status: null, data: null, errorSummary: summary };
    }
  }
}

/**
 * Build a session from an Express request, or explain why one cannot be built.
 *
 * @returns {{ok: true, session: RequestScopedSession, controllerUrl: string}
 *          |{ok: false, status: number, error: string}}
 */
export function sessionFromRequest(req, { defaultControllerUrl = '' } = {}) {
  const controllerUrl = req.headers['x-controller-url'] || defaultControllerUrl;
  const authToken = req.headers['x-controller-auth'] || req.headers['authorization'];

  if (!controllerUrl) {
    return {
      ok: false,
      status: 400,
      error:
        'No Gateway is selected for this request. Choose a Site Group so Cortex knows which Gateway to read.',
    };
  }
  if (!authToken) {
    return {
      ok: false,
      status: 401,
      error: 'No Gateway credentials on this request. Cortex reads the Gateway as you, so it needs your session.',
    };
  }
  return {
    ok: true,
    controllerUrl,
    session: new RequestScopedSession({ controllerUrl, authToken }),
  };
}
