/**
 * DashboardHero — the Network Overview page header. Title, live/historical
 * state, selected range, connection state, sync time, and refresh — in the
 * standard enterprise page-header layout (no display serif, no letterspaced
 * eyebrows: this is an operations console, not a landing page).
 */

import { memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { RelativeTime } from '../ui/RelativeTime';
import { ConnectionState } from '../ui/ConnectionState';
import { SelectedRangeLabel } from '../SelectedRangeLabel';
import type { PersonaDashboardProfile } from '../../config/personaDashboardConfig';
import type { PersonaId } from '../../config/personaDefinitions';
import type { ResolvedTimeRange } from '../../lib/timeRange';

interface DashboardHeroProps {
  activePersona: PersonaId;
  personaConfig: PersonaDashboardProfile | undefined;
  lastUpdate: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  /** The window every figure below is computed over. */
  timeRange: ResolvedTimeRange;
  /** Completeness note for the selected window, when there is one. */
  timeRangeCoverage?: { severity: 'info' | 'warning'; message: string } | null;
}

function DashboardHeroComponent({
  activePersona,
  personaConfig,
  lastUpdate,
  refreshing,
  onRefresh,
  timeRange,
  timeRangeCoverage = null,
}: DashboardHeroProps) {
  const isHistorical = !timeRange.isLive;

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">Network Overview</h1>
          {/* "Live" is only honest for a window that ends at now. A finished
              day is history, and saying otherwise is the one claim this
              header must never make. */}
          {isHistorical ? (
            <Badge variant="neutral">Historical</Badge>
          ) : (
            <Badge variant="success" className="gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-[color:var(--status-success)]"
              />
              Live
            </Badge>
          )}
        </div>
        {activePersona !== 'super-user' && personaConfig && (
          <p className="mt-0.5 text-sm text-muted-foreground">{personaConfig.dashboardLabel}</p>
        )}
        <SelectedRangeLabel range={timeRange} coverage={timeRangeCoverage} className="mt-1.5" />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <ConnectionState />
        {lastUpdate && (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            Updated <RelativeTime date={lastUpdate} />
          </span>
        )}
        <Button onClick={onRefresh} variant="outline" size="sm" disabled={refreshing}>
          <RefreshCw className={`mr-2 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
}

export const DashboardHero = memo(DashboardHeroComponent);
