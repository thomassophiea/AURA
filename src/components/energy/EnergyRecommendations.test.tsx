import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EnergyRecommendations } from './EnergyRecommendations';
import type { EnergyRecommendation } from '@/types/energy';

const recommendation: EnergyRecommendation = {
  id: 'rec-1',
  type: 'low_utilization_6ghz',
  scope: 'fleet',
  title: 'Disable idle 6 GHz radios',
  explanation: 'Modeled from observed utilization.',
  affectedApCount: 2,
  baselineKwh: 10,
  projectedKwh: 8,
  savingsKwh: 2,
  annualSavingsKwh: 104.3,
  savingsPercent: 20,
  estimatedAnnualSaving: 31.29,
  riskLevel: 'low',
  confidenceLevel: 'high',
  supportingData: {},
};

describe('EnergyRecommendations', () => {
  it('pairs annual energy savings with annual cost in the configured currency', () => {
    render(
      <EnergyRecommendations
        recommendations={[recommendation]}
        loading={false}
        currencySymbol="€"
      />
    );

    expect(screen.getByText(/104.3 kWh/).closest('span')).toHaveTextContent('104.3 kWh/yr');
    expect(screen.getByText('€31.29')).toBeInTheDocument();
  });
});