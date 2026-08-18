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

export function EnergyOptimization() {
  const { updateFilter } = useGlobalFilters();
  const overview = useEnergyOverview();
  const sites = useEnergySites();
  const recommendations = useEnergyRecommendations();
  const [apTableEnabled, setApTableEnabled] = useState(false);

  const noData = overview.data !== null && overview.data.apWithDataCount === 0;

  return (
    <div className="space-y-6 p-6">
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
