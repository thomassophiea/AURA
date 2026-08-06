/**
 * /api/monitoring/* — the read API for persisted monitoring history.
 *
 * Rules enforced here:
 *  - Every route is scoped by `requireControllerScope`; the authorized source
 *    set comes from the caller's validated token, never from query params.
 *  - Ranges are bounded and validated. A request outside retention is rejected,
 *    not silently clamped to something that looks complete.
 *  - Responses distinguish fresh / stale / offline / never-collected, and carry
 *    explicit gap metadata.
 *  - Errors are categorized; no stack traces, database errors, or controller
 *    bodies leave this module.
 */

import { Router, json as expressJson } from 'express';

import { loadMonitoringConfig } from './config.js';
import { createRequireControllerScope } from './requireControllerScope.js';
import { queryHistory, queryLatest, getEarliestObservedAt } from './sampleRepository.js';
import {
  listRecentRuns,
  upsertSource,
  setSourceCredentials,
  setSourceEnabled,
  hasSourceCredentials,
  getSourceById,
} from './sourceRepository.js';
import { buildSeries, classifyFreshness, aggregatePercentage } from './seriesBuilder.js';
import { sanitizeError, ERROR_CLASS_LABELS } from './errorSanitizer.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseList(value) {
  if (!value) return null;
  const list = String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * Resolve and validate the requested range.
 * @returns {{ start: Date, end: Date } | { error: string, detail: string }}
 */
export function resolveRange({ start, end, now, retentionDays }) {
  const resolvedEnd = parseDate(end) ?? now;
  const resolvedStart = parseDate(start) ?? new Date(resolvedEnd.getTime() - retentionDays * MS_PER_DAY);

  if (start && !parseDate(start)) {
    return { error: 'invalid_range', detail: '`start` is not a valid ISO-8601 timestamp.' };
  }
  if (end && !parseDate(end)) {
    return { error: 'invalid_range', detail: '`end` is not a valid ISO-8601 timestamp.' };
  }
  if (resolvedStart >= resolvedEnd) {
    return { error: 'invalid_range', detail: '`start` must be before `end`.' };
  }

  const spanDays = (resolvedEnd.getTime() - resolvedStart.getTime()) / MS_PER_DAY;
  if (spanDays > retentionDays) {
    return {
      error: 'range_too_large',
      detail: `Requested ${spanDays.toFixed(1)} days but only ${retentionDays} days are retained.`,
    };
  }

  const oldestRetained = new Date(now.getTime() - retentionDays * MS_PER_DAY);
  if (resolvedStart < oldestRetained) {
    return {
      error: 'range_outside_retention',
      detail: `Data before ${oldestRetained.toISOString()} is no longer retained. Requesting it would return a misleadingly empty result.`,
    };
  }

  return { start: resolvedStart, end: resolvedEnd };
}

/** Aggregate source health for a scope. Never exposes credentials or raw errors. */
export function summarizeSourceHealth(sources, { now, staleAfterSeconds }) {
  return sources.map((source) => {
    const failing = (source.consecutiveFailures ?? 0) > 0;
    const lastSuccessAgeSeconds = source.lastSuccessAt
      ? Math.round((now.getTime() - new Date(source.lastSuccessAt).getTime()) / 1000)
      : null;

    let state = 'unknown';
    if (!source.lastSuccessAt) state = failing ? 'offline' : 'never_collected';
    else if (failing && lastSuccessAgeSeconds > staleAfterSeconds) state = 'offline';
    else if (lastSuccessAgeSeconds > staleAfterSeconds) state = 'stale';
    else state = 'fresh';

    return {
      sourceId: source.id,
      displayName: source.displayName,
      orgId: source.orgId,
      siteGroupId: source.siteGroupId,
      enabled: source.enabled,
      state,
      lastAttemptAt: source.lastAttemptAt?.toISOString?.() ?? source.lastAttemptAt ?? null,
      lastSuccessAt: source.lastSuccessAt?.toISOString?.() ?? source.lastSuccessAt ?? null,
      lastFailureAt: source.lastFailureAt?.toISOString?.() ?? source.lastFailureAt ?? null,
      lastSuccessAgeSeconds,
      consecutiveFailures: source.consecutiveFailures ?? 0,
      errorClass: source.lastErrorCode ?? null,
      errorLabel: source.lastErrorCode ? ERROR_CLASS_LABELS[source.lastErrorCode] ?? null : null,
      // History always comes from PostgreSQL. Saying so keeps the UI honest
      // about what "live" means.
      servingFrom: 'database',
      backfillSupported: Boolean(source.capabilities?.durations),
    };
  });
}

