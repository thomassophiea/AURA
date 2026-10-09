import { memo } from 'react';
import { Zap, DollarSign, TrendingDown, TrendingUp, Wifi, Gauge, Leaf } from 'lucide-react';

import { MetricCard } from '@/components/ui/MetricCard';
import {
  formatKwh,
  formatWatts,
  formatCurrency,
  formatKgCo2e,
  powerSourceLabel,
} from '@/lib/energyCalc';
import type { EnergyOverviewWithSource } from '@/services/energyService';
import { EnergyLoadError } from './EnergyEmptyState';

interface EnergyOverviewCardsProps {
  overview: EnergyOverviewWithSource | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function EnergyOverviewCardsComponent({
  overview,
  loading,
  error = null,
  onRetry,
}: EnergyOverviewCardsProps) {
  // An error is terminal for this render; only an in-flight request shows a skeleton.
  if (error && !loading) {
    return <EnergyLoadError what="Energy overview" message={error} onRetry={onRetry} />;
  }
  if (!loading && !overview) return null;
  const pending = loading || !overview;
  const sourceLabel = pending ? null : powerSourceLabel(overview.source);
  return (
    <div className="space-y-1">
      {sourceLabel ? (
        <p className="text-xs text-muted-foreground" data-testid="energy-power-source">
          Source: {sourceLabel}
          {overview?.sourceDetail?.mixed && (overview.sourceDetail.apReportOnlyApCount ?? 0) > 0
            ? ` · ${overview.sourceDetail.apReportOnlyApCount} AP(s) from the AP report series`
            : ''}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        <MetricCard
          icon={Zap}
          title="Energy used"
          loading={pending}
          value={pending ? '' : formatKwh(overview.periodKwh)}
          subtitle={
            pending ? undefined : `${formatKwh(overview.annualKwhProjected)} projected annually`
          }
        />
        <MetricCard
          icon={DollarSign}
          title="Annual cost"
          loading={pending}
          value={
            pending ? '' : formatCurrency(overview.estimatedAnnualCost, overview.currencySymbol)
          }
          subtitle={pending ? undefined : `at ${overview.currencySymbol}${overview.ratePerKwh}/kWh`}
        />
        <MetricCard
          icon={Leaf}
          title="CO₂e"
          loading={pending}
          value={pending ? '' : formatKgCo2e(overview.emissions?.periodKgCo2e, false)}
          subtitle={
            pending || !overview.emissions
              ? undefined
              : `${formatKgCo2e(overview.emissions.annualKgCo2eProjected, false)}/yr · ${
                  overview.emissions.factorIsDefault
                    ? 'US avg'
                    : (overview.emissions.region?.replace(/^eGRID /, '').split(' — ')[0] ??
                      'configured')
                }`
          }
        />
        <MetricCard
          icon={Gauge}
          title="Current draw"
          loading={pending}
          value={pending ? '' : formatWatts(overview.currentWatts)}
          subtitle={pending ? undefined : `peak ${formatWatts(overview.peakWatts)}`}
        />
        <MetricCard
          icon={TrendingDown}
          title="Average draw"
          loading={pending}
          value={pending ? '' : formatWatts(overview.avgWatts)}
          subtitle={pending ? undefined : 'per reporting AP'}
        />
        <MetricCard
          icon={Wifi}
          title="APs reporting"
          loading={pending}
          value={pending ? '' : `${overview.apWithDataCount}`}
          subtitle={pending ? undefined : 'with power telemetry'}
        />
        <MetricCard
          icon={TrendingUp}
          title="Daily forecast"
          loading={pending}
          value={pending ? '' : formatKwh(overview.dailyKwhProjected)}
          subtitle={pending ? undefined : 'projected kWh per day'}
        />
      </div>
    </div>
  );
}

export const EnergyOverviewCards = memo(EnergyOverviewCardsComponent);
