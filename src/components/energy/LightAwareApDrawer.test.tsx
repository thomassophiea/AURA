import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LightAwareApDrawer } from './LightAwareApDrawer';
import * as hooks from '../../hooks/useEnergyData';

afterEach(() => vi.restoreAllMocks());

describe('LightAwareApDrawer', () => {
  it('lists AP rows with light state and modeled savings', () => {
    vi.spyOn(hooks, 'useLightAwareAps').mockReturnValue({
      data: [
        {
          serial: 'A',
          apName: 'AP-A',
          siteId: 's1',
          model: 'AP5020',
          sensorCapable: true,
          lightState: 'dark',
          dwellSeconds: 3600,
          policyEnabled: true,
          currentWatts: 20,
          optimizedWatts: 15,
          savingsWatts: 5,
        },
      ],
      loading: false,
      error: null,
      refetch: () => {},
    });
    render(<LightAwareApDrawer open onOpenChange={() => {}} />);
    expect(screen.getByText('AP-A')).toBeInTheDocument();
    expect(screen.getByText(/dark/i)).toBeInTheDocument();
  });
});
