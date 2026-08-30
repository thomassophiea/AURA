import { memo } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatWatts, formatCurrency } from '@/lib/energyCalc';
import { useEnergyAps } from '@/hooks/useEnergyData';

interface EnergyApTableProps {
  enabled: boolean;
  currencySymbol?: string;
}

function EnergyApTableComponent({ enabled, currencySymbol = '$' }: EnergyApTableProps) {
  const { data: aps, loading, error } = useEnergyAps(enabled);

  if (!enabled) return null;

  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-foreground">Access Points</h3>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : loading || !aps ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : aps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No AP data in range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">AP</th>
                <th className="py-2 font-medium">Avg</th>
                <th className="py-2 font-medium">Peak</th>
                <th className="py-2 font-medium">Energy</th>
                <th className="py-2 font-medium">Annual cost</th>
                <th className="py-2 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {aps.map((ap) => (
                <tr key={ap.serial} className="border-b border-border/50">
                  <td className="py-2 font-medium text-foreground">{ap.apName}</td>
                  <td className="py-2 text-muted-foreground">{formatWatts(ap.avgWatts)}</td>
                  <td className="py-2 text-muted-foreground">{formatWatts(ap.peakWatts)}</td>
                  <td className="py-2 text-foreground">{formatKwh(ap.totalKwh)}</td>
                  <td className="py-2 text-foreground">
                    {formatCurrency(ap.estimatedAnnualCost, currencySymbol)}
                  </td>
                  <td className="py-2">
                    <Badge variant={ap.dataQuality === 'ok' ? 'secondary' : 'outline'}>
                      {ap.dataQuality === 'ok' ? 'OK' : 'Sparse'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export const EnergyApTable = memo(EnergyApTableComponent);
