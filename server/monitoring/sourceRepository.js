/**
 * Persistence for monitored sources (controllers / gateways), their health, and
 * their credentials.
 *
 * Credentials live in a separate table and are only ever read by the collector.
 * Nothing in this module returns a decrypted secret to an HTTP handler.
 */

import { query, withTransaction } from '../db/pool.js';
import { encryptSecret, decryptSecret } from './credentialCrypto.js';

const SOURCE_COLUMNS = `
  id, org_id, site_group_id, source_type, source_external_id, display_name,
  base_url, enabled, capabilities, last_attempt_at, last_success_at,
  last_failure_at, consecutive_failures, last_error_code, last_error_summary,
  created_at, updated_at
`;

function mapSource(row) {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    siteGroupId: row.site_group_id,
    sourceType: row.source_type,
    sourceExternalId: row.source_external_id,
    displayName: row.display_name,
    baseUrl: row.base_url,
    enabled: row.enabled,
    capabilities: row.capabilities ?? {},
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    consecutiveFailures: row.consecutive_failures,
    lastErrorCode: row.last_error_code,
    lastErrorSummary: row.last_error_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Normalize a controller URL for identity: no trailing slash, no /management suffix. */
export function normalizeBaseUrl(raw) {
  if (!raw) return null;
  let url = String(raw).trim().replace(/\/+$/, '');
  url = url.replace(/\/(api\/management|management|api)$/i, '');
  return url;
}

export async function listSources({ enabledOnly = false } = {}) {
  const { rows } = await query(
    `SELECT ${SOURCE_COLUMNS} FROM monitored_sources
     ${enabledOnly ? 'WHERE enabled = true' : ''}
     ORDER BY created_at ASC`
  );
  return rows.map(mapSource);
}

export async function getSourceById(id) {
  const { rows } = await query(`SELECT ${SOURCE_COLUMNS} FROM monitored_sources WHERE id = $1`, [
    id,
  ]);
  return mapSource(rows[0]);
}

export async function getSourceByBaseUrl(baseUrl) {
  const { rows } = await query(
    `SELECT ${SOURCE_COLUMNS} FROM monitored_sources WHERE base_url = $1`,
    [normalizeBaseUrl(baseUrl)]
  );
  return mapSource(rows[0]);
}

/**
 * Create or update a source, keyed on its normalized base URL. Idempotent so a
 * redeploy that re-seeds the default controller does not duplicate it.
 */
export async function upsertSource(input) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (!baseUrl) throw new Error('baseUrl is required to register a monitored source.');

  const { rows } = await query(
    `INSERT INTO monitored_sources
       (org_id, site_group_id, source_type, source_external_id, display_name, base_url, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (base_url) DO UPDATE SET
       org_id             = COALESCE(EXCLUDED.org_id, monitored_sources.org_id),
       site_group_id      = COALESCE(EXCLUDED.site_group_id, monitored_sources.site_group_id),
       source_type        = EXCLUDED.source_type,
       source_external_id = COALESCE(EXCLUDED.source_external_id, monitored_sources.source_external_id),
       display_name       = COALESCE(EXCLUDED.display_name, monitored_sources.display_name),
       enabled            = EXCLUDED.enabled,
       updated_at         = now()
     RETURNING ${SOURCE_COLUMNS}`,
    [
      input.orgId ?? null,
      input.siteGroupId ?? null,
      input.sourceType ?? 'controller',
      input.sourceExternalId ?? null,
      input.displayName ?? null,
      baseUrl,
      input.enabled ?? true,
    ]
  );
  return mapSource(rows[0]);
}

/** Enable/disable collection without deleting any stored history. */
export async function setSourceEnabled(id, enabled) {
  const { rows } = await query(
    `UPDATE monitored_sources SET enabled = $2, updated_at = now()
     WHERE id = $1 RETURNING ${SOURCE_COLUMNS}`,
    [id, enabled]
  );
  return mapSource(rows[0]);
}

