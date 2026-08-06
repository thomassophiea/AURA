/**
 * Freshness indicator for views backed by persisted monitoring history.
 *
 * Four states, deliberately kept distinct — collapsing them is how a dashboard
 * ends up implying a dead gateway is healthy:
 *
 *   fresh           recently collected
 *   stale           stored data, older than the staleness threshold
 *   offline         the source is failing; what is shown is stored history
 *   never_collected nothing has ever been collected for this scope
 *
 * The badge is informational, never destructive: it annotates the data on
 * screen rather than replacing it.
 */

import { AlertTriangle, CloudOff, Database, HelpCircle } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { SourceState } from '../../types/monitoring';

export interface DataFreshnessBadgeProps {
  state: SourceState;
  /** ISO-8601 of the most recent successful collection, when known. */
  lastSuccessfulCollectionAt?: string | null;
  /** Optional short note, e.g. which source is affected. */
  detail?: string | null;
  className?: string;
}

function formatTimestamp(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Presentation {
  variant: 'success' | 'warning' | 'destructive' | 'secondary';
  Icon: typeof Database;
  label: string;
  message: (formattedTime: string | null) => string;
}

const PRESENTATION: Record<SourceState, Presentation> = {
  fresh: {
    variant: 'success',
    Icon: Database,
    label: 'Stored',
    message: (time) =>
      time
        ? `Served from AURA's database. Last successful collection ${time}.`
        : "Served from AURA's database.",
  },
  stale: {
    variant: 'warning',
    Icon: AlertTriangle,
    label: 'Stale',
    message: (time) =>
      time
        ? `No recent collection. Showing stored data through ${time}.`
        : 'No recent collection. Showing stored data.',
  },
  offline: {
    variant: 'destructive',
    Icon: CloudOff,
    label: 'Gateway unavailable',
    message: (time) =>
      time
        ? `Gateway unavailable. Showing stored data through ${time}.`
        : 'Gateway unavailable. No successful collection has been recorded.',
  },
  never_collected: {
    variant: 'secondary',
    Icon: HelpCircle,
    label: 'No data collected',
    message: () =>
      'Nothing has been collected for this scope yet. This is different from a gateway being offline.',
  },
  unknown: {
    variant: 'secondary',
    Icon: HelpCircle,
    label: 'Unknown',
    message: () => 'Collection status is unknown.',
  },
};

export function DataFreshnessBadge({
  state,
  lastSuccessfulCollectionAt,
  detail,
  className,
}: DataFreshnessBadgeProps) {
  const presentation = PRESENTATION[state] ?? PRESENTATION.unknown;
  const { Icon } = presentation;
  const formattedTime = formatTimestamp(lastSuccessfulCollectionAt);
  const message = presentation.message(formattedTime);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={presentation.variant}
          className={className}
          data-state={state}
          aria-label={message}
        >
          <Icon aria-hidden="true" />
          {presentation.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-xs">{message}</p>
        {detail ? <p className="mt-1 max-w-xs text-xs opacity-80">{detail}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export default DataFreshnessBadge;
