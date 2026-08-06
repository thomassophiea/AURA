/**
 * Client for AURA's persisted monitoring history (`/api/monitoring/*`).
 *
 * The browser reads history from here; it does not maintain it. Authentication
 * reuses the controller token `apiService` already holds, and the same
 * `X-Controller-URL` header the proxy uses, so the backend can scope the
 * response to the controller the user is actually working with.
 */

import { apiService, getDynamicControllerUrl } from './api';
import type {
  CoverageResponse,
  HistoryResponse,
  LatestResponse,
  SourceHealthResponse,
  MonitoringApiError,
} from '../types/monitoring';
import { MonitoringRequestError } from '../types/monitoring';
import { localTimeZone, resolveTimeRange } from '../lib/timeRange';

const BASE = '/api/monitoring';

/**
 * Auth headers for AURA's own persistence API.
 *
 * Exported because `/api/throughput/*` reads and writes the same store behind
 * the same `requireControllerScope` middleware and needs identical headers.
 * Duplicating this was how the throughput endpoints ended up unauthenticated.
 */
export function buildMonitoringHeaders(): Record<string, string> {
  return buildHeaders();
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = apiService.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { headers: buildHeaders(), signal });

  if (!response.ok) {
    let body: MonitoringApiError = { error: `HTTP ${response.status}` };
    try {
      body = (await response.json()) as MonitoringApiError;
    } catch {
      /* non-JSON error body; keep the status-only shape */
    }
    throw new MonitoringRequestError(response.status, body);
  }

  return (await response.json()) as T;
}

export interface HistoryQuery {
  /** UTC ISO-8601. Defaults server-side to the full retention window. */
  start?: string;
  end?: string;
  siteId?: string;
  deviceId?: string;
  radioId?: string;
  wlanId?: string;
  metricFamily?: string;
  /** Comma-joined server-side; pass an array here. */
  metricNames?: string[];
  /** Bucket size in minutes, used for gap detection. */
  resolutionMinutes?: number;
}

export const monitoringHistory = {
  /** Bounded historical query. Throws MonitoringRequestError for rejected ranges. */
  async getHistory(query: HistoryQuery = {}, signal?: AbortSignal): Promise<HistoryResponse> {
    const path = `/history${buildQuery({
      start: query.start,
      end: query.end,
      siteId: query.siteId,
      deviceId: query.deviceId,
      radioId: query.radioId,
      wlanId: query.wlanId,
      metricFamily: query.metricFamily,
      metricName: query.metricNames?.join(','),
      resolution: query.resolutionMinutes,
    })}`;
    return request<HistoryResponse>(path, signal);
  },

  /** Latest stored value per series, with freshness metadata. */
  async getLatest(
    query: Pick<HistoryQuery, 'siteId' | 'deviceId' | 'metricFamily' | 'metricNames'> = {},
    signal?: AbortSignal
  ): Promise<LatestResponse> {
    const path = `/latest${buildQuery({
      siteId: query.siteId,
      deviceId: query.deviceId,
      metricFamily: query.metricFamily,
      metricName: query.metricNames?.join(','),
    })}`;
    return request<LatestResponse>(path, signal);
  },

  /** Collector health for the sources the caller can see. */
  async getSourceHealth(signal?: AbortSignal): Promise<SourceHealthResponse> {
    return request<SourceHealthResponse>('/sources/health', signal);
  },

  /**
   * Which local calendar days hold data, and how much of each.
   *
   * The bounds are always sent explicitly and computed in the browser's own
   * timezone: the days offered in the selector and the days counted here have to
   * be the same days, and only the client knows where its midnights fall.
   */
  async getCoverage(query: CoverageQuery, signal?: AbortSignal): Promise<CoverageResponse> {
    const path = `/coverage${buildQuery({
      start: query.start,
      end: query.end,
      timeZone: query.timeZone ?? localTimeZone(),
      siteId: query.siteId,
      metricFamily: query.metricFamily,
      metricName: query.metricNames?.join(','),
    })}`;
    return request<CoverageResponse>(path, signal);
  },
};

export interface CoverageQuery {
  /** UTC ISO-8601 bounds of the window to summarize. */
  start: string;
  end: string;
  /** IANA zone the calendar-day grouping is expressed in. Defaults to the browser's. */
  timeZone?: string;
  siteId?: string;
  metricFamily?: string;
  metricNames?: string[];
}

/** Convenience: an ISO range covering the last `days` days, ending now. */
export function lastNDays(days: number, now: Date = new Date()): { start: string; end: string } {
  return {
    start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    end: now.toISOString(),
  };
}

/** Convenience: an ISO range covering the last `hours` hours, ending now. */
export function lastNHours(hours: number, now: Date = new Date()): { start: string; end: string } {
  return {
    start: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(),
    end: now.toISOString(),
  };
}

/**
 * Map an AURA time-range token to an ISO range.
 *
 * Delegates to `resolveTimeRange` rather than re-deriving the mapping, so a
 * calendar-day token resolves to that day's local midnight boundaries here too.
 * A private switch statement in this file was previously the second definition
 * of what a token means; two definitions is one too many.
 */
export function rangeFromPreset(
  preset: string,
  now: Date = new Date()
): { start: string; end: string } {
  const range = resolveTimeRange(preset, now);
  return { start: range.startIso, end: range.endIso };
}
