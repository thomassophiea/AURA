/**
 * Normalize a light report, persist the sample, and (when the change survives its
 * dwell) commit a transition. Called fire-and-forget from the report endpoint —
 * ingest failures must never break the endpoint (spec §6.2).
 */
import { normalizeLux, commitTransition, DEFAULT_THRESHOLDS, DEFAULT_HYSTERESIS } from './lightState.js';
import * as repo from './lightRepository.js';

export async function ingestLightReport({ sourceId, serial, state, data, at }, deps = repo) {
  const observedAt = at ?? new Date().toISOString();
  const lux = Number.isFinite(Number(data)) ? Number(data) : null;
  const normalizedState = normalizeLux(lux, state, DEFAULT_THRESHOLDS);

  await deps.insertSample({ sourceId, apSerial: serial, lux, reportedState: state ?? null, normalizedState, observedAt });

  const open = await deps.getOpenTransition({ sourceId, apSerial: serial });
  const prevState = open?.to_state ?? 'unknown';
  const since = open?.entered_at ?? observedAt;
  const dwellSeconds = Math.max(0, (new Date(observedAt) - new Date(since)) / 1000);

  const decision = commitTransition({ state: prevState, since }, normalizedState, dwellSeconds, DEFAULT_HYSTERESIS);
  if (decision.committed && decision.state !== prevState) {
    await deps.closeAndOpenTransition({
      sourceId,
      apSerial: serial,
      fromState: prevState === 'unknown' && !open ? null : prevState,
      toState: decision.state,
      enteredAt: observedAt,
    });
    return { normalizedState, committed: true };
  }
  return { normalizedState, committed: false };
}
