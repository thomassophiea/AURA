import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('EnergyScenarioBuilder', () => {
  beforeEach(() => {
    postEnergyScenario.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('runs a scenario and displays savings', async () => {
    postEnergyScenario.mockResolvedValue({
      scenarioId: 'sc-1',
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
    expect(postEnergyScenario).toHaveBeenCalledTimes(1);
  });

  it('shows an error if the scenario fails', async () => {
    const err = new Error('nope');
    postEnergyScenario.mockRejectedValue(err);
    render(<EnergyScenarioBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    await waitFor(() => expect(screen.getByText(/nope/)).toBeInTheDocument());
  });
});
