import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LightAwarePolicyDialog } from './LightAwarePolicyDialog';
import * as hooks from '../../hooks/useEnergyData';

afterEach(() => vi.restoreAllMocks());

describe('LightAwarePolicyDialog', () => {
  it('renders Dim and Dark action sections when open', () => {
    vi.spyOn(hooks, 'useLightAwarePolicy').mockReturnValue({
      data: { enabled: false, policy: {} },
      loading: false,
      error: null,
      save: vi.fn(),
    });
    render(<LightAwarePolicyDialog open onOpenChange={() => {}} />);
    expect(screen.getByText(/When Dim/i)).toBeInTheDocument();
    expect(screen.getByText(/When Dark/i)).toBeInTheDocument();
  });
});
