import { memo } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatKwh, formatPercent, formatCurrency } from '@/lib/energyCalc';
import type { EnergyRecommendation, EnergyConfidence } from '@/types/energy';

const CONFIDENCE_VARIANT: Record<EnergyConfidence, 'secondary' | 'outline'> = {
  high: 'secondary',
  medium: 'outline',
  low: 'outline',
};

interface EnergyRecommendationsProps {
  recommendations: EnergyRecommendation[] | null;
  loading: boolean;
  currencySymbol?: string;
}

function EnergyRecommendationsComponent({
  recommendations,
  loading,
  currencySymbol = '$',
}: EnergyRecommendationsProps) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-foreground">Recommendations</h3>
      </CardHeader>
      <CardContent>
        {loading || !recommendations ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No recommendations for this window — the fleet is already efficient, or there is not
            enough data yet.
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {recommendations.map((rec) => (
              <div key={rec.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground">{rec.title}</h4>
                  <div className="flex shrink-0 gap-2">
                    <Badge variant={rec.riskLevel === 'low' ? 'secondary' : 'outline'}>
                      {rec.riskLevel} risk
                    </Badge>
                    <Badge variant={CONFIDENCE_VARIANT[rec.confidenceLevel]}>
                      {rec.confidenceLevel} confidence
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{rec.explanation}</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>Affects <strong>{rec.affectedApCount}</strong> APs</span>
                  <span>
                    Saves <strong>{formatKwh(rec.annualSavingsKwh)}</strong>/yr ({formatPercent(rec.savingsPercent)})
                  </span>
                  <span><strong>{formatCurrency(rec.estimatedAnnualSaving, currencySymbol)}</strong>/yr</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const EnergyRecommendations = memo(EnergyRecommendationsComponent);
