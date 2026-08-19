import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LightAwareOptimization } from './LightAwareOptimization';
import * as hooks from '../../hooks/useEnergyData';

afterEach(() => vi.restoreAllMocks());

describe('LightAwareOptimization', () => {
  it('shows sensor-capable ratio and state counts from real data', () => {
    vi.spyOn(hooks, 'useLightAwareSummary').mockReturnValue({
      data: {
        sensorCapableCount: 4,
        reportingCount: 6,
        stateBreakdown: { bright: 2, dim: 1, dark: 1, unknown: 2 },
        policyEnabled: true,
        projectedAnnual: { kwh: 123, cost: 17.22 },
        currency: 'USD',
        currencySymbol: '$',
      },
      loading: false,
      error: null,
      refetch: () => {},
    });
    render(<LightAwareOptimization onConfigure={() => {}} onViewAps={() => {}} />);
    expect(screen.getByText('4 / 6')).toBeInTheDocument();
    expect(screen.getByText(/Bright/)).toBeInTheDocument();
  });

  it('renders a no-sensor state when no APs are sensor-capable', () => {
    vi.spyOn(hooks, 'useLightAwareSummary').mockReturnValue({
      data: {
        sensorCapableCount: 0,
        reportingCount: 3,
        stateBreakdown: { bright: 0, dim: 0, dark: 0, unknown: 3 },
        policyEnabled: false,
        projectedAnnual: { kwh: null, cost: null },
        currency: 'USD',
        currencySymbol: '$',
      },
      loading: false,
      error: null,
      refetch: () => {},
    });
    render(<LightAwareOptimization onConfigure={() => {}} onViewAps={() => {}} />);
    expect(screen.getByText(/No sensor-capable APs/i)).toBeInTheDocument();
  });
});
