/**
 * Client Insights data for the selected window.
 *
 * Unlike AP Insights, this has no historical branch — and that is a deliberate
 * product decision, not a gap to fill later.
 *
 * The controller's `/v1/report/clients/{mac}` takes a duration back from now, so
 * it cannot answer for a finished day. The obvious fix would be to serve the day
 * from AURA's own store, except AURA does not persist per-client history:
 * `client_external_id` is NULL by default, gated behind
 * `MONITORING_PERSIST_CLIENT_IDENTIFIERS` plus a pseudonym salt, precisely so a
 * MAC address or username is never written to disk without an explicit decision.
 *
 * So for a past day there is genuinely nothing to show, and this hook says so
 * with the reason rather than quietly falling back to the last few hours under
 * yesterday's date.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { apiService } from '../services/api';
import { controllerDurationFor, type ResolvedTimeRange } from '../lib/timeRange';
import type { ClientInsightsResponse } from '../types/api';

export type ClientInsightsUnavailableReason =
  /** The window is a past day, which no available source can answer for. */
  | 'historical_not_retained'
  | 'error'
  | null;

export interface UseClientInsightsDataResult {
  insights: ClientInsightsResponse | null;
  isLoading: boolean;
  unavailableReason: ClientInsightsUnavailableReason;
  /** Sentence for the empty state, or null when there is data. */
  unavailableMessage: string | null;
  reload: () => void;
}

/** Widget scope the controller accepts for a client report. */
export type ClientInsightsScope = 'default' | 'all' | 'expert' | 'troubleshoot';

export function useClientInsightsData(
  macAddress: string,
  range: ResolvedTimeRange,
  {
    scope = 'default',
    enabled = true,
  }: { scope?: ClientInsightsScope; enabled?: boolean } = {}
): UseClientInsightsDataResult {
  const [insights, setInsights] = useState<ClientInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [unavailableReason, setUnavailableReason] =
    useState<ClientInsightsUnavailableReason>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const cancelledRef = useRef(false);
  const controllerDuration = controllerDurationFor(range);
  const { bucketMinutes, label } = range;

  useEffect(() => {
    if (!enabled || !macAddress) return undefined;

    cancelledRef.current = false;

    // Historical: nothing to ask. The controller cannot answer for a finished
    // day and no per-client history is stored, so the request is not made at all
    // rather than issued and quietly mislabelled.
    if (controllerDuration === null) {
      setInsights(null);
      setUnavailableReason('historical_not_retained');
      setErrorMessage(null);
      setIsLoading(false);
      return () => {
        cancelledRef.current = true;
      };
    }

    setIsLoading(true);
    (async () => {
      try {
        const data = await apiService.getClientInsights(
          macAddress,
          controllerDuration,
          bucketMinutes,
          scope
        );
        if (cancelledRef.current) return;
        setInsights(data);
        setUnavailableReason(null);
        setErrorMessage(null);
      } catch (error) {
        if (cancelledRef.current) return;
        console.error('[ClientInsights] Failed to load insights:', error);
        setInsights(null);
        setUnavailableReason('error');
        // The actual failure text, not a generic one: it is what tells an
        // operator whether the controller 502'd or the token expired.
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load client insights.');
      } finally {
        if (!cancelledRef.current) setIsLoading(false);
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [enabled, macAddress, controllerDuration, bucketMinutes, scope, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const unavailableMessage =
    unavailableReason === 'historical_not_retained'
      ? `Per-client history is not retained, so ${label.toLowerCase()} cannot be shown. The controller only reports client activity for a period ending now. Choose a recent range to see this client's insights.`
      : unavailableReason === 'error'
        ? (errorMessage ?? 'Failed to load client insights.')
        : null;

  return { insights, isLoading, unavailableReason, unavailableMessage, reload };
}
