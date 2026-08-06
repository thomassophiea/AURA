/**
 * One-time-ish setup shared by the worker and the web service.
 *
 * Registers the controller named by CAMPUS_CONTROLLER_URL as a monitored source
 * so a fresh deployment starts collecting without a manual API call. Idempotent
 * — `upsertSource` keys on the normalized base URL.
 *
 * Credentials are NOT written to the database here. The env service account is
 * read at poll time instead, so a deployment that only sets env vars never
 * copies a secret into storage it did not ask for.
 */

import { upsertSource, normalizeBaseUrl } from './sourceRepository.js';

/**
 * @param {ReturnType<import('./config.js').loadMonitoringConfig>} config
 * @returns {Promise<object|null>} The seeded source, or null when nothing to seed.
 */
export async function seedDefaultSource(config, { upsertSourceFn = upsertSource } = {}) {
  const baseUrl = normalizeBaseUrl(config.defaultControllerUrl);
  if (!baseUrl) return null;

  return upsertSourceFn({
    baseUrl,
    displayName: 'Default controller (CAMPUS_CONTROLLER_URL)',
    sourceType: 'controller',
    enabled: true,
  });
}

/**
 * Warn about a configuration that will collect nothing, so the failure shows up
 * at boot rather than as a silently empty chart later.
 */
export function describeReadiness(config) {
  const problems = [];
  if (!config.databaseUrl) problems.push('DATABASE_URL is not set; nothing can be persisted.');
  if (!config.defaultControllerUrl) {
    problems.push(
      'CAMPUS_CONTROLLER_URL is not set; no source will be seeded automatically. Register one via POST /api/monitoring/sources.'
    );
  }
  if (!config.defaultControllerUsername || !config.defaultControllerPassword) {
    problems.push(
      'No collector credentials configured (MONITORING_CONTROLLER_USERNAME/_PASSWORD or CAMPUS_CONTROLLER_USER/_PASSWORD). The collector cannot authenticate.'
    );
  }
  if (!config.credentialKey) {
    problems.push(
      'MONITORING_CREDENTIAL_KEY is not set; per-source credentials cannot be stored via the API.'
    );
  }
  return problems;
}
