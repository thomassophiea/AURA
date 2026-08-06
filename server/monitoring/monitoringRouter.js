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
import {
  queryHistory,
  queryLatest,
  getEarliestObservedAt,
  queryDailyCoverage,
} from './sampleRepository.js';
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

/**
 * Grace margin on the retention boundary.
 *
 * A client asking for "the last 7 days" computes `start` from its own clock,
 * then the server re-derives the boundary from its own clock a moment later.
 * Request latency and clock skew make the client's `start` marginally older than
 * the server's cutoff, so an exact-retention request — the default view — was
 * rejected every time. The margin absorbs that. It cannot hide missing data:
 * `earliestAvailable` and `effectiveStart` still report the real coverage.
 */
const RETENTION_BOUNDARY_TOLERANCE_MS = 10 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Accept an IANA timezone only if this runtime can actually resolve it.
 *
 * Validated here rather than trusted, because the value reaches an `AT TIME
 * ZONE` expression: an unknown zone would make PostgreSQL raise, turning a
 * typo in a browser's reported locale into a 503 for the whole selector.
 */
export function validateTimeZone(value, fallback = 'UTC') {
  if (!value || typeof value !== 'string') return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return null;
  }
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
 * How far past retention a request may reach before it is refused rather than
 * trimmed.
 *
 * A calendar day at the far edge of the window necessarily starts before the
 * retention boundary — "7 days ago" as a local date begins at that day's
 * midnight, which is up to 24 hours older than `now - 7d`. Refusing it would
 * make the oldest day in the retention window unselectable, so a request that
 * overshoots by no more than a day is clamped to the boundary and the clamp is
 * reported. A request for thirty days is still refused outright: trimming that
 * to seven would hand back a window three quarters empty and look like an
 * outage rather than a shortened range.
 */
const RETENTION_OVERSHOOT_ALLOWANCE_MS = MS_PER_DAY;

/**
 * Resolve and validate the requested range.
 *
 * On success returns the window to query plus what the caller originally asked
 * for, so a trimmed window is always reported as trimmed. Nothing here silently
 * substitutes a different range.
 *
 * @returns {{ start: Date, end: Date, requestedStart: Date, requestedEnd: Date,
 *             clampedToRetention: boolean, retentionStart: Date }
 *          | { error: string, detail: string }}
 */
export function resolveRange({ start, end, now, retentionDays }) {
  if (start && !parseDate(start)) {
    return { error: 'invalid_range', detail: '`start` is not a valid ISO-8601 timestamp.' };
  }
  if (end && !parseDate(end)) {
    return { error: 'invalid_range', detail: '`end` is not a valid ISO-8601 timestamp.' };
  }

  const resolvedEnd = parseDate(end) ?? now;
  const requestedStart =
    parseDate(start) ?? new Date(resolvedEnd.getTime() - retentionDays * MS_PER_DAY);

  if (requestedStart >= resolvedEnd) {
    return { error: 'invalid_range', detail: '`start` must be before `end`.' };
  }

  const retentionMs = retentionDays * MS_PER_DAY;
  const retentionStart = new Date(now.getTime() - retentionMs);

  // The whole window predates what is stored. Answering with an empty series
  // would read as "the network was idle then", so say why instead.
  if (resolvedEnd.getTime() < retentionStart.getTime() - RETENTION_BOUNDARY_TOLERANCE_MS) {
    return {
      error: 'range_outside_retention',
      detail: `Data before ${retentionStart.toISOString()} is no longer retained. Requesting it would return a misleadingly empty result.`,
    };
  }

  const span = resolvedEnd.getTime() - requestedStart.getTime();
  if (span > retentionMs + RETENTION_OVERSHOOT_ALLOWANCE_MS + RETENTION_BOUNDARY_TOLERANCE_MS) {
    return {
      error: 'range_too_large',
      detail: `Requested ${(span / MS_PER_DAY).toFixed(1)} days but only ${retentionDays} days are retained.`,
    };
  }

  // Partially retained: query what exists and report the trim. `clampedToRetention`
  // is what lets the UI label the window "partial" instead of implying the whole
  // day was covered.
  const clampedToRetention = requestedStart.getTime() < retentionStart.getTime();
  const resolvedStart = clampedToRetention ? retentionStart : requestedStart;

  return {
    start: resolvedStart,
    end: resolvedEnd,
    requestedStart,
    requestedEnd: resolvedEnd,
    clampedToRetention,
    retentionStart,
  };
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
    scopeMiddleware = createRequireControllerScope({
      graceMs: config.authGraceSeconds * 1000,
    }),
    queryHistoryFn = queryHistory,
    queryLatestFn = queryLatest,
    getEarliestObservedAtFn = getEarliestObservedAt,
    queryDailyCoverageFn = queryDailyCoverage,
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
      const { points, truncated, effectiveStart } = await queryHistoryFn({
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
          // What was asked for, next to what was served. A calendar day at the
          // retention edge is answered with the part that still exists, and the
          // difference is stated so the UI can label the day incomplete rather
          // than presenting a partial day as a whole one.
          requestedStart: range.requestedStart.toISOString(),
          clampedToRetention: range.clampedToRetention,
          retentionStart: range.retentionStart.toISOString(),
          retentionDays: config.retentionDays,
          truncated,
          // When truncated, the returned window starts later than requested.
          // Stated explicitly so the UI can label the chart as trimmed instead
          // of implying the whole range was covered.
          effectiveStart: effectiveStart ? new Date(effectiveStart).toISOString() : null,
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

  // ---- Day coverage ------------------------------------------------------
  /**
   * Which local calendar days inside the window hold data, and how complete
   * each one is. This is what lets the date selector disable days that were
   * never collected and flag days that are only partly there, instead of
   * offering every day and letting the user discover an empty chart.
   *
   * Calendar semantics stay on the client: it sends explicit `start`/`end`
   * bounds it computed in its own timezone, and `timeZone` only names the zone
   * the grouping key is expressed in. Re-deriving local midnights here for an
   * arbitrary IANA zone would duplicate that logic in a second place, where it
   * could disagree with the labels the user is reading.
   */
  router.get('/monitoring/coverage', async (req, res) => {
    const now = nowFn();
    const timeZone = validateTimeZone(req.query.timeZone);
    if (timeZone === null) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: '`timeZone` must be an IANA timezone name, e.g. "America/New_York".',
      });
    }

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
      const [days, earliest] = await Promise.all([
        queryDailyCoverageFn({
          sourceIds: req.monitoringScope.sourceIds,
          start: range.start,
          end: range.end,
          timeZone,
          siteId: req.query.siteId || null,
          metricFamily: req.query.metricFamily || null,
          metricNames: parseList(req.query.metricName),
        }),
        getEarliestObservedAtFn(req.monitoringScope.sourceIds),
      ]);

      return res.json({
        days: days.map((day) => ({
          localDate: day.localDate,
          sampleCount: day.sampleCount,
          firstObservedAt: new Date(day.firstObservedAt).toISOString(),
          lastObservedAt: new Date(day.lastObservedAt).toISOString(),
          hoursPresent: day.hoursPresent,
        })),
        meta: {
          timeZone,
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          requestedStart: range.requestedStart.toISOString(),
          clampedToRetention: range.clampedToRetention,
          // The hard floor for selectable time. Days before this are gone, and
          // a day straddling it is only partly available.
          retentionStart: range.retentionStart.toISOString(),
          retentionDays: config.retentionDays,
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
          requestedStart: range.requestedStart.toISOString(),
          clampedToRetention: range.clampedToRetention,
          retentionStart: range.retentionStart.toISOString(),
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
