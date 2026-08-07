/**
 * AP Insights data for whatever window is selected, from whichever source can
 * actually answer for it.
 *
 *   live window       → the controller's `/v1/report/aps/{serial}` (as before)
 *   past calendar day → AURA's persisted `ap_report` history, rebuilt into the
 *                       same response shape by `apInsightsHistory`
 *
 * The routing exists because the controller's report API takes a *duration back
 * from now*: it cannot be asked about a finished day at all. Rather than showing
 * the last 3 hours under yesterday's date, a historical window is served from
 * PostgreSQL — which also means it needs no controller connection.
 *
 * Both branches return an `APInsightsResponse`, so every chart downstream is
 * unchanged and there is only one rendering path to keep correct.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { apiService } from '../services/api';
import { monitoringHistory } from '../services/monitoringHistory';
import {
  AP_REPORT_FAMILY,
  buildInsightsFromHistory,
  hasHistoricalInsights,
} from '../services/apInsightsHistory';
import { controllerDurationFor, type ResolvedTimeRange } from '../lib/timeRange';
import type { APInsightsResponse } from '../types/api';

/** Why no data is being shown, when that is the situation. */
export type InsightsUnavailableReason =
  /** The window is historical and nothing was stored for it. */
  | 'no_stored_history'
  /** The request failed. */
  | 'error'
  | null;

export interface UseApInsightsDataResult {
  insights: APInsightsResponse | null;
  isLoading: boolean;
  /** True when the data came from stored history rather than the controller. */
  servedFromHistory: boolean;
  unavailableReason: InsightsUnavailableReason;
  /**
   * The actual failure text when `unavailableReason` is 'error'.
   *
   * Kept rather than flattened to a generic string: "Failed to fetch AP
   * insights: 502 Bad Gateway" tells an operator where to look, and
   * "Failed to load AP insights" does not.
   */
  errorMessage: string | null;
  reload: () => void;
}

export function useApInsightsData(
  serialNumber: string,
  range: ResolvedTimeRange,
  { enabled = true }: { enabled?: boolean } = {}
): UseApInsightsDataResult {
  const [insights, setInsights] = useState<APInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [unavailableReason, setUnavailableReason] = useState<InsightsUnavailableReason>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const servedFromHistory = !range.isLive;
  const cancelledRef = useRef(false);

  const { startIso, endIso, bucketMinutes } = range;
  const controllerDuration = controllerDurationFor(range);

  useEffect(() => {
    if (!enabled || !serialNumber) return undefined;

    cancelledRef.current = false;
    setIsLoading(true);

    (async () => {
      try {
        if (controllerDuration === null) {
          // Historical: PostgreSQL only. The controller is deliberately not
          // consulted — it could not answer for this window anyway, and this
          // path has to keep working while the gateway is unreachable.
          const response = await monitoringHistory.getHistory({
            start: startIso,
            end: endIso,
            deviceId: serialNumber,
            metricFamily: AP_REPORT_FAMILY,
            resolutionMinutes: bucketMinutes,
          });

          if (cancelledRef.current) return;

          const rebuilt = buildInsightsFromHistory(response.series, {
            serialNumber,
            start: new Date(startIso),
            end: new Date(endIso),
          });

          const usable = hasHistoricalInsights(rebuilt);
          setInsights(usable ? rebuilt : null);
          setUnavailableReason(usable ? null : 'no_stored_history');
          setErrorMessage(null);
          return;
        }

        const data = await apiService.getAccessPointInsights(
          serialNumber,
          controllerDuration,
          bucketMinutes
        );
        if (cancelledRef.current) return;
        setInsights(data);
        setUnavailableReason(null);
        setErrorMessage(null);
      } catch (error) {
        if (cancelledRef.current) return;
        console.error('[APInsights] Failed to load insights:', error);
        // Cleared rather than left showing the previous window's data under this
        // window's label.
        setInsights(null);
        setUnavailableReason('error');
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to load AP insights'
        );
      } finally {
        if (!cancelledRef.current) setIsLoading(false);
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [enabled, serialNumber, startIso, endIso, bucketMinutes, controllerDuration, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { insights, isLoading, servedFromHistory, unavailableReason, errorMessage, reload };
}
