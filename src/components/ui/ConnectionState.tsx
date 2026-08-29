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

  // Gateway API heartbeat vocabulary. Deliberately not "Online/Offline" —
  // that pair belongs to devices, and a stale poll is not a down AP.
  const tone = (() => {
    switch (state) {
      case 'live':
        return { dot: 'bg-[color:var(--status-success)]', text: '', label: 'Connected' };
      case 'stale':
        return {
          dot: 'bg-[color:var(--status-warning)]',
          text: 'text-[color:var(--status-warning)]',
          label: 'Data stale',
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
      {lastSuccess !== null && state !== 'live' && (
        <span className="text-muted-foreground/70">
          <RelativeTime date={lastSuccess} />
        </span>
      )}
    </span>
  );
}
