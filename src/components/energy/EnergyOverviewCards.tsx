import { memo } from 'react';
import { Zap, DollarSign, TrendingDown, TrendingUp, Wifi, Gauge } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatWatts, formatCurrency } from '@/lib/energyCalc';
import type { EnergyOverview } from '@/types/energy';

interface EnergyOverviewCardsProps {
  overview: EnergyOverview | null;
  loading: boolean;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function EnergyOverviewCardsComponent({ overview, loading }: EnergyOverviewCardsProps) {
  if (loading || !overview) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const TrendIcon = TrendingDown;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        icon={Zap}
        label="Energy this period"
        value={formatKwh(overview.periodKwh)}
        sub={`${formatKwh(overview.annualKwhProjected)} projected annually`}
      />
      <StatCard
        icon={DollarSign}
        label="Estimated annual cost"
        value={formatCurrency(overview.estimatedAnnualCost, overview.currencySymbol)}
        sub={`at ${overview.currencySymbol}${overview.ratePerKwh}/kWh`}
      />
      <StatCard
        icon={Gauge}
        label="Current draw"
        value={formatWatts(overview.currentWatts)}
        sub={`peak ${formatWatts(overview.peakWatts)}`}
      />
      <StatCard
        icon={TrendIcon}
        label="Average draw"
        value={formatWatts(overview.avgWatts)}
      />
      <StatCard
        icon={Wifi}
        label="APs reporting"
        value={`${overview.apWithDataCount}`}
        sub="with power telemetry"
      />
      <StatCard
        icon={TrendingUp}
        label="Daily projection"
        value={formatKwh(overview.dailyKwhProjected)}
      />
    </div>
  );
}

export const EnergyOverviewCards = memo(EnergyOverviewCardsComponent);
