/**
 * Typed, validated configuration for monitoring persistence.
 *
 * The repository has no existing env-validation layer — server.js reads
 * process.env inline — so this adds one, scoped to the monitoring subsystem.
 * Invalid values throw at boot rather than silently degrading, because a
 * mistyped retention or interval would quietly corrupt the history this whole
 * feature exists to protect.
 */

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 90;

function readInt(env, name, fallback, { min, max } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer, received "${raw}".`);
  }
  if (min !== undefined && value < min) {
    throw new Error(`${name} must be >= ${min}, received ${value}.`);
  }
  if (max !== undefined && value > max) {
    throw new Error(`${name} must be <= ${max}, received ${value}.`);
  }
  return value;
}

function readBool(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean ("true"/"false"), received "${raw}".`);
}

function readString(env, name, fallback = null) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw);
}

/**
 * Build the monitoring config from an environment object.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Readonly<object>}
 */
export function loadMonitoringConfig(env = process.env) {
  const config = {
    databaseUrl: readString(env, 'DATABASE_URL'),
    isProduction: readString(env, 'NODE_ENV') === 'production',

    retentionDays: readInt(env, 'MONITORING_RETENTION_DAYS', 7, {
      min: MIN_RETENTION_DAYS,
      max: MAX_RETENTION_DAYS,
    }),
    pollIntervalSeconds: readInt(env, 'MONITORING_POLL_INTERVAL_SECONDS', 300, {
      min: 30,
      max: 86_400,
    }),
    requestTimeoutSeconds: readInt(env, 'MONITORING_REQUEST_TIMEOUT_SECONDS', 15, {
      min: 1,
      max: 300,
    }),
    maxConcurrency: readInt(env, 'MONITORING_MAX_CONCURRENCY', 4, { min: 1, max: 64 }),
    failureBackoffSeconds: readInt(env, 'MONITORING_FAILURE_BACKOFF_SECONDS', 60, {
      min: 5,
      max: 3600,
    }),
    // Ceiling for the exponential backoff, so a long outage still retries hourly.
    maxBackoffSeconds: readInt(env, 'MONITORING_MAX_BACKOFF_SECONDS', 1800, {
      min: 30,
      max: 86_400,
    }),
    staleAfterSeconds: readInt(env, 'MONITORING_STALE_AFTER_SECONDS', 900, {
      min: 30,
      max: 86_400,
    }),

    collectorEnabled: readBool(env, 'MONITORING_COLLECTOR_ENABLED', true),
    cleanupEnabled: readBool(env, 'MONITORING_CLEANUP_ENABLED', true),
    collectorInProcess: readBool(env, 'MONITORING_COLLECTOR_IN_PROCESS', false),
    // AP-level report collection is the volume driver; opt-in.
    apReportsEnabled: readBool(env, 'MONITORING_AP_REPORTS_ENABLED', false),
    persistClientIdentifiers: readBool(env, 'MONITORING_PERSIST_CLIENT_IDENTIFIERS', false),

    credentialKey: readString(env, 'MONITORING_CREDENTIAL_KEY'),
    clientPseudonymSalt: readString(env, 'MONITORING_CLIENT_PSEUDONYM_SALT'),

    // Seed credentials for the default controller from CAMPUS_CONTROLLER_URL.
    // CAMPUS_CONTROLLER_USER / _PASSWORD are accepted as aliases because that
    // is the name pair already in use in this project's deployment.
    defaultControllerUrl: readString(env, 'CAMPUS_CONTROLLER_URL'),
    defaultControllerUsername:
      readString(env, 'MONITORING_CONTROLLER_USERNAME') ??
      readString(env, 'CAMPUS_CONTROLLER_USER'),
    defaultControllerPassword:
      readString(env, 'MONITORING_CONTROLLER_PASSWORD') ??
      readString(env, 'CAMPUS_CONTROLLER_PASSWORD'),

    // Read-side guard rails.
    // Headroom matters: a 7-day range at 15-minute buckets is 672 points per
    // series, so seven SLE metrics alone reach ~4.7k. A 5k cap would truncate
    // the default view.
    maxQueryPoints: readInt(env, 'MONITORING_MAX_QUERY_POINTS', 20_000, {
      min: 100,
      max: 200_000,
    }),
    cleanupBatchSize: readInt(env, 'MONITORING_CLEANUP_BATCH_SIZE', 10_000, {
      min: 100,
      max: 200_000,
    }),
  };

  if (config.persistClientIdentifiers && !config.clientPseudonymSalt) {
    throw new Error(
      'MONITORING_PERSIST_CLIENT_IDENTIFIERS is enabled but MONITORING_CLIENT_PSEUDONYM_SALT is not set. ' +
        'Client identifiers must be pseudonymized before they are persisted.'
    );
  }

  if (config.maxBackoffSeconds < config.failureBackoffSeconds) {
    throw new Error(
      'MONITORING_MAX_BACKOFF_SECONDS must be >= MONITORING_FAILURE_BACKOFF_SECONDS.'
    );
  }

  return Object.freeze(config);
}

/**
 * Assert the configuration is viable for a process that persists data.
 * Called by worker.js and by server.js when the in-process collector is on.
 */
export function assertPersistenceReady(config) {
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for monitoring persistence. ' +
        'Attach a Railway PostgreSQL service and expose DATABASE_URL to this service.'
    );
  }
  return true;
}

/** Redacted view, safe to log. */
export function describeMonitoringConfig(config) {
  return {
    retentionDays: config.retentionDays,
    pollIntervalSeconds: config.pollIntervalSeconds,
    requestTimeoutSeconds: config.requestTimeoutSeconds,
    maxConcurrency: config.maxConcurrency,
    staleAfterSeconds: config.staleAfterSeconds,
    collectorEnabled: config.collectorEnabled,
    collectorInProcess: config.collectorInProcess,
    cleanupEnabled: config.cleanupEnabled,
    apReportsEnabled: config.apReportsEnabled,
    persistClientIdentifiers: config.persistClientIdentifiers,
    databaseConfigured: Boolean(config.databaseUrl),
    credentialKeyConfigured: Boolean(config.credentialKey),
    defaultControllerCredentialsConfigured: Boolean(
      config.defaultControllerUsername && config.defaultControllerPassword
    ),
  };
}
