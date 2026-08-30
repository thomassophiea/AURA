/**
 * Correlation Strip
 *
 * A single always-visible row of metric readouts for the timeline cursor,
 * pinned with the timeline controls above the scrolling chart grid. It answers
 * "what were the other series doing at this instant" without scrolling between
 * charts: values track the hover cursor live and freeze when the timeline is
 * locked (click any chart).
 */

import { Crosshair, Lock } from 'lucide-react';
import { cn } from '../ui/utils';

export interface CorrelationStripItem {
  key: string;
  label: string;
  /** Preformatted value, ready to render. */
  value: string;
  /** Series color of the chart this value came from (chip dot). */
  color?: string;
}

interface CorrelationStripProps {
  /** Cursor time; the strip is hidden until a chart has been hovered or locked. */
  timestamp: number | null;
  isLocked: boolean;
  items: CorrelationStripItem[];
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CorrelationStrip({ timestamp, isLocked, items }: CorrelationStripProps) {
  if (timestamp === null || items.length === 0) return null;

  return (
    <div
      data-testid="correlation-strip"
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-4 py-2 text-xs',
        isLocked ? 'bg-primary/5' : 'bg-muted/20'
      )}
    >
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        {isLocked ? (
          <Lock className="h-3.5 w-3.5 text-primary" aria-hidden />
        ) : (
          <Crosshair className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        )}
        {formatClockTime(timestamp)}
      </span>
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5 whitespace-nowrap">
          {item.color ? (
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              // Series colors are runtime values from the chart palette; they
              // cannot be expressed as static Tailwind classes.
              style={{ backgroundColor: item.color }}
            />
          ) : null}
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">{item.value}</span>
        </span>
      ))}
      {!isLocked ? (
        <span className="ml-auto hidden text-[11px] text-muted-foreground/70 sm:inline">
          Click a chart to lock this moment
        </span>
      ) : null}
    </div>
  );
}
