import { useMemo, useRef, useState } from 'react';

import { useEnergyOverview, useEnergySites, useEnergyRecommendations } from '@/hooks/useEnergyData';
import { useGlobalFilters } from '@/hooks/useGlobalFilters';
import { useSiteNames } from '@/hooks/useSiteNames';
import { useSelectedTimeRange } from '@/hooks/useSelectedTimeRange';
import { useSourceSites } from '@/hooks/useSourceSites';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { SourceSiteSelector } from '@/components/SourceSiteSelector';
import { parseXiqSiteValue } from '@/services/siteContextService';
import type { EnergyPreferences } from '@/types/energy';
import { EnergyOverviewCards } from './EnergyOverviewCards';
import { EnergyEmptyState } from './EnergyEmptyState';
import { EnergySiteRankings } from './EnergySiteRankings';
import { LightAwareOptimization } from './LightAwareOptimization';
import { LightAwarePolicyDialog } from './LightAwarePolicyDialog';
import { LightAwareApDrawer } from './LightAwareApDrawer';
import { EnergyApTable } from './EnergyApTable';
import { EnergyScenarioBuilder } from './EnergyScenarioBuilder';
import { EnergyRecommendations } from './EnergyRecommendations';
import { EnergyPreferencesPanel } from './EnergyPreferencesPanel';
import { EnvironmentalReportCard } from './EnvironmentalReportCard';

export function EnergyOptimization() {
  const { filters, updateFilter } = useGlobalFilters();
  const { sites: os1Sites, xiqSites } = useSourceSites();
  const { nameById: catalogNames } = useSiteNames();
  const siteNameById = useMemo(() => {
    const map = new Map<string, string>(catalogNames);
    for (const s of os1Sites) if (s.id && s.name) map.set(s.id, s.name);
    return map;
  }, [catalogNames, os1Sites]);

  const [selectedSite, setSelectedSite] = useState<string>(filters.site);
  const [preferences, setPreferences] = useState<EnergyPreferences | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const emissionsFactorRef = useRef<HTMLInputElement>(null);
  const isXiqSite = parseXiqSiteValue(selectedSite) !== null;

  const handleSiteChange = (value: string) => {
    setSelectedSite(value);
    if (parseXiqSiteValue(value) === null) {
      updateFilter('site', value);
    }
  };

  const {
    token: timeRangeToken,
    range: selectedRange,
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
      <div className="space-y-4 p-6">
        {header}
        <EnergyEmptyState reason="xiq-unsupported" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
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

      {noData ? <EnergyEmptyState reason="no-data" /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {!noData ? (
            <>
              <EnergySiteRankings
                sites={sites.data ? sites.data.filter((s) => s.siteId) : null}
                loading={sites.loading}
                siteNameById={siteNameById}
                currencySymbol={overview.data?.currencySymbol}
                onSelectSite={(siteId) => {
                  updateFilter('site', siteId);
                  setSelectedSite(siteId);
                  setApTableEnabled(true);
                }}
              />
              <LightAwareOptimization
                onConfigure={() => setPolicyOpen(true)}
                onViewAps={() => setApDrawerOpen(true)}
                ratePerKwh={overview.data?.ratePerKwh ?? 0.14}
                currencySymbol={overview.data?.currencySymbol ?? '$'}
              />
              <EnergyApTable
                enabled={apTableEnabled}
                currencySymbol={overview.data?.currencySymbol}
              />
            </>
          ) : null}
        </div>
        <div className="space-y-4">
          {!noData ? (
            <>
              <EnergyScenarioBuilder />
              <EnergyRecommendations
                recommendations={recommendations.data}
                loading={recommendations.loading}
                currencySymbol={overview.data?.currencySymbol}
              />
            </>
          ) : null}
          <EnergyPreferencesPanel
            emissionsFactorRef={emissionsFactorRef}
            open={prefsOpen}
            onOpenChange={setPrefsOpen}
            onLoaded={setPreferences}
            onSaved={(saved) => {
              setPreferences(saved);
              overview.refetch();
            }}
          />
          <EnvironmentalReportCard
            overview={overview.data}
            recommendations={recommendations.data}
            preferences={preferences}
            siteId={filters.site}
            siteName={filters.site === 'all' ? 'All sites' : siteNameById.get(filters.site) ?? filters.site}
            range={selectedRange}
            onConfigureCarbon={() => {
              setPrefsOpen(true);
              window.requestAnimationFrame(() => {
                emissionsFactorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                emissionsFactorRef.current?.focus();
              });
            }}
          />
        </div>
      </div>

      <LightAwarePolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
      <LightAwareApDrawer open={apDrawerOpen} onOpenChange={setApDrawerOpen} />
    </div>
  );
}

export default EnergyOptimization;
