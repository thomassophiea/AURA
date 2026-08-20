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
  if (loading || !recommendations) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No recommendations for this window — the fleet is already efficient, or there is not
          enough data yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {recommendations.map((rec) => (
        <Card key={rec.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground">{rec.title}</h4>
              <div className="flex gap-2">
                <Badge variant={rec.riskLevel === 'low' ? 'secondary' : 'outline'}>
                  {rec.riskLevel} risk
                </Badge>
                <Badge variant={CONFIDENCE_VARIANT[rec.confidenceLevel]}>
                  {rec.confidenceLevel} confidence
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{rec.explanation}</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>Affects <strong>{rec.affectedApCount}</strong> APs</span>
              <span>
                Saves <strong>{formatKwh(rec.annualSavingsKwh)}</strong>/yr ({formatPercent(rec.savingsPercent)})
              </span>
              <span><strong>{formatCurrency(rec.estimatedAnnualSaving, currencySymbol)}</strong>/yr</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const EnergyRecommendations = memo(EnergyRecommendationsComponent);
