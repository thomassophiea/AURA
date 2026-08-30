import { memo } from 'react';
import { Zap, DollarSign, TrendingDown, TrendingUp, Wifi, Gauge } from 'lucide-react';

import { MetricCard } from '@/components/ui/MetricCard';
import { formatKwh, formatWatts, formatCurrency } from '@/lib/energyCalc';
import type { EnergyOverview } from '@/types/energy';

interface EnergyOverviewCardsProps {
  overview: EnergyOverview | null;
  loading: boolean;
}

function EnergyOverviewCardsComponent({ overview, loading }: EnergyOverviewCardsProps) {
  const pending = loading || !overview;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        icon={Zap}
        title="Energy used"
        loading={pending}
        value={pending ? '' : formatKwh(overview.periodKwh)}
        subtitle={pending ? undefined : `${formatKwh(overview.annualKwhProjected)} projected annually`}
      />
      <MetricCard
        icon={DollarSign}
        title="Annual cost"
        loading={pending}
        value={pending ? '' : formatCurrency(overview.estimatedAnnualCost, overview.currencySymbol)}
        subtitle={pending ? undefined : `at ${overview.currencySymbol}${overview.ratePerKwh}/kWh`}
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
  );
}

export const EnergyOverviewCards = memo(EnergyOverviewCardsComponent);
