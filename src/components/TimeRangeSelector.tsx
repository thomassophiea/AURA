/**
 * TimeRangeSelector — the dashboard's single time control.
 *
 * One compact dropdown, two groups: rolling windows and named calendar days
 * through the retention window. Deliberately not a row of buttons and not a
 * free-form date picker — with seven days of retention every reachable day has a
 * name, so typing a date would be more work than picking one, and eleven buttons
 * would crowd the filter bar the requirement asks to keep uncluttered.
 *
 * Days the store cannot serve are disabled with the reason attached; days it can
 * only partly serve stay selectable and carry a marker, because a partial day is
 * usually still what the operator wants to look at.
 */

import { memo } from 'react';
import { Clock, CircleAlert, CircleSlash } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { cn } from './ui/utils';
import type { TimeRangeOptionGroup } from '../lib/timeRange';
import type { DayCoverageStatus } from '../lib/timeRangeAvailability';

export interface TimeRangeSelectorProps {
  value: string;
  onChange: (token: string) => void;
  optionGroups: TimeRangeOptionGroup[];
  /** Availability per local date, keyed `YYYY-MM-DD`. */
  dayStatuses: Map<string, DayCoverageStatus>;
  retentionDays: number;
  /** True when nothing has ever been collected — worth saying once, at the top. */
  neverCollected?: boolean;
  className?: string;
  triggerClassName?: string;
}

function statusIcon(availability: DayCoverageStatus['availability']) {
  if (availability === 'partial') {
    return (
      <CircleAlert
        className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-warning)]"
        aria-hidden="true"
      />
    );
  }
  if (availability === 'empty' || availability === 'outside-retention') {
    return <CircleSlash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
  return null;
}

function TimeRangeSelectorComponent({
  value,
  onChange,
  optionGroups,
  dayStatuses,
  retentionDays,
  neverCollected = false,
  className = '',
  triggerClassName = 'w-52 h-10',
}: TimeRangeSelectorProps) {
  return (
    <div className={cn('shrink-0', className)}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={triggerClassName} aria-label="Time range">
          <Clock className="mr-2 h-4 w-4 flex-shrink-0" />
          <SelectValue placeholder="Time Range" />
        </SelectTrigger>
        <SelectContent className="max-h-[420px]">
          {optionGroups.map((group, index) => (
            <div key={group.id}>
              {index > 0 && <SelectSeparator />}
              <SelectGroup>
                <SelectLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </SelectLabel>

                {group.id === 'day' && neverCollected && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No history has been collected yet.
                  </div>
                )}

                {group.options.map((option) => {
                  const status = option.localDate ? dayStatuses.get(option.localDate) : undefined;
                  const disabled = status ? !status.selectable : false;

                  return (
                    <SelectItem
                      key={option.token}
                      value={option.token}
                      disabled={disabled}
                      // The reason lives on the row itself rather than only in a
                      // tooltip, so a disabled day explains itself.
                      title={status?.note ?? undefined}
                      className="pr-8"
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className={cn('truncate', disabled && 'text-muted-foreground')}>
                          {option.label}
                        </span>
                        {option.detail && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {option.detail}
                          </span>
                        )}
                        {status && statusIcon(status.availability)}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </div>
          ))}

          <SelectSeparator />
          <div className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            {retentionDays} days of history are retained. Days marked{' '}
            <CircleAlert
              className="inline h-3 w-3 -translate-y-px text-[color:var(--status-warning)]"
              aria-hidden="true"
            />{' '}
            are incomplete.
          </div>
        </SelectContent>
      </Select>
    </div>
  );
}

export const TimeRangeSelector = memo(TimeRangeSelectorComponent);
