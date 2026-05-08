import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServicesHealthSection } from './ServicesHealthSection';

describe('ServicesHealthSection', () => {
  it('renders the section title and description', () => {
    render(<ServicesHealthSection poorServices={[{ id: 'a', name: 'Service A' }]} />);
    expect(screen.getByText(/Services Requiring Attention/i)).toBeInTheDocument();
    expect(screen.getByText(/degraded performance/i)).toBeInTheDocument();
  });

  it('renders each poor service by name', () => {
    render(
      <ServicesHealthSection
        poorServices={[
          { id: 1, name: 'Voice WLAN' },
          { id: 2, name: 'Guest WLAN' },
        ]}
      />
    );
    expect(screen.getByText('Voice WLAN')).toBeInTheDocument();
    expect(screen.getByText('Guest WLAN')).toBeInTheDocument();
  });

  it('shows reliability percentage only when finite and < 95', () => {
    render(
      <ServicesHealthSection
        poorServices={[
          { id: 'a', name: 'A', reliability: 80 },
          { id: 'b', name: 'B', reliability: 99 },
          { id: 'c', name: 'C', reliability: undefined },
        ]}
      />
    );
    expect(screen.getByText(/Reliability: 80%/)).toBeInTheDocument();
    expect(screen.queryByText(/Reliability: 99%/)).not.toBeInTheDocument();
  });

  it('shows uptime percentage only when finite and < 95', () => {
    render(
      <ServicesHealthSection
        poorServices={[
          { id: 'a', name: 'A', uptime: 90 },
          { id: 'b', name: 'B', uptime: 100 },
        ]}
      />
    );
    expect(screen.getByText(/Uptime: 90%/)).toBeInTheDocument();
    expect(screen.queryByText(/Uptime: 100%/)).not.toBeInTheDocument();
  });

  it('renders a "Degraded" badge for every entry', () => {
    render(
      <ServicesHealthSection
        poorServices={[
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
        ]}
      />
    );
    expect(screen.getAllByText('Degraded')).toHaveLength(3);
  });

  it('renders nothing in the body when poorServices is empty', () => {
    // Note: caller is expected to gate via `showSection('services-health') &&
    // poorServices.length > 0`. The component itself just renders the empty
    // shell — confirming no runtime error and no service rows.
    const { container } = render(<ServicesHealthSection poorServices={[]} />);
    expect(container.querySelectorAll('.text-sm.font-medium').length).toBe(0);
  });
});
