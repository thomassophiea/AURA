import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfraOsOneGate } from './InfraOsOneGate';

describe('InfraOsOneGate', () => {
  it('renders the OS ONE upgrade upsell for infrastructure monitoring', () => {
    render(<InfraOsOneGate />);
    expect(
      screen.getByText(/Infrastructure health monitoring requires an OS ONE Gateway/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Upgrade this Site to OS ONE/i)).toBeInTheDocument();
  });
});
