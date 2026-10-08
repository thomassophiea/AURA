import { useMemo, useRef, useState } from 'react';

import {
  useEnergyOverview,
  useEnergySites,
  useEnergyRecommendationsDetail,
} from '@/hooks/useEnergyData';
import { useGlobalFilters } from '@/hooks/useGlobalFilters';
import { useSiteNames } from '@/hooks/useSiteNames';
import { useSelectedTimeRange } from '@/hooks/useSelectedTimeRange';
import { useSourceSites } from '@/hooks/useSourceSites';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { SourceSiteSelector } from '@/components/SourceSiteSelector';
import { parseXiqSiteValue } from '@/services/siteContextService';
import { mergeDayStatuses } from '@/lib/energyCalc';
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
import { EnergyExperimentPanel } from './EnergyExperimentPanel';

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

  // Range availability follows the data the page actually reads: measured AP
  // state is primary, the AP report series is the per-AP fallback, so a day is
  // as available as the better of the two.
  const coverageSiteId = filters.site !== 'all' ? filters.site : undefined;
  const {
    token: timeRangeToken,
    range: selectedRange,
    setToken: setTimeRangeToken,
    optionGroups,
    dayStatuses: measuredDayStatuses,
    retentionDays,
    neverCollected: measuredNeverCollected,
  } = useSelectedTimeRange({ siteId: coverageSiteId, metricFamily: 'energy_ap_state' });
  const { dayStatuses: reportDayStatuses, neverCollected: reportNeverCollected } =
    useSelectedTimeRange({ siteId: coverageSiteId, metricFamily: 'ap_report' });
  const dayStatuses = useMemo(
    () => mergeDayStatuses(measuredDayStatuses, reportDayStatuses),
    [measuredDayStatuses, reportDayStatuses]
  );
  const neverCollected = measuredNeverCollected && reportNeverCollected;
  const overview = useEnergyOverview();
  const sites = useEnergySites();
  const recommendationsDetail = useEnergyRecommendationsDetail();
  const recommendations = {
    ...recommendationsDetail,
    data: recommendationsDetail.data?.recommendations ?? null,
  };
  const [apTableEnabled, setApTableEnabled] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [apDrawerOpen, setApDrawerOpen] = useState(false);

  const noData =
    !overview.error && overview.data !== null && overview.data.apWithDataCount === 0;
  // The overview is the page's spine: if it failed, the fleet cards below would
  // only repeat the same failure, so they wait for a successful retry.
  const overviewFailed = Boolean(overview.error) && !overview.loading;
  const hideFleet = noData || overviewFailed;

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

      <EnergyOverviewCards
        overview={overview.data}
        loading={overview.loading}
        error={overview.error}
        onRetry={overview.refetch}
      />

      {/* The Treatment-vs-Control controlled experiment leads the page: it is the one
          view that answers "what did Aura actually save", with a control group
          behind it. Fleet rollups continue below it. */}
      <EnergyExperimentPanel />

      {noData ? <EnergyEmptyState reason={neverCollected ? 'no-collection' : 'no-data'} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {!hideFleet ? (
            <>
              <EnergySiteRankings
                sites={sites.data ? sites.data.filter((s) => s.siteId) : null}
                loading={sites.loading}
                error={sites.error}
                onRetry={sites.refetch}
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
          {!hideFleet ? (
            <>
              <EnergyScenarioBuilder range={selectedRange} />
              <EnergyRecommendations
                recommendations={recommendations.data}
                loading={recommendations.loading}
                error={recommendations.error}
                onRetry={recommendations.refetch}
                unevaluatedRules={recommendationsDetail.data?.meta?.unevaluatedRules ?? []}
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
