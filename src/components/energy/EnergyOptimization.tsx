import { useMemo, useState } from 'react';
import { FileText, Leaf } from 'lucide-react';

import { useEnergyOverview, useEnergySites, useEnergyRecommendations } from '@/hooks/useEnergyData';
import { useGlobalFilters } from '@/hooks/useGlobalFilters';
import { useSiteNames } from '@/hooks/useSiteNames';
import { useSelectedTimeRange } from '@/hooks/useSelectedTimeRange';
import { useSourceSites } from '@/hooks/useSourceSites';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { SourceSiteSelector } from '@/components/SourceSiteSelector';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { downloadEnvironmentalReportPdf, getEnvironmentalReport } from '@/services/energyService';
import { formatCurrency, formatKwh } from '@/lib/energyCalc';
import { parseXiqSiteValue } from '@/services/siteContextService';
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
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const isXiqSite = parseXiqSiteValue(selectedSite) !== null;

  const handleSiteChange = (value: string) => {
    setSelectedSite(value);
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

  async function handleGenerateReport() {
    setReportError(null);
    setReportLoading(true);
    try {
      const report = await getEnvironmentalReport({
        site: selectedSite,
        timeRange: timeRangeToken,
      });
      await downloadEnvironmentalReportPdf(report);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Report generation failed');
    } finally {
      setReportLoading(false);
    }
  }

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

      {noData ? <EnergyEmptyState reason="no-data" /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {!noData ? (
            <>
              <EnergySiteRankings
                sites={sites.data ? sites.data.filter((s) => s.siteId) : null}
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
                ratePerKwh={overview.data?.ratePerKwh ?? 0.14}
                currencySymbol={overview.data?.currencySymbol ?? '$'}
              />
              <EnergyApTable enabled={apTableEnabled} />
            </>
          ) : null}
        </div>
        <div className="space-y-6">
          {!noData ? (
            <>
              <EnergyScenarioBuilder />
              <EnergyRecommendations
                recommendations={recommendations.data}
                loading={recommendations.loading}
              />
            </>
          ) : null}
          <EnergyPreferencesPanel onSaved={() => overview.refetch()} />
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-foreground" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Environmental Report</h3>
                </div>
                <Badge variant="outline">ISO 14001-aligned</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <Leaf className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>Measured AP telemetry provides evidence of environmental performance; this is not a certification and does not determine ISO conformity.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Annual energy</p>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    {formatKwh(overview.data?.annualKwhProjected ?? 0)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Annual cost</p>
                  <p className="mt-1 text-base font-semibold text-foreground">
                    {formatCurrency(overview.data?.estimatedAnnualCost ?? 0, overview.data?.currencySymbol ?? '$')}
                  </p>
                </div>
              </div>
              {reportError ? <p className="text-sm text-destructive">{reportError}</p> : null}
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={reportLoading || !overview.data}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reportLoading ? 'Generating…' : 'Generate report'}
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      <LightAwarePolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
      <LightAwareApDrawer open={apDrawerOpen} onOpenChange={setApDrawerOpen} />
    </div>
  );
}

export default EnergyOptimization;
