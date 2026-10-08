import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnergyOverviewCards } from './EnergyOverviewCards';
import { EnergySiteRankings } from './EnergySiteRankings';
import { EnergyRecommendations } from './EnergyRecommendations';
import { LightAwareOptimization } from './LightAwareOptimization';
import * as energyHooks from '../../hooks/useEnergyData';
import * as apModelHooks from '../../hooks/useApModels';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => vi.restoreAllMocks());

const skeletons = (container: HTMLElement) =>
  container.querySelectorAll('[data-slot="skeleton"]').length;

describe('Energy cards never spin forever', () => {
  it('overview: renders the error with a retry, not skeletons', () => {
    const onRetry = vi.fn();
    const { container } = render(
      <EnergyOverviewCards overview={null} loading={false} error="Energy request failed: HTTP 500" onRetry={onRetry} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Energy overview could not be loaded/);
    expect(skeletons(container)).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('overview: still shows skeletons while a request is in flight', () => {
    const { container } = render(<EnergyOverviewCards overview={null} loading error={null} />);
    expect(skeletons(container)).toBeGreaterThan(0);
  });

  it('site rankings: error, then an empty state when data is null without an error', () => {
    const { container, rerender } = render(
      <EnergySiteRankings sites={null} loading={false} error="HTTP 502" onSelectSite={() => {}} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Site rankings could not be loaded/);
    expect(skeletons(container)).toBe(0);
    rerender(<EnergySiteRankings sites={null} loading={false} onSelectSite={() => {}} />);
    expect(screen.getByText(/No site data in range/)).toBeInTheDocument();
  });

  it('recommendations: error state and unevaluated-rule reasons', () => {
    const { container, rerender } = render(
      <EnergyRecommendations recommendations={null} loading={false} error="HTTP 500" />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Recommendations could not be loaded/);
    expect(skeletons(container)).toBe(0);

    rerender(
      <EnergyRecommendations
        recommendations={[]}
        loading={false}
        unevaluatedRules={[{ type: 'low_utilization_6ghz', reason: 'No 6 GHz channel-utilization telemetry.' }]}
      />
    );
    expect(screen.getByText(/Some checks could not run/)).toBeInTheDocument();
    expect(screen.getByText(/No 6 GHz channel-utilization telemetry/)).toBeInTheDocument();
    expect(screen.queryByText(/already efficient/)).not.toBeInTheDocument();
  });

  it('light-aware: a failed read is shown as an error, not "No sensor-capable APs"', () => {
    vi.spyOn(energyHooks, 'useLightAwareSummary').mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: () => {},
    });
    vi.spyOn(energyHooks, 'useLightAwareAps').mockReturnValue({
      data: null,
      loading: false,
      error: 'Energy request failed: Request failed',
      refetch: () => {},
    });
    vi.spyOn(apModelHooks, 'useApModels').mockReturnValue({
      modelBySerial: new Map(),
      loading: false,
    } as ReturnType<typeof apModelHooks.useApModels>);

    render(
      <LightAwareOptimization onConfigure={() => {}} onViewAps={() => {}} ratePerKwh={0.14} currencySymbol="$" />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Light-Aware data could not be loaded/);
    expect(screen.queryByText(/No sensor-capable APs/)).not.toBeInTheDocument();
  });
});
