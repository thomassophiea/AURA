import { useSyncExternalStore } from 'react';

/**
 * Single shared 1Hz tick. Avoids spawning 100 timers when 100 RelativeTime
 * components live on the page — they all subscribe to one external store.
 */
let listeners: Array<() => void> = [];
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let nowMs = Date.now();

function subscribe(cb: () => void) {
  listeners.push(cb);
  if (!intervalHandle) {
    intervalHandle = setInterval(() => {
      nowMs = Date.now();
      for (const fn of listeners) fn();
    }, 1000);
  }
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    if (listeners.length === 0 && intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };
}

const getSnapshot = () => nowMs;

interface RelativeTimeProps {
  /** The reference timestamp (Date or ms). Renders as "Ns ago" / "Nm ago" / "Nh ago". */
  date: Date | number;
  /** When elapsed exceeds this many seconds, render the absolute time instead. */
  absoluteAfterSeconds?: number;
  /** Optional className for the wrapper span. */
  className?: string;
}

/**
 * RelativeTime — re-renders every second showing elapsed time since `date`.
 * All instances share one interval. Falls back to an absolute timestamp
 * once `absoluteAfterSeconds` (default 24h) is exceeded.
 */
export function RelativeTime({
  date,
  absoluteAfterSeconds = 86_400,
  className,
}: RelativeTimeProps) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const ts = typeof date === 'number' ? date : date.getTime();
  const elapsedSec = Math.max(0, Math.floor((now - ts) / 1000));

  let label: string;
  if (elapsedSec > absoluteAfterSeconds) {
    label = new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } else if (elapsedSec < 5) {
    label = 'just now';
  } else if (elapsedSec < 60) {
    label = `${elapsedSec}s ago`;
  } else if (elapsedSec < 3600) {
    label = `${Math.floor(elapsedSec / 60)}m ago`;
  } else {
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    label = m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }

  return (
    <span className={className} title={new Date(ts).toLocaleString()}>
      {label}
    </span>
  );
}
