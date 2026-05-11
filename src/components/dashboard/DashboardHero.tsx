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
import type { PersonaDashboardProfile } from '../../config/personaDashboardConfig';
import type { PersonaId } from '../../config/personaDefinitions';

interface DashboardHeroProps {
  activePersona: PersonaId;
  personaConfig: PersonaDashboardProfile | undefined;
  lastUpdate: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}

function DashboardHeroComponent({
  activePersona,
  personaConfig,
  lastUpdate,
  refreshing,
  onRefresh,
}: DashboardHeroProps) {
  return (
    <div className="aura-hero">
      <div className="aura-hero-title-block">
        <div className="aura-eyebrow">
          <span className="aura-live-dot" aria-hidden="true" />
          <span>Network Intelligence — Live Telemetry</span>
          <span className="aura-eyebrow-rule" aria-hidden="true" />
        </div>
        <h2 className="aura-hero-title">
          AURA
          <span className="aura-divider-glyph"> · </span>
          <em>Observatory</em>
        </h2>
        {activePersona !== 'super-user' && personaConfig && (
          <span className="aura-hero-coord">{personaConfig.dashboardLabel}</span>
        )}
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
