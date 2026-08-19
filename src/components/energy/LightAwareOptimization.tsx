import { memo } from 'react';
import { Sun, SunDim, MoonStar, HelpCircle } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatCurrency } from '@/lib/energyCalc';
import { useLightAwareSummary } from '@/hooks/useEnergyData';
import type { LightState } from '@/types/energy';

interface LightAwareOptimizationProps {
  onConfigure: () => void;
  onViewAps: () => void;
}

const STATE_ROWS: { key: LightState; label: string; Icon: typeof Sun }[] = [
  { key: 'bright', label: 'Bright', Icon: Sun },
  { key: 'dim', label: 'Dim', Icon: SunDim },
  { key: 'dark', label: 'Dark', Icon: MoonStar },
  { key: 'unknown', label: 'Unknown', Icon: HelpCircle },
];

function LightAwareOptimizationComponent({
  onConfigure,
  onViewAps,
}: LightAwareOptimizationProps) {
  const { data, loading } = useLightAwareSummary();

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Light-Aware Optimization</h3>
            <p className="text-xs text-muted-foreground">
              Model AP energy savings from ambient-light state
            </p>
          </div>
          <Badge variant="secondary">Modeled</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : data.sensorCapableCount === 0 ? (
          <div className="space-y-3">
            <p className="py-6 text-center text-sm text-muted-foreground">
              No sensor-capable APs in range. Light-Aware Optimization requires APs with an
              onboard ambient-light sensor.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sensor-capable APs</span>
              <span className="text-sm font-semibold text-foreground">
                {data.sensorCapableCount} / {data.reportingCount}
              </span>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current state
              </p>
              <ul className="space-y-1">
                {STATE_ROWS.map(({ key, label, Icon }) => (
                  <li key={key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      <Icon className="size-4 text-muted-foreground" />
                      {label}
                    </span>
                    <span className="text-muted-foreground">{data.stateBreakdown[key] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Light-aware policy</span>
              <Badge variant={data.policyEnabled ? 'success' : 'secondary'}>
                {data.policyEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Projected annual savings</span>
                <Badge variant="info">Projected</Badge>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-foreground">
                  {formatCurrency(data.projectedAnnual.cost, data.currencySymbol)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatKwh(data.projectedAnnual.kwh)}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onConfigure}>
                Configure
              </Button>
              <Button variant="outline" size="sm" onClick={onViewAps}>
                View APs
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Actions are modeled / not currently executable.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const LightAwareOptimization = memo(LightAwareOptimizationComponent);
