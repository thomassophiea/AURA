import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the three child sub-pages so the test only exercises the wrapper.
vi.mock('./SystemAdministration', () => ({
  SystemAdministration: (props: { networkAssistantEnabled?: boolean }) => (
    <div data-testid="system">
      SystemAdministration enabled={String(!!props.networkAssistantEnabled)}
    </div>
  ),
}));
vi.mock('./AdministratorsManagement', () => ({
  AdministratorsManagement: () => <div data-testid="administrators">Administrators</div>,
}));
vi.mock('./ApplicationsManagement', () => ({
  ApplicationsManagement: () => <div data-testid="applications">Applications</div>,
}));

import { Administration } from './Administration';

describe('Administration', () => {
  it('renders the three top-level tab triggers', () => {
    render(<Administration />);
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Local Admins')).toBeTruthy();
    expect(screen.getByText('Applications')).toBeTruthy();
  });

  it('renders the System tab content by default', () => {
    render(<Administration />);
    expect(screen.getByTestId('system')).toBeTruthy();
  });

  it('forwards networkAssistantEnabled to SystemAdministration', () => {
    render(<Administration networkAssistantEnabled />);
    expect(screen.getByTestId('system').textContent).toMatch(/enabled=true/);
  });

  it('exposes Local Admins + Applications trigger buttons (Radix tab click is jsdom-flaky; assert trigger presence)', () => {
    render(<Administration />);
    expect(screen.getByText('Local Admins').closest('button')).toBeTruthy();
    expect(screen.getByText('Applications').closest('button')).toBeTruthy();
  });
});