/** Merge probed capabilities (e.g. which `duration` values the source accepts). */
export async function mergeCapabilities(id, capabilities) {
  const { rows } = await query(
    `UPDATE monitored_sources
     SET capabilities = capabilities || $2::jsonb, updated_at = now()
     WHERE id = $1 RETURNING ${SOURCE_COLUMNS}`,
    [id, JSON.stringify(capabilities)]
  );
  return mapSource(rows[0]);
}

export async function recordAttempt(id, attemptedAt = new Date()) {
  await query(
    `UPDATE monitored_sources SET last_attempt_at = $2, updated_at = now() WHERE id = $1`,
    [id, attemptedAt]
  );
}

export async function recordSuccess(id, succeededAt = new Date()) {
  await query(
    `UPDATE monitored_sources
     SET last_success_at = $2, consecutive_failures = 0,
         last_error_code = NULL, last_error_summary = NULL, updated_at = now()
     WHERE id = $1`,
    [id, succeededAt]
  );
}

/**
 * Record a failure. `summary` must already be sanitized — see sanitizeError in
 * errorSanitizer.js. Never pass a raw controller response or a URL with a query
 * string here.
 */
export async function recordFailure(id, { errorCode, summary, failedAt = new Date() }) {
  await query(
    `UPDATE monitored_sources
     SET last_failure_at = $2,
         consecutive_failures = consecutive_failures + 1,
         last_error_code = $3, last_error_summary = $4, updated_at = now()
     WHERE id = $1`,
    [id, failedAt, errorCode ?? 'unknown', summary ?? null]
  );
}

// --------------------------------------------------------------------------
// Credentials
// --------------------------------------------------------------------------

/** Write-only from the API's perspective: stored encrypted, never returned. */
export async function setSourceCredentials(sourceId, { username, password }, keyMaterial) {
  return withTransaction(async (client) => {
    if (password === undefined || password === null || password === '') {
      // Username-only update; leaves any existing secret untouched.
      await client.query(
        `INSERT INTO monitored_source_credentials (monitored_source_id, username)
         VALUES ($1, $2)
         ON CONFLICT (monitored_source_id) DO UPDATE
           SET username = EXCLUDED.username, updated_at = now()`,
        [sourceId, username ?? null]
      );
      return;
    }

    const { ciphertext, nonce, authTag } = encryptSecret(password, keyMaterial);
    await client.query(
      `INSERT INTO monitored_source_credentials
         (monitored_source_id, username, secret_ciphertext, secret_nonce, secret_auth_tag)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (monitored_source_id) DO UPDATE SET
         username          = EXCLUDED.username,
         secret_ciphertext = EXCLUDED.secret_ciphertext,
         secret_nonce      = EXCLUDED.secret_nonce,
         secret_auth_tag   = EXCLUDED.secret_auth_tag,
         updated_at        = now()`,
      [sourceId, username ?? null, ciphertext, nonce, authTag]
    );
  });
}

/**
 * Collector-only. Returns the decrypted credential for a source, or null when
 * none is stored. Must never be reached from an HTTP response path.
 */
export async function getSourceCredentials(sourceId, keyMaterial) {
  const { rows } = await query(
    `SELECT username, secret_ciphertext, secret_nonce, secret_auth_tag
     FROM monitored_source_credentials WHERE monitored_source_id = $1`,
    [sourceId]
  );
  const row = rows[0];
  if (!row) return null;
  if (!row.secret_ciphertext) return { username: row.username, password: null };

  const password = decryptSecret(
    {
      ciphertext: row.secret_ciphertext,
      nonce: row.secret_nonce,
      authTag: row.secret_auth_tag,
    },
    keyMaterial
  );
  return { username: row.username, password };
}

