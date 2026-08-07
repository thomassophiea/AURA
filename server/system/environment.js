/**
 * Deployment environment identity.
 *
 * AURA runs the same image in two places — the Integration environment, which
 * tracks `main` and changes constantly, and the Production Demo environment,
 * which only moves when a build is deliberately promoted. Almost everything
 * about the two is identical, which is precisely the danger: a Production
 * worker pointed at the Integration database would look completely healthy
 * while quietly corrupting the data being demoed.
 *
 * So the environment name is a first-class, declared value rather than
 * something inferred from a hostname or a database URL. It is stamped into the
 * database (see `0003_environment_identity.sql`) and checked before any
 * destructive work (see `environmentGuard.js`).
 */

/** The only environments that exist. Anything else is a configuration error. */
export const ENVIRONMENTS = Object.freeze(['integration', 'production']);

const LABELS = Object.freeze({
  integration: 'Integration',
  production: 'Production Demo',
});

/** Short label for the UI chip. Kept tight — it sits in the header. */
const SHORT_LABELS = Object.freeze({
  integration: 'INTEGRATION',
  production: 'PROD DEMO',
});

/**
 * Variables each process role needs to do its job.
 *
 * Reported by `/api/v1/system/dependencies` as names-and-presence only, so a QA
 * app can diff two environments' configuration shape without ever seeing a
 * value. `required` missing is an error; `optional` missing is information.
 */
export const VARIABLE_MANIFEST = Object.freeze({
  web: {
    required: ['AURA_ENVIRONMENT', 'DATABASE_URL', 'CAMPUS_CONTROLLER_URL'],
    optional: [
      'CAMPUS_CONTROLLER_USER',
      'CAMPUS_CONTROLLER_PASSWORD',
      'CWP_INTERNAL_API_URL',
      'CWP_INTERNAL_API_TOKEN',
      'MONITORING_CREDENTIAL_KEY',
      'MONITORING_RETENTION_DAYS',
      'ALLOWED_ORIGINS',
    ],
  },
  collector: {
    required: ['AURA_ENVIRONMENT', 'DATABASE_URL', 'CAMPUS_CONTROLLER_URL', 'MONITORING_ROLE'],
    optional: [
      'CAMPUS_CONTROLLER_USER',
      'CAMPUS_CONTROLLER_PASSWORD',
      'MONITORING_CREDENTIAL_KEY',
      'MONITORING_POLL_INTERVAL_SECONDS',
      'MONITORING_MAX_CONCURRENCY',
    ],
  },
  cleanup: {
    required: ['AURA_ENVIRONMENT', 'DATABASE_URL', 'MONITORING_ROLE'],
    optional: ['MONITORING_RETENTION_DAYS', 'MONITORING_CLEANUP_BATCH_SIZE'],
  },
});

/**
 * Resolve the declared environment name.
 *
 * Deliberately defaults to `integration` rather than `production`. If the
 * variable is ever lost, the safe failure is a Production process refusing to
 * touch the Production database (the stamp will not match) — not an Integration
 * process cheerfully claiming to be Production.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'integration'|'production'}
 */
export function resolveEnvironmentName(env = process.env) {
  const raw = (env.AURA_ENVIRONMENT ?? '').trim().toLowerCase();
  if (!raw) return 'integration';
  if (!ENVIRONMENTS.includes(raw)) {
    throw new Error(
      `AURA_ENVIRONMENT must be one of ${ENVIRONMENTS.join(', ')}, received "${env.AURA_ENVIRONMENT}".`
    );
  }
  return raw;
}

/** Which of the three process roles this container is running. */
export function resolveProcessRole(env = process.env) {
  const raw = (env.MONITORING_ROLE ?? 'web').trim().toLowerCase();
  return ['web', 'collector', 'cleanup'].includes(raw) ? raw : 'web';
}

/**
 * Everything the system endpoints need to describe this deployment.
 *
 * `explicit` distinguishes "declared production" from "defaulted to
 * integration", which matters when diagnosing a service whose variable did not
 * get set.
 */
export function describeEnvironment(env = process.env) {
  const name = resolveEnvironmentName(env);
  return {
    environment: name,
    label: LABELS[name],
    shortLabel: SHORT_LABELS[name],
    role: resolveProcessRole(env),
    explicit: Boolean((env.AURA_ENVIRONMENT ?? '').trim()),
    isProduction: name === 'production',
  };
}

/**
 * Compare the manifest for a role against what is actually set.
 *
 * Returns names only. A value never leaves this function.
 */
export function describeVariables(env = process.env, role = resolveProcessRole(env)) {
  const manifest = VARIABLE_MANIFEST[role] ?? VARIABLE_MANIFEST.web;
  const isSet = (name) => {
    const value = env[name];
    return value !== undefined && String(value).trim() !== '';
  };
  const missingRequired = manifest.required.filter((name) => !isSet(name));
  return {
    role,
    required: manifest.required,
    optional: manifest.optional,
    present: [...manifest.required, ...manifest.optional].filter(isSet),
    missingRequired,
    missingOptional: manifest.optional.filter((name) => !isSet(name)),
    ok: missingRequired.length === 0,
  };
}
