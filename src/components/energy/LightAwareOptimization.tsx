import { memo, useMemo } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLightAwareSummary, useLightAwareAps } from '@/hooks/useEnergyData';
import { useApModels } from '@/hooks/useApModels';
import { supportsLightSensor } from '@/lib/lightSensor';
import { LightAwareWhatIf } from './LightAwareWhatIf';

interface LightAwareOptimizationProps {
  onConfigure: () => void;
  onViewAps: () => void;
  ratePerKwh: number;
  currencySymbol: string;
}

function LightAwareOptimizationComponent({
  onConfigure,
  onViewAps,
  ratePerKwh,
  currencySymbol,
}: LightAwareOptimizationProps) {
  const summary = useLightAwareSummary();
  const apsState = useLightAwareAps(true);
  const { modelBySerial, loading: modelsLoading } = useApModels();

  const loading = summary.loading || apsState.loading || modelsLoading;

  // Sensor-capability derives from the AP MODEL (from controller inventory),
  // cross-referenced by serial against the light-aware power rows. The metric
  // store has no model, so this resolves client-side.
  const sensorCapableAps = useMemo(() => {
    const rows = apsState.data ?? [];
    return rows
      .filter((r) => supportsLightSensor(modelBySerial.get(r.serial)))
      .map((r) => ({ watts: r.currentWatts }));
  }, [apsState.data, modelBySerial]);

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
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : sensorCapableAps.length === 0 ? (
          <div className="space-y-3">
            <p className="py-6 text-center text-sm text-muted-foreground">
              No sensor-capable APs in range. Light-Aware Optimization requires APs with an onboard
              ambient-light sensor (AP4020, AP4060, or AP5020 families).
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <LightAwareWhatIf
              aps={sensorCapableAps}
              reportingCount={summary.data?.reportingCount ?? sensorCapableAps.length}
              ratePerKwh={ratePerKwh}
              currencySymbol={currencySymbol}
            />
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
