/**
 * DashboardHero — Observatory aesthetic hero block for the dashboard.
 * Lives at the top of DashboardEnhanced and shows the branding eyebrow,
 * title, persona label, connection state, sync time, and refresh button.
 */

import { memo } from 'react';
import { RefreshCw } from 'lucide-react';
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
    <div className="aura-hero">
      <div className="aura-hero-title-block">
        <div className="aura-eyebrow">
          {/* The live dot and the word "Live" are only honest for a window that
              ends at now. A finished day is history, and saying otherwise is the
              one claim this header must never make. */}
          {!isHistorical && <span className="aura-live-dot" aria-hidden="true" />}
          <span>
            {isHistorical ? 'Network Intelligence — Historical' : 'Network Intelligence — Live Telemetry'}
          </span>
          <span className="aura-eyebrow-rule" aria-hidden="true" />
        </div>
        <h2 className="aura-hero-title flex items-center gap-3">
          <em>Observatory</em>
          <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">
            Beta
          </span>
        </h2>
        {activePersona !== 'super-user' && personaConfig && (
          <span className="aura-hero-coord">{personaConfig.dashboardLabel}</span>
        )}
        <SelectedRangeLabel
          range={timeRange}
          coverage={timeRangeCoverage}
          className="mt-2"
        />
      </div>
      <div className="aura-hero-meta">
        <ConnectionState />
        {lastUpdate && (
          <div className="aura-hero-meta-row">
            <span className="aura-hero-meta-key">SYNC</span>
            <RelativeTime date={lastUpdate} />
          </div>
        )}
        <Button
          onClick={onRefresh}
          variant="outline"
          size="sm"
          disabled={refreshing}
          className="aura-refresh"
        >
          <RefreshCw className={`mr-2 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Syncing' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
}

export const DashboardHero = memo(DashboardHeroComponent);
