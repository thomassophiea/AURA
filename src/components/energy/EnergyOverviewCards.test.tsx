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

describe('EnergyOverviewCards — carbon', () => {
  it('shows CO2e and flags the US-average default factor', () => {
    render(
      <EnergyOverviewCards
        overview={{
          ...overview,
          emissions: {
            periodKgCo2e: 3.5164,
            annualKgCo2eProjected: 1283.5,
            factorKgPerKwh: 0.35164,
            factorIsDefault: true,
            source: 'EPA eGRID2023',
            region: 'eGRID US Average',
            year: 2023,
          },
        }}
        loading={false}
      />
    );
    expect(screen.getByText('3.52 kg CO₂e')).toBeInTheDocument();
    expect(screen.getByText(/1\.28 t CO₂e\/yr · US avg grid \(default\)/)).toBeInTheDocument();
  });

  it('names the configured eGRID region', () => {
    render(
      <EnergyOverviewCards
        overview={{
          ...overview,
          emissions: {
            periodKgCo2e: 2459,
            annualKgCo2eProjected: 9000,
            factorKgPerKwh: 0.245,
            factorIsDefault: false,
            source: 'EPA eGRID2023',
            region: 'eGRID NEWE — NPCC New England',
            year: 2023,
          },
        }}
        loading={false}
      />
    );
    expect(screen.getByText('2.46 t CO₂e')).toBeInTheDocument();
    expect(screen.getByText(/NPCC New England/)).toBeInTheDocument();
  });
});
