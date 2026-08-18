import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyOptimization } from './EnergyOptimization';

vi.mock('@/hooks/useEnergyData', () => ({
  useEnergyOverview: () => ({
    data: {
      apWithDataCount: 0,
      currentWatts: 0, avgWatts: 0, peakWatts: 0, periodKwh: 0,
      dailyKwhProjected: null, monthlyKwhProjected: null, annualKwhProjected: null,
      estimatedAnnualCost: null, currency: 'USD', currencySymbol: '$', ratePerKwh: 0.14,
      meta: { dataWindowDays: 0, earliestSampleAt: null, limitationsNotes: [] },
    },
    loading: false, error: null, refetch: () => {},
  }),
  useEnergySites: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useEnergyAps: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useEnergyRecommendations: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
}));

describe('EnergyOptimization', () => {
  it('renders the empty state when no APs report power', () => {
    render(<EnergyOptimization />);
    expect(screen.getByText(/No power data in this window/i)).toBeInTheDocument();
  });
});
