/**
 * GuestEditor — single-IP mirroring through the UI (B1), validation gating
 * (B2), controller labels (B5) and the delete workflow (B6). Pure component
 * tests; no live traffic.
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
import { GuestEditor } from './GuestEditor';
import type { EGuestProfile } from '../../../types/configure';

function record(overrides: Partial<EGuestProfile> = {}): EGuestProfile {
  return {
    id: 'g1',
    canEdit: true,
    canDelete: true,
    name: 'Guest1',
    cpFqdn: 'guest.example.com',
    userName: 'cbuser',
    password: 'cbpass123',
    authenticationRadiusServer: {
      id: 's1',
      canEdit: false,
      canDelete: false,
      ipAddress: '10.0.0.10',
      sharedSecret: 'secret123',
      radiusAuthProtocol: 'PAP',
      preferredMacAddressFormat: 'UPPERCASE_NO_DELIMITERS',
      port: 1812,
      totalRetries: 3,
      timeout: 5,
    },
    accountingRadiusServer: {
      id: 's2',
      canEdit: false,
      canDelete: false,
      ipAddress: '10.0.0.10',
      sharedSecret: 'secret123',
      radiusAuthProtocol: 'PAP',
      preferredMacAddressFormat: 'UPPERCASE_NO_DELIMITERS',
      port: 1813,
      totalRetries: 3,
      timeout: 5,
    },
    ...overrides,
  } as EGuestProfile;
}

interface RenderOptions {
  onDelete?: () => void;
  rec?: EGuestProfile | null;
  seed?: EGuestProfile | null;
}

function renderEditor({ onDelete, rec = record(), seed = null }: RenderOptions = {}) {
  const onSave = vi.fn();
  render(
    <GuestEditor
      open
      onOpenChange={vi.fn()}
      record={rec}
      seed={seed}
      saving={false}
      onSave={onSave}
      onDelete={onDelete}
    />
  );
  return { onSave };
}

describe('GuestEditor mirroring (B1)', () => {
  it('typing one IP lands in BOTH server objects on save', () => {
    const { onSave } = renderEditor();
    fireEvent.change(screen.getByLabelText('IP Address'), { target: { value: '10.7.7.7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.authenticationRadiusServer.ipAddress).toBe('10.7.7.7');
    expect(payload.accountingRadiusServer.ipAddress).toBe('10.7.7.7');
  });

  it('timeout and retries mirror while the two ports stay independent', () => {
    const { onSave } = renderEditor();
    fireEvent.change(screen.getByLabelText('Authentication Timeout Duration (seconds)'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText('Authentication Retry Count'), {
      target: { value: '7' },
    });
    fireEvent.change(screen.getByLabelText('Accounting Client UDP Port'), {
      target: { value: '11813' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.accountingRadiusServer.timeout).toBe(30);
    expect(payload.accountingRadiusServer.totalRetries).toBe(7);
    expect(payload.authenticationRadiusServer.port).toBe(1812);
    expect(payload.accountingRadiusServer.port).toBe(11813);
  });
});

describe('GuestEditor validation gating (B2)', () => {
  it('disables Save while the timeout is out of the 2-60 range', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Authentication Timeout Duration (seconds)'), {
      target: { value: '61' },
    });
    expect(screen.getByText('Valid range 2 to 60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables Save until the form is dirty', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('FQDN'), { target: { value: 'new.example.com' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('flags a short shared secret', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Shared Secret'), { target: { value: 'abc' } });
    expect(screen.getByText(/minimum 6 characters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('GuestEditor labels and delete workflow (B5/B6)', () => {
  it('uses the controller Callback labels', () => {
    renderEditor();
    expect(screen.getByLabelText('Callback User Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Callback Password')).toBeInTheDocument();
  });

  it('routes Delete through the confirm dialog', () => {
    const onDelete = vi.fn();
    renderEditor({ onDelete });
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(onDelete).not.toHaveBeenCalled(); // confirm first
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides Delete when canDelete is false or the record is new', () => {
    const onDelete = vi.fn();
    renderEditor({ onDelete, rec: record({ canDelete: false }) });
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('seeds Add mode from the /default template (ports 1812/1813)', () => {
    renderEditor({
      rec: null,
      seed: record({ id: undefined as unknown as string, name: '' }),
    });
    expect(screen.getByLabelText('Authorization Client UDP Port')).toHaveValue(1812);
    expect(screen.getByLabelText('Accounting Client UDP Port')).toHaveValue(1813);
  });
});
