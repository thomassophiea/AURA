import { useMemo, useState } from 'react';

import {
  useEnergyOverview,
  useEnergySites,
  useEnergyRecommendations,
} from '@/hooks/useEnergyData';
import { EnergyOverviewCards } from './EnergyOverviewCards';
import { EnergyEmptyState } from './EnergyEmptyState';
import { EnergySiteRankings } from './EnergySiteRankings';
import { LightAwareOptimization } from './LightAwareOptimization';
import { EnergyApTable } from './EnergyApTable';
import { EnergyScenarioBuilder } from './EnergyScenarioBuilder';
import { EnergyRecommendations } from './EnergyRecommendations';
import { EnergyPreferencesPanel } from './EnergyPreferencesPanel';
import { useGlobalFilters } from '@/hooks/useGlobalFilters';
import { useSelectedTimeRange } from '@/hooks/useSelectedTimeRange';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { SourceSiteSelector } from '@/components/SourceSiteSelector';
import { useSourceSites } from '@/hooks/useSourceSites';
import { parseXiqSiteValue } from '@/services/siteContextService';

export function EnergyOptimization() {
  const { filters, updateFilter } = useGlobalFilters();
  const { sites: os1Sites, xiqSites } = useSourceSites();
  // Resolve site ids (what the aggregates carry) back to human-readable names.
  const siteNameById = useMemo(
    () => new Map(os1Sites.map((s) => [s.id, s.name])),
    [os1Sites]
  );
  // Picker value tracks the global site filter ('all' or an OS-ONE site id).
  // XIQ selections carry an `xiq:` value and are gated below — the energy store
  // holds only OS-ONE / controller telemetry.
  const [selectedSite, setSelectedSite] = useState<string>(filters.site);
  const isXiqSite = parseXiqSiteValue(selectedSite) !== null;

  const handleSiteChange = (value: string) => {
    setSelectedSite(value);
    // OS-ONE selections (a site id, or 'all') drive the energy queries through
    // the global filter. XIQ selections leave the filter untouched and gate.
    if (parseXiqSiteValue(value) === null) {
      updateFilter('site', value);
    }
  };

  const {
    token: timeRangeToken,
    setToken: setTimeRangeToken,
    optionGroups,
    dayStatuses,
    retentionDays,
    neverCollected,
  } = useSelectedTimeRange({
    siteId: filters.site !== 'all' ? filters.site : undefined,
    metricFamily: 'ap_report',
  });
  const overview = useEnergyOverview();
  const sites = useEnergySites();
  const recommendations = useEnergyRecommendations();
  const [apTableEnabled, setApTableEnabled] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [apDrawerOpen, setApDrawerOpen] = useState(false);

  const noData = overview.data !== null && overview.data.apWithDataCount === 0;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Energy Optimization</h1>
        <p className="text-sm text-muted-foreground">
          Fleet energy use, cost, and savings from AP power telemetry
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SourceSiteSelector
          value={selectedSite}
          onValueChange={handleSiteChange}
          sites={os1Sites}
          xiqSites={xiqSites}
          osSiteValue="id"
        />
        <TimeRangeSelector
          value={timeRangeToken}
          onChange={setTimeRangeToken}
          optionGroups={optionGroups}
          dayStatuses={dayStatuses}
          retentionDays={retentionDays}
          neverCollected={neverCollected}
        />
      </div>
    </div>
  );

  if (isXiqSite) {
    return (
      <div className="space-y-6 p-6">
        {header}
        <EnergyEmptyState reason="xiq-unsupported" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {header}

      {overview.data?.meta.limitationsNotes.map((note) => (
        <div
          key={note}
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          {note}
        </div>
      ))}

      <EnergyOverviewCards overview={overview.data} loading={overview.loading} />

      {noData ? (
        <EnergyEmptyState reason="no-data" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <EnergySiteRankings
              sites={sites.data}
              loading={sites.loading}
              siteNameById={siteNameById}
              onSelectSite={(siteId) => {
                updateFilter('site', siteId);
                setApTableEnabled(true);
              }}
            />
            <LightAwareOptimization
              onConfigure={() => setPolicyOpen(true)}
              onViewAps={() => setApDrawerOpen(true)}
            />
            <EnergyApTable enabled={apTableEnabled} />
          </div>
          <div className="space-y-6">
            <EnergyScenarioBuilder />
            <EnergyRecommendations
              recommendations={recommendations.data}
              loading={recommendations.loading}
            />
            <EnergyPreferencesPanel onSaved={() => overview.refetch()} />
          </div>
        </div>
      )}
    </div>
  );
}

export default EnergyOptimization;
