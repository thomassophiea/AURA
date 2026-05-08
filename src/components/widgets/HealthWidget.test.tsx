import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthWidget, NetworkHealthWidget } from './HealthWidget';

describe('HealthWidget', () => {
  it('renders empty state when metrics are missing', () => {
    render(<HealthWidget title="X" metrics={[]} />);
    expect(screen.getByText('No data available')).toBeTruthy();
  });

  it('renders each metric label + value', () => {
    render(
      <HealthWidget
        title="Status"
        metrics={[
          { label: 'Active', value: 5, status: 'good' },
          { label: 'Issues', value: 1, status: 'critical' },
        ]}
      />
    );
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Issues')).toBeTruthy();
  });

  it('renders "value / total" when total is provided', () => {
    render(
      <HealthWidget title="X" metrics={[{ label: 'Online', value: 5, total: 8, status: 'good' }]} />
    );
    expect(screen.getByText('/ 8')).toBeTruthy();
  });

  it('omits the "/ total" when total is undefined', () => {
    render(<HealthWidget title="X" metrics={[{ label: 'A', value: 5, status: 'good' }]} />);
    expect(screen.queryByText(/^\/\s/)).toBeNull();
  });

  it.each([
    ['good', 'text-green-500'],
    ['warning', 'text-amber-500'],
    ['critical', 'text-red-500'],
  ] as const)('uses %s status color', (status, expectedClass) => {
    const { container } = render(
      <HealthWidget title="X" metrics={[{ label: 'A', value: 1, status }]} />
    );
    expect(container.querySelector(`.${expectedClass}`)).toBeTruthy();
  });
});

describe('NetworkHealthWidget', () => {
  const baseData = {
    primaryActiveAPs: 8,
    backupActiveAPs: 2,
    inactiveAPs: 0,
    lowPowerAPs: 0,
    globalSyncStatus: 'Synchronized',
    mobilityStatus: true,
    linkStatus: 'Up',
    activeSWs: 4,
    inactiveSWs: 0,
    troubleSWs: 0,
  };

  it('renders default title "Network Health"', () => {
    render(<NetworkHealthWidget data={baseData} />);
    expect(screen.getByText('Network Health')).toBeTruthy();
  });

  it('honors a custom title', () => {
    render(<NetworkHealthWidget title="HQ Health" data={baseData} />);
    expect(screen.getByText('HQ Health')).toBeTruthy();
  });

  it('shows the active APs over total ratio', () => {
    render(<NetworkHealthWidget data={baseData} />);
    expect(screen.getByText('Active APs')).toBeTruthy();
    // active = 10, total = 10 (no inactive)
    expect(screen.getAllByText('/ 10').length).toBeGreaterThan(0);
  });

  it('renders "Trouble Switches" only when troubleSWs > 0', () => {
    const { rerender } = render(<NetworkHealthWidget data={baseData} />);
    expect(screen.queryByText('Trouble Switches')).toBeNull();
    rerender(<NetworkHealthWidget data={{ ...baseData, troubleSWs: 2 }} />);
    expect(screen.getByText('Trouble Switches')).toBeTruthy();
  });

  it('Global Sync Status uses green when "Synchronized"', () => {
    const { container } = render(<NetworkHealthWidget data={baseData} />);
    const syncRow = screen.getByText('Synchronized');
    expect(syncRow.className).toContain('text-green-500');
    // sanity check: non-synced flips to amber
    container.remove();
  });

  it('Global Sync Status uses amber when not synced', () => {
    render(<NetworkHealthWidget data={{ ...baseData, globalSyncStatus: 'Pending' }} />);
    const el = screen.getByText('Pending');
    expect(el.className).toContain('text-amber-500');
  });

  it('Mobility Status: Enabled (green) vs Disabled (muted)', () => {
    const { rerender } = render(<NetworkHealthWidget data={baseData} />);
    expect(screen.getByText('Enabled').className).toContain('text-green-500');
    rerender(<NetworkHealthWidget data={{ ...baseData, mobilityStatus: false }} />);
    expect(screen.getByText('Disabled').className).toContain('text-muted-foreground');
  });

  it('AP health flips to warning when there are inactive APs', () => {
    const { container } = render(<NetworkHealthWidget data={{ ...baseData, inactiveAPs: 1 }} />);
    expect(container.querySelector('.text-amber-500')).toBeTruthy();
  });

  it('AP health flips to critical when inactive ratio > 20%', () => {
    const { container } = render(
      <NetworkHealthWidget
        data={{ ...baseData, primaryActiveAPs: 5, backupActiveAPs: 0, inactiveAPs: 5 }}
      />
    );
    expect(container.querySelector('.text-red-500')).toBeTruthy();
  });

  it('renders linkStatus as plain text', () => {
    render(<NetworkHealthWidget data={{ ...baseData, linkStatus: 'Degraded' }} />);
    expect(screen.getByText('Degraded')).toBeTruthy();
  });
});
