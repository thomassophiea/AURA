/**
 * RadiusServerTable — controller table behaviors from parity A1/A5/A6:
 * 5-column layout, per-row reorder/delete, 4-server New cap, and the acct
 * "add existing auth server IP" affordance. No live traffic: the table is a
 * pure controlled component.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// _kit's index re-exports useResourceCrud, which imports the Configure service
// layer whose api.ts singleton touches localStorage at module init. Mock it so
// these component tests stay hermetic — no live traffic (port brief gate).
vi.mock('../../../services/configure', () => ({
  ConfigureApiError: class ConfigureApiError extends Error {},
}));
import { RadiusServerTable } from './RadiusServerTable';
import { newRadiusServer, type AaaServerForm } from './aaaModel';

function server(ip: string, overrides: Partial<AaaServerForm> = {}): AaaServerForm {
  return { ...newRadiusServer('auth'), ipAddress: ip, sharedSecret: 'secret123', ...overrides };
}

describe('RadiusServerTable', () => {
  it('renders the 5 controller columns', () => {
    render(<RadiusServerTable radiusType="auth" servers={[server('10.0.0.1')]} onChange={vi.fn()} />);
    for (const col of ['Order', 'Server Address', 'Port', 'Retries', 'Timeout']) {
      expect(screen.getByText(col)).toBeInTheDocument();
    }
  });

  it('move down emits the reordered list (order = priority)', () => {
    const onChange = vi.fn();
    render(
      <RadiusServerTable
        radiusType="auth"
        servers={[server('10.0.0.1'), server('10.0.0.2')]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move server 10.0.0.1 down' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((s: AaaServerForm) => s.ipAddress)).toEqual([
      '10.0.0.2',
      '10.0.0.1',
    ]);
  });

  it('disables move up on the first row and move down on the last', () => {
    render(
      <RadiusServerTable
        radiusType="auth"
        servers={[server('10.0.0.1'), server('10.0.0.2')]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Move server 10.0.0.1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move server 10.0.0.2 down' })).toBeDisabled();
  });

  it('delete emits the list without the row', () => {
    const onChange = vi.fn();
    render(
      <RadiusServerTable
        radiusType="auth"
        servers={[server('10.0.0.1'), server('10.0.0.2')]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete server 10.0.0.1' }));
    expect(onChange.mock.calls[0][0].map((s: AaaServerForm) => s.ipAddress)).toEqual(['10.0.0.2']);
  });

  it('hides New once the list reaches 4 servers', () => {
    const four = ['1', '2', '3', '4'].map((n) => server(`10.0.0.${n}`));
    const { rerender } = render(
      <RadiusServerTable radiusType="auth" servers={four.slice(0, 3)} onChange={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /New/ })).toBeInTheDocument();
    rerender(<RadiusServerTable radiusType="auth" servers={four} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /New/ })).not.toBeInTheDocument();
  });

  it('hides New for the onboard-policy lockdown and when disabled', () => {
    render(
      <RadiusServerTable radiusType="auth" servers={[]} onChange={vi.fn()} hideNew />
    );
    expect(screen.queryByRole('button', { name: /New/ })).not.toBeInTheDocument();
  });

  it('offers the copy-from-auth select only when unused auth IPs exist (acct)', () => {
    const auth = [server('10.0.0.1'), server('10.0.0.2')];
    const { rerender } = render(
      <RadiusServerTable
        radiusType="acct"
        servers={[server('10.0.0.1', { port: 1813 })]}
        authServers={auth}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Add existing auth server IP:')).toBeInTheDocument();
    // Every auth IP already present -> the affordance disappears.
    rerender(
      <RadiusServerTable
        radiusType="acct"
        servers={auth.map((s) => ({ ...s, port: 1813 }))}
        authServers={auth}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('Add existing auth server IP:')).not.toBeInTheDocument();
  });

  it('never offers copy-from-auth on the auth table', () => {
    render(
      <RadiusServerTable
        radiusType="auth"
        servers={[]}
        authServers={[server('10.0.0.1')]}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('Add existing auth server IP:')).not.toBeInTheDocument();
  });

  it('opens the server dialog from New with acct defaults (port 1813)', () => {
    render(<RadiusServerTable radiusType="acct" servers={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /New/ }));
    expect(screen.getByText('New Accounting RADIUS Server')).toBeInTheDocument();
    expect(screen.getByLabelText('Port')).toHaveValue(1813);
  });

  it('saves an edited server through the dialog', () => {
    const onChange = vi.fn();
    render(
      <RadiusServerTable radiusType="auth" servers={[server('10.0.0.1')]} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit server 10.0.0.1' }));
    fireEvent.change(screen.getByLabelText('Server Address'), {
      target: { value: '10.0.0.99' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange.mock.calls[0][0][0].ipAddress).toBe('10.0.0.99');
  });
});
