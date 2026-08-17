/**
 * AP Insights data for whatever window is selected, from whichever source can
 * actually answer for it.
 *
 *   live window ≤ 3H  → the controller's `/v1/report/aps/{serial}` (as before)
 *   live window > 3H  → AURA's persisted `ap_report` history: the Gateway
 *                       cannot serve those windows at all (see
 *                       `controllerCanServeApReport`)
 *   past calendar day → the same persisted history, rebuilt into the controller's
 *                       response shape by `apInsightsHistory`
 *
 * The routing exists because the controller's report API takes a *duration back
 * from now*: it cannot be asked about a finished day at all. Rather than showing
 * the last 3 hours under yesterday's date, a historical window is served from
 * PostgreSQL — which also means it needs no controller connection.
 *
 * The >3H case was added after the default 24-hour view was found to fail every
 * time: the Gateway spends ~31 seconds on such a request and then 500s. Asking
 * it and waiting for that is strictly worse than reading the history we already
 * have, so the ceiling is checked before the call rather than discovered by it.
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
  controllerCanServeApReport,
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

  const cancelledRef = useRef(false);

  const { startIso, endIso, bucketMinutes } = range;
  const controllerDuration = controllerDurationFor(range);
  /** True when the Gateway can answer for this window at all. */
  const fromController = controllerCanServeApReport(controllerDuration);
  /** Set when a controller window we expected to work fell back to history. */
  const [servedFromHistoryFallback, setServedFromHistoryFallback] = useState(false);
  const servedFromHistory = !fromController || servedFromHistoryFallback;

  useEffect(() => {
    if (!enabled || !serialNumber) return undefined;

    cancelledRef.current = false;
    setIsLoading(true);
    setServedFromHistoryFallback(false);

    (async () => {
      /** Read the window out of AURA's own store. Used for every case the
       *  Gateway cannot serve, and as the fallback when it fails unexpectedly. */
      const loadFromHistory = async () => {
        const response = await monitoringHistory.getHistory({
          start: startIso,
          end: endIso,
          deviceId: serialNumber,
          metricFamily: AP_REPORT_FAMILY,
          resolutionMinutes: bucketMinutes,
        });
        const rebuilt = buildInsightsFromHistory(response.series, {
          serialNumber,
          start: new Date(startIso),
          end: new Date(endIso),
        });
        return { rebuilt, usable: hasHistoricalInsights(rebuilt) };
      };

      try {
        if (!fromController) {
          // Either a finished calendar day, or a live window longer than the
          // Gateway's AP-report ceiling. Both are ours to answer, and both keep
          // working while the Gateway is unreachable.
          const { rebuilt, usable } = await loadFromHistory();
          if (cancelledRef.current) return;

          setInsights(usable ? rebuilt : null);
          setUnavailableReason(usable ? null : 'no_stored_history');
          setErrorMessage(null);
          return;
        }

        const data = await apiService.getAccessPointInsights(
          serialNumber,
          controllerDuration as string,
          bucketMinutes
        );
        if (cancelledRef.current) return;
        setInsights(data);
        setUnavailableReason(null);
        setErrorMessage(null);
      } catch (error) {
        if (cancelledRef.current) return;
        console.warn('[APInsights] Controller report failed, trying stored history:', error);

        // The Gateway failed on a window it was supposed to be able to serve.
        // We very likely hold the same data, so try it before showing an error —
        // a transient Gateway fault should not blank a chart we can still draw.
        try {
          const { rebuilt, usable } = await loadFromHistory();
          if (cancelledRef.current) return;
          if (usable) {
            setInsights(rebuilt);
            setServedFromHistoryFallback(true);
            setUnavailableReason(null);
            setErrorMessage(null);
            return;
          }
        } catch (historyError) {
          console.warn('[APInsights] Stored history unavailable too:', historyError);
        }

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
  }, [enabled, serialNumber, startIso, endIso, bucketMinutes, controllerDuration, fromController, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { insights, isLoading, servedFromHistory, unavailableReason, errorMessage, reload };
}
