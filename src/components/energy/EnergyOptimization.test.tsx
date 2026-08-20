import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnergyOptimization } from './EnergyOptimization';

const overviewEmpty = {
  data: {
    apWithDataCount: 0,
    currentWatts: 0,
    avgWatts: 0,
    peakWatts: 0,
    periodKwh: 0,
    dailyKwhProjected: null,
    monthlyKwhProjected: null,
    annualKwhProjected: null,
    estimatedAnnualCost: null,
    currency: 'USD',
    currencySymbol: '$',
    ratePerKwh: 0.14,
    meta: { dataWindowDays: 0, earliestSampleAt: null, limitationsNotes: [] },
  },
  loading: false,
  error: null,
  refetch: () => {},
};

vi.mock('@/hooks/useEnergyData', () => ({
  useEnergyOverview: () => overviewEmpty,
  useEnergySites: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useEnergyAps: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useEnergyRecommendations: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useLightAwareSummary: () => ({ data: null, loading: false, error: null, refetch: () => {} }),
  useLightAwareAps: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useLightAwarePolicy: () => ({ data: null, loading: false, error: null, save: () => {} }),
}));

vi.mock('@/hooks/useApModels', () => ({
  useApModels: () => ({ modelBySerial: new Map(), loading: false }),
}));

vi.mock('@/hooks/useSiteNames', () => ({
  useSiteNames: () => ({ nameById: new Map(), loading: false }),
}));

vi.mock('@/hooks/useSelectedTimeRange', () => ({
  useSelectedTimeRange: () => ({
    token: '24h',
    setToken: () => {},
    optionGroups: [],
    dayStatuses: new Map(),
    retentionDays: 7,
    neverCollected: false,
  }),
}));

vi.mock('@/hooks/useSourceSites', () => ({
  useSourceSites: () => ({ sites: [], xiqSites: [] }),
}));

// Stub the picker — its Radix/AppContext deps aren't under test here.
vi.mock('@/components/SourceSiteSelector', () => ({
  SourceSiteSelector: () => null,
}));

let siteFilter = 'all';
vi.mock('@/hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    filters: { site: siteFilter, timeRange: '24h', environment: 'all' },
    updateFilter: () => {},
  }),
}));

describe('EnergyOptimization', () => {
  it('renders the no-data empty state for an OS-ONE site with no power', () => {
    siteFilter = 'all';
    render(<EnergyOptimization />);
    expect(screen.getByText(/No power data in this window/i)).toBeInTheDocument();
  });

  it('renders the Environmental Report widget with a Generate Report action', () => {
    siteFilter = 'all';
    render(<EnergyOptimization />);
    expect(screen.getByText(/Environmental Report/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate report/i })).toBeInTheDocument();
  });

  it('gates with the OS ONE upsell when an XIQ site is selected', () => {
    siteFilter = 'xiq:sg1:loc1';
    render(<EnergyOptimization />);
    expect(screen.getByText(/Energy analytics require an OS ONE Gateway/i)).toBeInTheDocument();
    expect(screen.getByText(/only for OS ONE Gateway APs/i)).toBeInTheDocument();
    // The data path must not render for an XIQ selection.
    expect(screen.queryByText(/No power data in this window/i)).not.toBeInTheDocument();
  });
});
