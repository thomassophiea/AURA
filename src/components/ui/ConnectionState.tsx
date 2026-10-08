import { useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import type { ApiCallLog } from '../../types/api';
import { RelativeTime } from './RelativeTime';
import { cn } from './utils';

export type ConnectionHealth = 'live' | 'degraded' | 'offline' | 'unknown';

/** What one completed request says about the Gateway connection. */
export type RequestOutcome = 'ok' | 'degraded' | 'failed';

/** How many recent outcomes the classification looks at. */
const OUTCOME_WINDOW = 6;
/** Consecutive transport failures (network / timeout) before "Disconnected". */
const OFFLINE_AFTER_CONSECUTIVE_FAILURES = 3;

/**
 * Classify one API log entry, or null when it says nothing about the
 * connection (still pending, or cancelled by the client).
 *
 * - any HTTP answer except 429/5xx → the Gateway is reachable ('ok'); a 401 or
 *   404 is the Gateway answering, not the connection failing
 * - 429 / 5xx → reachable but struggling ('degraded')
 * - no status at all (network error, timeout) → 'failed'
 */
export function outcomeOf(log: ApiCallLog): RequestOutcome | null {
  if (log.isPending || log.cancelled) return null;
  if (typeof log.status === 'number' && log.status > 0) {
    if (log.status === 429 || log.status >= 500) return 'degraded';
    return 'ok';
  }
  return log.error ? 'failed' : null;
}

/**
 * Connection state from the outcome of the most recent requests — never from
 * elapsed idle time.
 *
 * AURA deliberately does not poll (see lib/autoRefresh.ts), so a healthy page
 * that nobody is touching makes no requests. Deriving state from "seconds since
 * the last success" therefore made every idle page read "Data stale" after 30s
 * and "Disconnected" after two minutes, with nothing wrong.
 *
 * One broken endpoint in an otherwise healthy fan-out does not degrade the
 * connection: the state only turns when most of the recent window failed, or
 * when the last few requests could not reach the Gateway at all.
 */
export function classifyConnection(outcomes: RequestOutcome[]): ConnectionHealth {
  if (outcomes.length === 0) return 'unknown';
  const recent = outcomes.slice(-OUTCOME_WINDOW);

  let trailingFailures = 0;
  for (let i = recent.length - 1; i >= 0 && recent[i] === 'failed'; i--) trailingFailures++;
  if (trailingFailures >= OFFLINE_AFTER_CONSECUTIVE_FAILURES) return 'offline';

  if (recent[recent.length - 1] === 'ok') return 'live';
  const okCount = recent.filter((o) => o === 'ok').length;
  return okCount * 2 >= recent.length ? 'live' : 'degraded';
}

interface ConnectionStateProps {
  className?: string;
}

/** Completion time of a log entry, for ordering the seeded history. */
function completedAt(log: ApiCallLog): number {
  return log.timestamp.getTime() + (log.duration ?? 0);
}

/**
 * ConnectionState — small chip showing Gateway API health, derived from the
 * outcome of recent requests via apiService's call-log subscription. It holds
 * still while the page is idle; only a new request outcome can change it.
 */
export function ConnectionState({ className }: ConnectionStateProps) {
  const [outcomes, setOutcomes] = useState<RequestOutcome[]>([]);
  const [lastSuccess, setLastSuccess] = useState<number | null>(null);

  useEffect(() => {
    // Seed from existing logs on mount, in completion order.
    const seeded = apiService
      .getApiLogs()
      .filter((log) => outcomeOf(log) !== null)
      .sort((a, b) => completedAt(a) - completedAt(b));
    setOutcomes(
      seeded.slice(-OUTCOME_WINDOW).map((log) => outcomeOf(log) as RequestOutcome)
    );
    const lastOk = [...seeded].reverse().find((log) => outcomeOf(log) === 'ok');
    if (lastOk) setLastSuccess(completedAt(lastOk));

    // The log stream re-delivers entries (pending → completed, and a replay of
    // the latest one on clear), so each request is counted once.
    const counted = new Set<number>(seeded.map((log) => log.id));
    const unsubscribe = apiService.subscribeToApiLogs((log) => {
      const outcome = outcomeOf(log);
      if (!outcome || counted.has(log.id)) return;
      counted.add(log.id);
      if (counted.size > 1000) {
        // Bounded: drop the oldest half (Sets iterate in insertion order).
        let drop = 500;
        for (const id of counted) {
          if (drop-- <= 0) break;
          counted.delete(id);
        }
      }
      setOutcomes((previous) => [...previous, outcome].slice(-OUTCOME_WINDOW));
      if (outcome === 'ok') setLastSuccess(completedAt(log));
    });

    return unsubscribe;
  }, []);

  const state = classifyConnection(outcomes);

  // Gateway API heartbeat vocabulary. Deliberately not "Online/Offline" —
  // that pair belongs to devices, and a slow Gateway is not a down AP.
  const tone = (() => {
    switch (state) {
      case 'live':
        return { dot: 'bg-[color:var(--status-success)]', text: '', label: 'Connected' };
      case 'degraded':
        return {
          dot: 'bg-[color:var(--status-warning)]',
          text: 'text-[color:var(--status-warning)]',
          label: 'Connection degraded',
        };
      case 'offline':
        return {
          dot: 'bg-[color:var(--status-error)]',
          text: 'text-[color:var(--status-error)]',
          label: 'Disconnected',
        };
      case 'unknown':
        return { dot: 'bg-muted-foreground/40', text: '', label: 'Connecting…' };
    }
  })();

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className={cn('inline-block h-2 w-2 rounded-full', tone.dot)} />
      <span className={cn(tone.text)}>{tone.label}</span>
      {lastSuccess !== null && state !== 'live' && state !== 'unknown' && (
        <span className="text-muted-foreground/70">
          · last OK <RelativeTime date={lastSuccess} />
        </span>
      )}
    </span>
  );
}
