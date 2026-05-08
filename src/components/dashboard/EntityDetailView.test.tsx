import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the heavy delegated child components so we can verify dispatch
// without dragging their dependencies in.
vi.mock('../AccessPointDetail', () => ({
  AccessPointDetail: ({ serialNumber }: { serialNumber: string }) => (
    <div data-testid="ap-detail">{serialNumber}</div>
  ),
}));
vi.mock('../ClientDetail', () => ({
  ClientDetail: ({ macAddress }: { macAddress: string }) => (
    <div data-testid="client-detail">{macAddress}</div>
  ),
}));

import { EntityDetailView } from './EntityDetailView';

describe('EntityDetailView', () => {
  it('access-point: dispatches to AccessPointDetail with the entityId as serialNumber', () => {
    render(
      <EntityDetailView
        kind="access-point"
        entityId="SERIAL-123"
        entityName="AP-01"
        onBack={() => {}}
      />
    );
    const detail = screen.getByTestId('ap-detail');
    expect(detail.textContent).toBe('SERIAL-123');
  });

  it('client: dispatches to ClientDetail with the entityId as macAddress', () => {
    render(
      <EntityDetailView
        kind="client"
        entityId="aa:bb:cc:dd:ee:ff"
        entityName="iPhone-J"
        onBack={() => {}}
      />
    );
    const detail = screen.getByTestId('client-detail');
    expect(detail.textContent).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('switch: renders the placeholder card with the entity name in the body', () => {
    render(
      <EntityDetailView kind="switch" entityId="sw-01" entityName="Lobby-SW" onBack={() => {}} />
    );
    expect(screen.getByText(/Switch detail view for Lobby-SW/)).toBeInTheDocument();
  });

  it('switch: falls back to entityId in the body when entityName is missing', () => {
    render(<EntityDetailView kind="switch" entityId="sw-02" onBack={() => {}} />);
    expect(screen.getByText(/Switch detail view for sw-02/)).toBeInTheDocument();
  });

  it('renders the entityName as the heading when provided', () => {
    render(
      <EntityDetailView
        kind="access-point"
        entityId="x"
        entityName="Conference-AP"
        onBack={() => {}}
      />
    );
    expect(screen.getByRole('heading', { name: 'Conference-AP' })).toBeInTheDocument();
  });

  it('renders the per-kind fallback title when entityName is missing', () => {
    render(<EntityDetailView kind="client" entityId="x" onBack={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Client Details' })).toBeInTheDocument();
  });

  it('renders the per-kind subtitle copy', () => {
    render(<EntityDetailView kind="access-point" entityId="x" onBack={() => {}} />);
    expect(screen.getByText(/Detailed AP information/)).toBeInTheDocument();
  });

  it('fires onBack when the Back button is clicked', () => {
    const onBack = vi.fn();
    render(<EntityDetailView kind="access-point" entityId="x" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
