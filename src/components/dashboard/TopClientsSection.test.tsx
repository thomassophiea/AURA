import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopClientsSection, type TopClient } from './TopClientsSection';

const client = (overrides: Partial<TopClient> = {}): TopClient => ({
  name: 'iPhone-Sam',
  mac: 'aa:bb:cc:dd:ee:01',
  throughput: 10_000_000,
  upload: 4_000_000,
  download: 6_000_000,
  network: 'Corp-Wifi',
  ap: 'AP-Lobby-01',
  rssi: -55,
  band: '5GHz',
  ipAddress: '10.0.0.42',
  vendor: 'Apple, Inc.',
  ...overrides,
});

describe('TopClientsSection', () => {
  it('renders the title and description', () => {
    render(
      <TopClientsSection
        topClients={[client()]}
        collapsed={false}
        onToggleCollapse={() => {}}
        vendorLookupsInProgress={false}
        onClientClick={() => {}}
      />
    );
    expect(screen.getByText(/Top Clients by Throughput/i)).toBeInTheDocument();
    expect(screen.getByText(/Real-time bandwidth usage/)).toBeInTheDocument();
  });

  it('renders one card per client', () => {
    render(
      <TopClientsSection
        topClients={[
          client({ mac: 'aa:bb:cc:dd:ee:01', name: 'A' }),
          client({ mac: 'aa:bb:cc:dd:ee:02', name: 'B' }),
          client({ mac: 'aa:bb:cc:dd:ee:03', name: 'C' }),
        ]}
        collapsed={false}
        onToggleCollapse={() => {}}
        vendorLookupsInProgress={false}
        onClientClick={() => {}}
      />
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('hides the body when collapsed=true', () => {
    render(
      <TopClientsSection
        topClients={[client({ name: 'Hidden' })]}
        collapsed={true}
        onToggleCollapse={() => {}}
        vendorLookupsInProgress={false}
        onClientClick={() => {}}
      />
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('fires onToggleCollapse when the chevron button is clicked', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <TopClientsSection
        topClients={[client()]}
        collapsed={false}
        onToggleCollapse={onToggle}
        vendorLookupsInProgress={false}
        onClientClick={() => {}}
      />
    );
    // The toggle button has only an icon — pick by querying the buttons in the
    // header. There's exactly one button in the visible state.
    const buttons = container.querySelectorAll('button');
    fireEvent.click(buttons[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the loading-vendor indicator when vendorLookupsInProgress=true', () => {
    render(
      <TopClientsSection
        topClients={[client()]}
        collapsed={false}
        onToggleCollapse={() => {}}
        vendorLookupsInProgress={true}
        onClientClick={() => {}}
      />
    );
    expect(screen.getByText(/Loading device info/)).toBeInTheDocument();
  });

  it('fires onClientClick with the client object when a row is clicked', () => {
    const onClick = vi.fn();
    const c = client({ name: 'Phone-X' });
    render(
      <TopClientsSection
        topClients={[c]}
        collapsed={false}
        onToggleCollapse={() => {}}
        vendorLookupsInProgress={false}
        onClientClick={onClick}
      />
    );
    fireEvent.click(screen.getByText('Phone-X'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Phone-X' }));
  });

  it('does not render the IP when ipAddress is "N/A"', () => {
    render(
      <TopClientsSection
        topClients={[client({ ipAddress: 'N/A' })]}
        collapsed={false}
        onToggleCollapse={() => {}}
        vendorLookupsInProgress={false}
        onClientClick={() => {}}
      />
    );
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('does not render the vendor italic line when vendor is "Unknown Vendor"', () => {
    render(
      <TopClientsSection
        topClients={[client({ vendor: 'Unknown Vendor' })]}
        collapsed={false}
        onToggleCollapse={() => {}}
        vendorLookupsInProgress={false}
        onClientClick={() => {}}
      />
    );
    // The italic vendor line is the only place "Unknown Vendor" would appear,
    // so its absence confirms gating.
    expect(screen.queryByText('Unknown Vendor')).not.toBeInTheDocument();
  });

  it('renders zero-throughput clients without dividing-by-zero artifacts in the bar', () => {
    const { container } = render(
      <TopClientsSection
        topClients={[client({ throughput: 0, upload: 0, download: 0 })]}
        collapsed={false}
        onToggleCollapse={() => {}}
        vendorLookupsInProgress={false}
        onClientClick={() => {}}
      />
    );
    // Bar widths should be 0% (or at least not NaN%).
    const styles = Array.from(container.querySelectorAll('[style*="width"]'))
      .map((el) => (el as HTMLElement).style.width)
      .join(' ');
    expect(styles).not.toContain('NaN');
  });
});