/** Whether a credential exists, without decrypting or returning it. */
export async function hasSourceCredentials(sourceId) {
  const { rows } = await query(
    `SELECT (secret_ciphertext IS NOT NULL) AS has_secret, username
     FROM monitored_source_credentials WHERE monitored_source_id = $1`,
    [sourceId]
  );
  const row = rows[0];
  return { configured: Boolean(row?.has_secret), username: row?.username ?? null };
}

// --------------------------------------------------------------------------
// Collection runs
// --------------------------------------------------------------------------

export async function startRun({ sourceId, collectorName, requestedEndpoint = null }) {
  const { rows } = await query(
    `INSERT INTO collection_runs (monitored_source_id, collector_name, requested_endpoint, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING id, started_at`,
    [sourceId, collectorName, requestedEndpoint]
  );
  return { id: rows[0].id, startedAt: rows[0].started_at };
}

export async function finishRun(
  runId,
  {
    status,
    responseStatus = null,
    recordsReceived = 0,
    recordsInserted = 0,
    recordsUpdated = 0,
    durationMs = null,
    errorClass = null,
    sanitizedErrorMessage = null,
  }
) {
  await query(
    `UPDATE collection_runs SET
       completed_at = now(), status = $2, response_status = $3,
       records_received = $4, records_inserted = $5, records_updated = $6,
       duration_ms = $7, error_class = $8, sanitized_error_message = $9
     WHERE id = $1`,
    [
      runId,
      status,
      responseStatus,
      recordsReceived,
      recordsInserted,
      recordsUpdated,
      durationMs,
      errorClass,
      sanitizedErrorMessage,
    ]
  );
}

/** Record a run that never started because another instance held the lock. */
export async function recordSkippedRun({ sourceId, collectorName }) {
  await query(
    `INSERT INTO collection_runs (monitored_source_id, collector_name, status, completed_at)
     VALUES ($1, $2, 'skipped_due_to_lock', now())`,
    [sourceId, collectorName]
  );
}

export async function listRecentRuns(sourceId, limit = 20) {
  const { rows } = await query(
    `SELECT id, collector_name, started_at, completed_at, status, response_status,
            records_received, records_inserted, records_updated, duration_ms,
            error_class, sanitized_error_message
     FROM collection_runs
     WHERE monitored_source_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [sourceId, Math.min(Number(limit) || 20, 200)]
  );
  return rows.map((row) => ({
    id: row.id,
    collectorName: row.collector_name,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    responseStatus: row.response_status,
    recordsReceived: row.records_received,
    recordsInserted: row.records_inserted,
    recordsUpdated: row.records_updated,
    durationMs: row.duration_ms,
    errorClass: row.error_class,
    sanitizedErrorMessage: row.sanitized_error_message,
  }));
}

// --------------------------------------------------------------------------
// Cursors
// --------------------------------------------------------------------------

export async function getCursor(sourceId, metricFamily, scopeKey = '') {
  const { rows } = await query(
    `SELECT last_observed_at, last_success_at FROM collection_cursors
     WHERE monitored_source_id = $1 AND metric_family = $2 AND scope_key = $3`,
    [sourceId, metricFamily, scopeKey]
  );
  const row = rows[0];
  return row ? { lastObservedAt: row.last_observed_at, lastSuccessAt: row.last_success_at } : null;
}

/**
 * Advance a cursor. Never moves backwards: a late-arriving partial response
 * must not cause the next poll to re-request (and re-upsert) old windows.
 */
export async function advanceCursor(sourceId, metricFamily, scopeKey, lastObservedAt) {
  await query(
    `INSERT INTO collection_cursors
       (monitored_source_id, metric_family, scope_key, last_observed_at, last_success_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (monitored_source_id, metric_family, scope_key) DO UPDATE SET
       last_observed_at = GREATEST(
         COALESCE(collection_cursors.last_observed_at, EXCLUDED.last_observed_at),
         EXCLUDED.last_observed_at
       ),
       last_success_at = now(),
       updated_at = now()`,
    [sourceId, metricFamily, scopeKey, lastObservedAt]
  );
}
