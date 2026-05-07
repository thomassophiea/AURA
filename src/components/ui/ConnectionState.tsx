import { useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import { RelativeTime } from './RelativeTime';
import { cn } from './utils';

type State = 'live' | 'stale' | 'offline' | 'unknown';

interface ConnectionStateProps {
  /** Seconds since last successful API call before flipping to STALE. Default 30. */
  staleAfterSeconds?: number;
  /** Seconds since last successful call before flipping to OFFLINE. Default 120. */
  offlineAfterSeconds?: number;
  className?: string;
}

/**
 * ConnectionState — small chip showing controller heartbeat. Wires into
 * apiService's call-log subscription. Flips LIVE → STALE → OFFLINE based
 * on time-since-last-success thresholds.
 */
export function ConnectionState({
  staleAfterSeconds = 30,
  offlineAfterSeconds = 120,
  className,
}: ConnectionStateProps) {
  const [lastSuccess, setLastSuccess] = useState<number | null>(null);

  useEffect(() => {
    // Seed from existing logs on mount.
    const existing = apiService.getApiLogs();
    for (let i = existing.length - 1; i >= 0; i--) {
      const log = existing[i];
      if (log.status && log.status >= 200 && log.status < 400 && !log.isPending) {
        setLastSuccess(log.timestamp.getTime());
        break;
      }
    }

    const unsubscribe = apiService.subscribeToApiLogs((log) => {
      if (log.status && log.status >= 200 && log.status < 400 && !log.isPending) {
        setLastSuccess(log.timestamp.getTime());
      }
    });

    return unsubscribe;
  }, []);

  // Re-render at 1Hz to update the state classification.
  // Reuse RelativeTime's tick by mounting a hidden one — simpler than a
  // duplicate timer.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const state: State = (() => {
    if (lastSuccess === null) return 'unknown';
    const elapsed = (Date.now() - lastSuccess) / 1000;
    if (elapsed >= offlineAfterSeconds) return 'offline';
    if (elapsed >= staleAfterSeconds) return 'stale';
    return 'live';
  })();

  const dotClass = (() => {
    switch (state) {
      case 'live':
        return 'bg-[color:var(--aura-amber)] aura-live-dot';
      case 'stale':
        return 'bg-[color:var(--status-warning)]';
      case 'offline':
        return 'bg-[color:var(--status-error)]';
      case 'unknown':
        return 'bg-muted-foreground/40';
    }
  })();

  const label = (() => {
    switch (state) {
      case 'live':
        return 'LIVE';
      case 'stale':
        return 'STALE';
      case 'offline':
        return 'OFFLINE';
      case 'unknown':
        return 'WAITING';
    }
  })();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2',
        'font-mono text-[10.5px] uppercase tracking-[0.18em]',
        'text-muted-foreground',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={cn('inline-block h-[7px] w-[7px] rounded-full', dotClass)}
      />
      <span
        className={cn(
          state === 'live' && 'text-[color:var(--aura-amber)]',
          state === 'stale' && 'text-[color:var(--status-warning)]',
          state === 'offline' && 'text-[color:var(--status-error)]'
        )}
      >
        {label}
      </span>
      {lastSuccess !== null && state !== 'live' && (
        <span className="text-muted-foreground/70">
          <RelativeTime date={lastSuccess} />
        </span>
      )}
    </span>
  );
}
