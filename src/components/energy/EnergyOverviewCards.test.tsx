import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyOverviewCards } from './EnergyOverviewCards';
import type { EnergyOverview } from '@/types/energy';

const overview: EnergyOverview = {
  apWithDataCount: 82,
  currentWatts: 1847.3,
  avgWatts: 1792.1,
  peakWatts: 2104.8,
  periodKwh: 301.4,
  dailyKwhProjected: 43.1,
  monthlyKwhProjected: 1292.3,
  annualKwhProjected: 15734.2,
  estimatedAnnualCost: 2202.79,
  currency: 'USD',
  currencySymbol: '$',
  ratePerKwh: 0.14,
  meta: { dataWindowDays: 7, earliestSampleAt: null, limitationsNotes: [] },
};

describe('EnergyOverviewCards', () => {
  it('renders formatted kWh and cost', () => {
    render(<EnergyOverviewCards overview={overview} loading={false} />);
    expect(screen.getByText('301.4 kWh')).toBeInTheDocument();
    expect(screen.getByText('$2,202.79')).toBeInTheDocument();
    expect(screen.getAllByText(/82/)).toHaveLength(1);
  });

  it('renders a dash instead of $NaN when cost is null', () => {
    render(
      <EnergyOverviewCards overview={{ ...overview, estimatedAnnualCost: null }} loading={false} />
    );
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows skeletons while loading', () => {
    const { container } = render(<EnergyOverviewCards overview={null} loading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });
});
