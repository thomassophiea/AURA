import { useEffect, useRef } from 'react';
import { cn } from '../../ui/utils';
import type { APITimelineEntry } from '../agentTypes';

interface APITimelineViewProps {
  entries: APITimelineEntry[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-900/50 text-blue-300',
  POST: 'bg-green-900/50 text-green-300',
  PUT: 'bg-amber-900/50 text-amber-300',
  PATCH: 'bg-orange-900/50 text-orange-300',
  DELETE: 'bg-red-900/50 text-red-300',
};

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'text-green-400';
  if (status >= 400 && status < 500) return 'text-amber-400';
  if (status >= 500) return 'text-red-400';
  return 'text-white/50';
}

export function APITimelineView({ entries }: APITimelineViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  if (!entries.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-white/30">
        No API calls recorded
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto h-full space-y-1 font-mono">
      <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium font-sans mb-3">
        API Timeline — {entries.length} calls
      </p>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-white/4 transition-colors"
        >
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0',
              METHOD_COLORS[entry.method] ?? 'bg-white/10 text-white/50'
            )}
          >
            {entry.method}
          </span>
          <span className="flex-1 text-[11px] text-white/70 truncate">{entry.endpoint}</span>
          <span className={cn('text-[10px] shrink-0', statusColor(entry.status))}>
            {entry.status}
          </span>
          <span className="text-[10px] text-white/30 shrink-0">{entry.duration}ms</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
