import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LightAwareOptimization } from './LightAwareOptimization';
import * as energyHooks from '../../hooks/useEnergyData';
import * as apModelHooks from '../../hooks/useApModels';
import type { LightAwareApRow, LightAwareSummary } from '../../types/energy';

// Radix Slider (inside the what-if panel) observes its track; jsdom lacks it.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => vi.restoreAllMocks());

const summary = (over: Partial<LightAwareSummary> = {}) => ({
  data: {
    sensorCapableCount: 0,
    reportingCount: 6,
    stateBreakdown: { bright: 0, dim: 0, dark: 0, unknown: 6 },
    policyEnabled: false,
    projectedAnnual: { kwh: null, cost: null },
    currency: 'USD',
    currencySymbol: '$',
    ...over,
  } as LightAwareSummary,
  loading: false,
  error: null,
  refetch: () => {},
});

const apRow = (serial: string, currentWatts: number): LightAwareApRow =>
  ({ serial, apName: serial, currentWatts }) as LightAwareApRow;

function props() {
  return { onConfigure: () => {}, onViewAps: () => {}, ratePerKwh: 0.14, currencySymbol: '$' };
}

describe('LightAwareOptimization', () => {
  it('renders the what-if for APs whose model has a light sensor', () => {
    vi.spyOn(energyHooks, 'useLightAwareSummary').mockReturnValue(summary());
    vi.spyOn(energyHooks, 'useLightAwareAps').mockReturnValue({
      data: [apRow('s1', 12), apRow('s2', 10)],
      loading: false,
      error: null,
      refetch: () => {},
    });
    vi.spyOn(apModelHooks, 'useApModels').mockReturnValue({
      // s1 is a sensor model, s2 is not → 1 sensor-capable of 6 reporting.
      modelBySerial: new Map([
        ['s1', 'AP5020'],
        ['s2', 'AP3000'],
      ]),
      loading: false,
    });
    render(<LightAwareOptimization {...props()} />);
    expect(screen.getByText('Sensor-capable APs').parentElement).toHaveTextContent(/1\s*\/\s*6/);
    expect(screen.getAllByRole('slider').length).toBe(2);
  });

  it('renders a no-sensor state when no AP model is sensor-capable', () => {
    vi.spyOn(energyHooks, 'useLightAwareSummary').mockReturnValue(summary());
    vi.spyOn(energyHooks, 'useLightAwareAps').mockReturnValue({
      data: [apRow('s1', 12)],
      loading: false,
      error: null,
      refetch: () => {},
    });
    vi.spyOn(apModelHooks, 'useApModels').mockReturnValue({
      modelBySerial: new Map([['s1', 'AP3000']]),
      loading: false,
    });
    render(<LightAwareOptimization {...props()} />);
    expect(screen.getByText(/No sensor-capable APs/i)).toBeInTheDocument();
  });
});
