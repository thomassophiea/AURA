import { useState } from 'react';

import {
  useEnergyOverview,
  useEnergySites,
  useEnergyRecommendations,
} from '@/hooks/useEnergyData';
import { EnergyOverviewCards } from './EnergyOverviewCards';
import { EnergyEmptyState } from './EnergyEmptyState';
import { EnergySiteRankings } from './EnergySiteRankings';
import { EnergyApTable } from './EnergyApTable';
import { EnergyScenarioBuilder } from './EnergyScenarioBuilder';
import { EnergyRecommendations } from './EnergyRecommendations';
import { EnergyPreferencesPanel } from './EnergyPreferencesPanel';
import { useGlobalFilters } from '@/hooks/useGlobalFilters';
import { useSelectedTimeRange } from '@/hooks/useSelectedTimeRange';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';

export function EnergyOptimization() {
  const { filters, updateFilter } = useGlobalFilters();
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

  const noData = overview.data !== null && overview.data.apWithDataCount === 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Energy Optimization</h1>
          <p className="text-sm text-muted-foreground">
            Fleet energy use, cost, and savings from AP power telemetry
          </p>
        </div>
        <TimeRangeSelector
          value={timeRangeToken}
          onChange={setTimeRangeToken}
          optionGroups={optionGroups}
          dayStatuses={dayStatuses}
          retentionDays={retentionDays}
          neverCollected={neverCollected}
        />
      </div>

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
              onSelectSite={(siteId) => {
                updateFilter('site', siteId);
                setApTableEnabled(true);
              }}
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
