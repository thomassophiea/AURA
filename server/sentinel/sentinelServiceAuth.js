/**
 * Service-account auth for the Sentinel engine.
 *
 * Scheduled polls used to borrow whatever browser token last touched the API,
 * so background monitoring silently died when that token expired. When the
 * deployment carries durable controller credentials (the same env contract the
 * monitoring collector uses), Sentinel mints and refreshes its own token and
 * never depends on a browser session.
 *
 * Tokens live only in process memory (ControllerSession never persists them).
 */

import { ControllerSession } from '../monitoring/controllerClient.js';

let session = null;

function readCredentials(env) {
  return {
    username: env.MONITORING_CONTROLLER_USERNAME ?? env.CAMPUS_CONTROLLER_USER ?? null,
    password: env.MONITORING_CONTROLLER_PASSWORD ?? env.CAMPUS_CONTROLLER_PASSWORD ?? null,
  };
}

/**
 * The shared service session for a controller, or null when the deployment has
 * no service credentials (dev without env vars). The session is rebuilt if the
 * target controller changes.
 */
export function getServiceSession(controllerUrl, env = process.env) {
  const { username, password } = readCredentials(env);
  const baseUrl = controllerUrl ?? env.CAMPUS_CONTROLLER_URL ?? null;
  if (!username || !password || !baseUrl) return null;

  const normalized = baseUrl.replace(/\/+$/, '');
  if (!session || session.baseUrl !== normalized) {
    session = new ControllerSession({ baseUrl: normalized, username, password });
  }
  return session;
}

/** True when this deployment can authenticate on its own. */
export function hasServiceCredentials(env = process.env) {
  const { username, password } = readCredentials(env);
  return Boolean(username && password);
}

/** Test hook. */
export function resetServiceSession() {
  session = null;
}
