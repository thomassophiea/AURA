/**
 * SelectedRangeLabel — states, in words, exactly which window the page is showing.
 *
 * Exists because a dropdown reading "Yesterday" does not tell an operator *which*
 * date that resolved to, and a screenshot of a dashboard with no date on it is
 * ambiguous the moment it is shared. Rendered next to the dashboard header.
 *
 * When the selected day is incomplete or unavailable this also says so, rather
 * than leaving the charts to imply an empty stretch was a quiet network.
 */

import { memo } from 'react';
import { CalendarDays, CircleAlert, Database } from 'lucide-react';

import { cn } from './ui/utils';
import type { ResolvedTimeRange } from '../lib/timeRange';

export interface SelectedRangeLabelProps {
  range: ResolvedTimeRange;
  /** Completeness note for the selection, from `useSelectedTimeRange`. */
  coverage?: { severity: 'info' | 'warning'; message: string } | null;
  /**
   * True when the window is entirely historical, so the figures come from the
   * stored history rather than a live controller reading.
   */
  showStoredBadge?: boolean;
  className?: string;
}

function SelectedRangeLabelComponent({
  range,
  coverage = null,
  showStoredBadge = true,
  className = '',
}: SelectedRangeLabelProps) {
  const isHistorical = !range.isLive;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Showing</span>
        <span className="font-medium">{range.label}</span>
        <span className="text-muted-foreground">·</span>
        {/* The resolved dates and clock times, so the window is unambiguous. */}
        <span className="text-muted-foreground tabular-nums">{range.rangeLabel}</span>

        {isHistorical && showStoredBadge && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
            title="A finished day does not change, so it is read from AURA's stored history rather than polled from the controller."
          >
            <Database className="h-3 w-3" aria-hidden="true" />
            Stored history
          </span>
        )}
      </div>

      {coverage && (
        <div
          className={cn(
            'flex items-start gap-1.5 text-xs',
            coverage.severity === 'warning'
              ? 'text-[color:var(--status-error)]'
              : 'text-[color:var(--status-warning)]'
          )}
          role="status"
        >
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{coverage.message}</span>
        </div>
      )}
    </div>
  );
}

export const SelectedRangeLabel = memo(SelectedRangeLabelComponent);
