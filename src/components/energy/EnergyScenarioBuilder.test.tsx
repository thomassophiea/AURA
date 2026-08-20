import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnergyScenarioBuilder } from './EnergyScenarioBuilder';

vi.mock('@/hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    filters: { site: 'all', timeRange: '24h', environment: 'all' },
    updateFilter: () => {},
    updateFilters: () => {},
    resetFilters: () => {},
    resetFilter: () => {},
    hasActiveFilters: false,
  }),
}));

const postEnergyScenario = vi.fn();
vi.mock('@/services/energyService', () => ({
  postEnergyScenario: (...a: unknown[]) => postEnergyScenario(...a),
}));

const useLightAwarePolicy = vi.fn(() => ({
  data: null as unknown,
  loading: false,
  error: null,
  save: vi.fn(),
}));
vi.mock('@/hooks/useEnergyData', () => ({
  useLightAwarePolicy: () => useLightAwarePolicy(),
}));

describe('EnergyScenarioBuilder', () => {
  beforeEach(() => {
    postEnergyScenario.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('runs a scenario and displays savings', async () => {
    postEnergyScenario.mockResolvedValue({
      scenarioId: 'sc-1',
      currency: 'EUR',
      currencySymbol: '€',
      baseline: { kwh: 100, dailyProjected: 14, monthlyProjected: 420, annualProjected: 5110, estimatedAnnualCost: 715.4 },
      simulated: { kwh: 80, dailyProjected: 11.2, monthlyProjected: 336, annualProjected: 4088, estimatedAnnualCost: 572.3 },
      savings: { kwh: 20, percent: 20, dailyKwh: 2.8, monthlyKwh: 84, annualKwh: 1022, annualCost: 143.1 },
      apCount: 5,
      apWithDataCount: 5,
      computedAt: '2026-08-18T00:00:00Z',
    });
    render(<EnergyScenarioBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    await waitFor(() => expect(screen.getByText('20.0%')).toBeInTheDocument());
    expect(screen.getByText('€143.10/yr')).toBeInTheDocument();
    expect(postEnergyScenario).toHaveBeenCalledTimes(1);
  });

  it('shows an error if the scenario fails', async () => {
    const err = new Error('nope');
    postEnergyScenario.mockRejectedValue(err);
    render(<EnergyScenarioBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    await waitFor(() => expect(screen.getByText(/nope/)).toBeInTheDocument());
  });

  it('offers a Model Light-Aware policy toggle', () => {
    useLightAwarePolicy.mockReturnValue({
      data: { enabled: true, policy: { dark: { actions: [{ kind: 'disableRadio', band: '6' }] } } },
      loading: false,
      error: null,
      save: vi.fn(),
    });
    render(<EnergyScenarioBuilder />);
    expect(screen.getByText(/Model Light-Aware policy/i)).toBeInTheDocument();
  });

  it('includes the light-aware block in the submitted policy when toggled on', async () => {
    useLightAwarePolicy.mockReturnValue({
      data: { enabled: true, policy: { dark: { actions: [{ kind: 'disableRadio', band: '6' }] } } },
      loading: false,
      error: null,
      save: vi.fn(),
    });
    postEnergyScenario.mockResolvedValue({
      scenarioId: 'sc-2',
      baseline: { kwh: 1, dailyProjected: 1, monthlyProjected: 1, annualProjected: 1, estimatedAnnualCost: 1 },
      simulated: { kwh: 1, dailyProjected: 1, monthlyProjected: 1, annualProjected: 1, estimatedAnnualCost: 1 },
      savings: { kwh: 0, percent: 0, dailyKwh: 0, monthlyKwh: 0, annualKwh: 0, annualCost: 0 },
      apCount: 1,
      apWithDataCount: 1,
      computedAt: '2026-08-19T00:00:00Z',
    });
    render(<EnergyScenarioBuilder />);
    fireEvent.click(screen.getByLabelText(/Model Light-Aware policy/i));
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    await waitFor(() => expect(postEnergyScenario).toHaveBeenCalled());
    const submitted = postEnergyScenario.mock.calls[0][0].policy;
    expect(submitted.lightAware).toEqual({
      enabled: true,
      actionsByState: {
        dim: [],
        dark: [{ kind: 'disableRadio', band: '6' }],
      },
    });
  });
});
