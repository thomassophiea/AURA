import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EnergyOptimization } from './EnergyOptimization';
import type { EnergyOverview } from '@/types/energy';

interface OverviewState {
  data: EnergyOverview;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const overviewEmpty: OverviewState = {
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

const overviewWithData = {
  ...overviewEmpty,
  data: {
    ...overviewEmpty.data,
    apWithDataCount: 4,
    periodKwh: 10,
    annualKwhProjected: 521.43,
    estimatedAnnualCost: 73,
  },
};

let overviewState = overviewEmpty;
let recommendationState: unknown[] = [];

const serviceMocks = vi.hoisted(() => ({
  getEnergyPreferences: vi.fn().mockResolvedValue({
    currencyCode: 'USD',
    currencySymbol: '$',
    ratePerKwh: 0.14,
    emissionsFactorKgPerKwh: null,
  }),
  putEnergyPreferences: vi.fn(),
  getLatestEnvironmentalReport: vi.fn().mockRejectedValue(new Error('not found')),
  createEnvironmentalReport: vi.fn(),
}));
const pdfMocks = vi.hoisted(() => ({
  downloadEnvironmentalReportPdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/energyService', () => serviceMocks);
vi.mock('@/services/environmentalReportPdf', () => pdfMocks);

vi.mock('@/hooks/useEnergyData', () => ({
  useEnergyOverview: () => overviewState,
  useEnergySites: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useEnergyAps: () => ({ data: [], loading: false, error: null, refetch: () => {} }),
  useEnergyRecommendations: () => ({ data: recommendationState, loading: false, error: null, refetch: () => {} }),
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
    range: {
      startIso: '2026-08-16T00:00:00.000Z',
      endIso: '2026-08-17T00:00:00.000Z',
      label: 'Last 24 hours',
    },
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
  it('renders the no-data empty state for an OS-ONE site with no power', async () => {
    siteFilter = 'all';
    overviewState = overviewEmpty;
    recommendationState = [];
    render(<EnergyOptimization />);
    expect(screen.getByText(/No power data in this window/i)).toBeInTheDocument();
    await waitFor(() => expect(serviceMocks.getEnergyPreferences).toHaveBeenCalled());
  });

  it('opens report configuration with the current Energy context', async () => {
    siteFilter = 'all';
    overviewState = overviewWithData;
    recommendationState = [{
      id: 'rec-1',
      type: 'low_utilization_6ghz',
      title: 'Disable idle 6 GHz radios',
      annualSavingsKwh: 26,
      estimatedAnnualSaving: 3.64,
      confidenceLevel: 'high',
    }];
    render(<EnergyOptimization />);
    expect(screen.getByText(/Environmental Report/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Generate report/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('All sites')).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /Current dashboard period \(Last 24 hours\)/i })).toBeInTheDocument();
    expect(screen.getByText(/Partially Measured/i)).toBeInTheDocument();
    await waitFor(() => expect(serviceMocks.getEnergyPreferences).toHaveBeenCalled());
  });

  it('enables View latest only after a report exists', async () => {
    siteFilter = 'all';
    overviewState = overviewWithData;
    recommendationState = [];
    const latest = {
      reportId: '11111111-1111-4111-8111-111111111111',
      generatedAt: '2026-08-17T00:00:00.000Z',
    };
    serviceMocks.getLatestEnvironmentalReport.mockResolvedValueOnce(latest);

    render(<EnergyOptimization />);
    const button = await screen.findByRole('button', { name: /View latest/i });
    fireEvent.click(button);

    await waitFor(() =>
      expect(pdfMocks.downloadEnvironmentalReportPdf).toHaveBeenCalledWith(latest)
    );
  });

  it('gates with the OS ONE upsell when an XIQ site is selected', () => {
    siteFilter = 'xiq:sg1:loc1';
    overviewState = overviewEmpty;
    render(<EnergyOptimization />);
    expect(screen.getByText(/Energy analytics require an OS ONE Gateway/i)).toBeInTheDocument();
    expect(screen.getByText(/only for OS ONE Gateway APs/i)).toBeInTheDocument();
    // The data path must not render for an XIQ selection.
    expect(screen.queryByText(/No power data in this window/i)).not.toBeInTheDocument();
  });
});