export function createMonitoringRouter(options = {}) {
  const {
    config = loadMonitoringConfig(),
    scopeMiddleware = createRequireControllerScope(),
    queryHistoryFn = queryHistory,
    queryLatestFn = queryLatest,
    getEarliestObservedAtFn = getEarliestObservedAt,
    listRecentRunsFn = listRecentRuns,
    upsertSourceFn = upsertSource,
    setSourceCredentialsFn = setSourceCredentials,
    setSourceEnabledFn = setSourceEnabled,
    hasSourceCredentialsFn = hasSourceCredentials,
    getSourceByIdFn = getSourceById,
    nowFn = () => new Date(),
  } = options;

  const router = Router();
  const jsonBody = expressJson({ limit: '32kb' });

  router.use('/monitoring', scopeMiddleware);

  function fail(res, error, status = 500) {
    const { errorClass } = sanitizeError(error);
    return res.status(status).json({
      error: ERROR_CLASS_LABELS[errorClass] ?? 'Request failed',
      errorClass,
    });
  }

  // ---- History -----------------------------------------------------------
  router.get('/monitoring/history', async (req, res) => {
    const now = nowFn();
    const range = resolveRange({
      start: req.query.start,
      end: req.query.end,
      now,
      retentionDays: config.retentionDays,
    });
    if (range.error) {
      return res.status(400).json({
        error: range.error,
        detail: range.detail,
        retentionDays: config.retentionDays,
      });
    }

    try {
      const { points, truncated } = await queryHistoryFn({
        sourceIds: req.monitoringScope.sourceIds,
        start: range.start,
        end: range.end,
        siteId: req.query.siteId || null,
        deviceExternalId: req.query.deviceId || null,
        radioExternalId: req.query.radioId || null,
        wlanExternalId: req.query.wlanId || null,
        metricFamily: req.query.metricFamily || null,
        metricNames: parseList(req.query.metricName),
        maxPoints: config.maxQueryPoints,
      });

      const earliest = await getEarliestObservedAtFn(req.monitoringScope.sourceIds);
      const series = buildSeries(points, {
        expectedIntervalSeconds: Number(req.query.resolution) * 60 || null,
      });

      return res.json({
        series,
        meta: {
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          retentionDays: config.retentionDays,
          truncated,
          maxPoints: config.maxQueryPoints,
          pointCount: points.length,
          // Distinguishes "no data in this window" from "nothing has ever been
          // collected", which the UI renders very differently.
          earliestAvailable: earliest ? new Date(earliest).toISOString() : null,
          neverCollected: earliest === null,
          servingFrom: 'database',
          sources: summarizeSourceHealth(req.monitoringScope.sources, {
            now,
            staleAfterSeconds: config.staleAfterSeconds,
          }),
        },
      });
    } catch (error) {
      return fail(res, error, 503);
    }
  });

  // ---- Latest state ------------------------------------------------------
  router.get('/monitoring/latest', async (req, res) => {
    const now = nowFn();
    try {
      const rows = await queryLatestFn({
        sourceIds: req.monitoringScope.sourceIds,
        siteId: req.query.siteId || null,
        deviceExternalId: req.query.deviceId || null,
        metricFamily: req.query.metricFamily || null,
        metricNames: parseList(req.query.metricName),
      });

      const sourceById = new Map(req.monitoringScope.sources.map((s) => [s.id, s]));

      const metrics = rows.map((row) => {
        const source = sourceById.get(row.monitoredSourceId);
        return {
          sourceId: row.monitoredSourceId,
          siteId: row.siteId,
          deviceExternalId: row.deviceExternalId,
          metricFamily: row.metricFamily,
          metricName: row.metricName,
          dimensions: row.dimensions,
          value: row.numericValue,
          numerator: row.numerator,
          denominator: row.denominator,
          unit: row.unit,
          metricKind: row.metricKind,
          qualityState: row.qualityState,
          observedAt: new Date(row.observedAt).toISOString(),
          collectedAt: new Date(row.collectedAt).toISOString(),
          lastSuccessfulContactAt: source?.lastSuccessAt
            ? new Date(source.lastSuccessAt).toISOString()
            : null,
          dataAgeSeconds: Math.round((now.getTime() - new Date(row.observedAt).getTime()) / 1000),
          state: classifyFreshness({
            observedAt: row.observedAt,
            lastSuccessAt: source?.lastSuccessAt,
            consecutiveFailures: source?.consecutiveFailures,
            now,
            staleAfterSeconds: config.staleAfterSeconds,
          }),
        };
      });

      return res.json({
        metrics,
        meta: {
          staleAfterSeconds: config.staleAfterSeconds,
          servingFrom: 'database',
          neverCollected: metrics.length === 0,
          sources: summarizeSourceHealth(req.monitoringScope.sources, {
            now,
            staleAfterSeconds: config.staleAfterSeconds,
          }),
        },
      });
    } catch (error) {
      return fail(res, error, 503);
    }
  });

  // ---- Source health -----------------------------------------------------
  router.get('/monitoring/sources/health', async (req, res) => {
    const now = nowFn();
    try {
      const sources = summarizeSourceHealth(req.monitoringScope.sources, {
        now,
        staleAfterSeconds: config.staleAfterSeconds,
      });

      const withRuns = await Promise.all(
        sources.map(async (source) => ({
          ...source,
          recentRuns: (await listRecentRunsFn(source.sourceId, 5)).map((run) => ({
            collectorName: run.collectorName,
            startedAt: run.startedAt?.toISOString?.() ?? run.startedAt,
            completedAt: run.completedAt?.toISOString?.() ?? run.completedAt,
            status: run.status,
            recordsInserted: run.recordsInserted,
            recordsUpdated: run.recordsUpdated,
            durationMs: run.durationMs,
            errorClass: run.errorClass,
          })),
        }))
      );

      return res.json({
        sources: withRuns,
        meta: {
          collectorEnabled: config.collectorEnabled,
          pollIntervalSeconds: config.pollIntervalSeconds,
          retentionDays: config.retentionDays,
          staleAfterSeconds: config.staleAfterSeconds,
        },
      });
    } catch (error) {
      return fail(res, error, 503);
    }
  });

  // ---- Aggregate (weighted, from numerator/denominator) ------------------
  router.get('/monitoring/aggregate', async (req, res) => {
    const now = nowFn();
    const range = resolveRange({
      start: req.query.start,
      end: req.query.end,
      now,
      retentionDays: config.retentionDays,
    });
    if (range.error) {
      return res.status(400).json({ error: range.error, detail: range.detail });
    }
    if (!req.query.metricName) {
      return res.status(400).json({ error: 'invalid_request', detail: '`metricName` is required.' });
    }

    try {
      const { points } = await queryHistoryFn({
        sourceIds: req.monitoringScope.sourceIds,
        start: range.start,
        end: range.end,
        siteId: req.query.siteId || null,
        metricFamily: req.query.metricFamily || null,
        metricNames: parseList(req.query.metricName),
        maxPoints: config.maxQueryPoints,
      });

      const aggregate = aggregatePercentage(points);
      return res.json({
        aggregate,
        meta: {
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          pointCount: points.length,
          // Explicit rather than implied: no aggregate is offered when the
          // parts needed to compute one correctly were not stored.
          unavailableReason:
            aggregate === null
              ? 'No numerator/denominator pairs in range; a weighted percentage cannot be computed.'
              : null,
        },
      });
    } catch (error) {
      return fail(res, error, 503);
    }
  });

  // ---- Source administration --------------------------------------------
  router.post('/monitoring/sources', jsonBody, async (req, res) => {
    const { baseUrl, displayName, orgId, siteGroupId, sourceType, username, password } =
      req.body ?? {};
    if (!baseUrl) {
      return res.status(400).json({ error: 'invalid_request', detail: '`baseUrl` is required.' });
    }
    if (password && !config.credentialKey) {
      return res.status(400).json({
        error: 'not_configured',
        detail: 'MONITORING_CREDENTIAL_KEY must be set before credentials can be stored.',
      });
    }

    try {
      const source = await upsertSourceFn({
        baseUrl,
        displayName,
        orgId,
        siteGroupId,
        sourceType,
      });
      if (username || password) {
        await setSourceCredentialsFn(source.id, { username, password }, config.credentialKey);
      }
      // Credentials are write-only: the response confirms presence, never value.
      const credentials = await hasSourceCredentialsFn(source.id);
      return res.status(201).json({
        source: {
          id: source.id,
          baseUrl: source.baseUrl,
          displayName: source.displayName,
          enabled: source.enabled,
        },
        credentials: { configured: credentials.configured, username: credentials.username },
      });
    } catch (error) {
      return fail(res, error, 500);
    }
  });

  router.put('/monitoring/sources/:id/enabled', jsonBody, async (req, res) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      return res
        .status(400)
        .json({ error: 'invalid_request', detail: '`enabled` must be a boolean.' });
    }
    // A caller may only touch sources inside their validated scope.
    if (!req.monitoringScope.sourceIds.includes(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      const source = await setSourceEnabledFn(req.params.id, enabled);
      // Disabling stops collection; it never deletes stored history.
      return res.json({
        source: { id: source.id, enabled: source.enabled },
        note: enabled
          ? 'Collection resumed.'
          : 'Collection paused. Stored history is retained and still readable.',
      });
    } catch (error) {
      return fail(res, error, 500);
    }
  });

  router.put('/monitoring/sources/:id/credentials', jsonBody, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!req.monitoringScope.sourceIds.includes(req.params.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (password && !config.credentialKey) {
      return res.status(400).json({
        error: 'not_configured',
        detail: 'MONITORING_CREDENTIAL_KEY must be set before credentials can be stored.',
      });
    }

    try {
      const source = await getSourceByIdFn(req.params.id);
      if (!source) return res.status(404).json({ error: 'Not found' });
      await setSourceCredentialsFn(source.id, { username, password }, config.credentialKey);
      const credentials = await hasSourceCredentialsFn(source.id);
      return res.json({
        credentials: { configured: credentials.configured, username: credentials.username },
      });
    } catch (error) {
      return fail(res, error, 500);
    }
  });

  return router;
}
