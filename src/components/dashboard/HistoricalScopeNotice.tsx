/**
 * HistoricalScopeNotice — says what a past window can and cannot show.
 *
 * When the selected range is a finished day, the trends and service levels on
 * this page come from AURA's stored history, but a handful of panels are
 * unavoidably current state: the controller exposes no "who was connected last
 * Tuesday" endpoint, and AURA does not persist per-client or per-device rosters.
 *
 * Rendering today's inventory under a past date with no explanation is the exact
 * failure this notice exists to prevent. It is one line, dismissible in spirit
 * (it only appears for historical windows), and deliberately not a modal.
 */

import { memo } from 'react';
import { History } from 'lucide-react';

import { Alert, AlertDescription } from '../ui/alert';
import type { ResolvedTimeRange } from '../../lib/timeRange';

export interface HistoricalScopeNoticeProps {
  range: ResolvedTimeRange;
  /** Series the controller cannot supply for this window, from useDashboardData. */
  unavailableMetrics?: string[];
}

function HistoricalScopeNoticeComponent({
  range,
  unavailableMetrics = [],
}: HistoricalScopeNoticeProps) {
  return (
    <Alert className="border-border/60 bg-muted/30">
      <History className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="text-xs leading-relaxed">
        <span className="font-medium text-foreground">
          Showing stored history for {range.label.toLowerCase()}.
        </span>{' '}
        Service levels, trends and throughput are read from AURA&apos;s database and need no
        controller connection. Access point, client and service <em>lists</em> show current
        state — the controller cannot report which devices were connected on a past day.
        {unavailableMetrics.length > 0 && (
          <>
            {' '}
            Not available for this window: {unavailableMetrics.join(', ')}.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

export const HistoricalScopeNotice = memo(HistoricalScopeNoticeComponent);
