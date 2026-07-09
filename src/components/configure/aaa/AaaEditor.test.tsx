/**
 * AaaEditor — NAI mode switch (A7), deny/reauth reveal semantics (A2-A4),
 * create-only NAI lock and canEdit gating (A9). Pure component tests; no
 * live traffic (the editor never talks to services).
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
import { AaaEditor } from './AaaEditor';
import type { AaaPolicy } from '../../../types/configure';

function seed(overrides: Partial<AaaPolicy> = {}): AaaPolicy {
  return {
    id: 'seed',
    canEdit: true,
    canDelete: true,
    name: '',
    policyType: 'Standard',
    healthCheck: 60,
    accountingStart: 'NoDelay',
    attributes: { calledStationId: 'WiredMacColonSsid', nasIpAddress: '0.0.0.0', nasId: '' },
    accountingInterimInterval: 60,
    includeFramedIp: false,
    includeMsgAuth: true,
    accountingType: 'StartInterimStop',
    authenticationType: 'PAP',
    reauthTimeoutOvr: 0,
    operatorName: '',
    operatorNamespace: 'None',
    denyOnAuthFailure: null,
    naiRealms: null,
    serverPoolingMode: 'failover',
    reportNasLocation: false,
    accountingAccessAlg: 'Broadcast',
    naiRouting: false,
    eventTimestamp: false,
    authenticationRadiusServers: [],
    accountingRadiusServers: [],
    ...overrides,
  } as AaaPolicy;
}

function renderNew(overrides: Partial<AaaPolicy> = {}) {
  const onSave = vi.fn();
  render(
    <AaaEditor
      open
      onOpenChange={vi.fn()}
      record={null}
      seed={seed(overrides)}
      saving={false}
      onSave={onSave}
    />
  );
  return { onSave };
}

function renderEdit(overrides: Partial<AaaPolicy> = {}) {
  const onSave = vi.fn();
  const record = seed({ id: 'p1', name: 'Policy1', ...overrides });
  render(
    <AaaEditor
      open
      onOpenChange={vi.fn()}
      record={record}
      seed={null}
      saving={false}
      onSave={onSave}
    />
  );
  return { onSave, record };
}

describe('AaaEditor NAI routing mode switch (A7)', () => {
  it('replaces server tables with realm entries and hides pooling when toggled on', () => {
    renderNew();
    expect(screen.getByText('RADIUS Authentication Servers')).toBeInTheDocument();
    expect(screen.getByText('Server Pooling')).toBeInTheDocument();
    expect(screen.queryByText('NAI Realm Entries')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'NAI Routing' }));

    expect(screen.getByText('NAI Realm Entries')).toBeInTheDocument();
    expect(screen.queryByText('RADIUS Authentication Servers')).not.toBeInTheDocument();
    expect(screen.queryByText('Server Pooling')).not.toBeInTheDocument();
  });

  it('locks the NAI Routing toggle after create', () => {
    renderEdit();
    expect(screen.getByRole('switch', { name: 'NAI Routing' })).toBeDisabled();
  });

  it('allows toggling NAI Routing on a new policy', () => {
    renderNew();
    expect(screen.getByRole('switch', { name: 'NAI Routing' })).toBeEnabled();
  });
});

describe('AaaEditor deny/reauth reveals (A2-A4)', () => {
  it('deny toggle reveals the three member inputs with in-range defaults', () => {
    renderNew();
    expect(screen.queryByLabelText('Consecutive failed Authentications')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Deny on repeated failed Authentications' }));
    expect(screen.getByLabelText('Consecutive failed Authentications')).toHaveValue(5);
    expect(
      screen.getByLabelText('Elapsed time for failed Authentications (seconds)')
    ).toHaveValue(5);
    expect(screen.getByLabelText('Quiet Timeout (seconds)')).toHaveValue(300);
  });

  it('renders deny checked from an existing populated object', () => {
    renderEdit({
      denyOnAuthFailure: { attempts: 3, interval: 2, timeout: 100 } as unknown as null,
    });
    expect(
      screen.getByRole('switch', { name: 'Deny on repeated failed Authentications' })
    ).toBeChecked();
    expect(screen.getByLabelText('Consecutive failed Authentications')).toHaveValue(3);
  });

  it('reauth override reveals the 60-300 input seeded at 60', () => {
    renderNew();
    expect(screen.queryByLabelText('Reauthentication Timeout (seconds)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Override Reauthentication Timeout' }));
    expect(screen.getByLabelText('Reauthentication Timeout (seconds)')).toHaveValue(60);
  });

  it('renders reauth checked when the record carries reauthTimeoutOvr > 0 (A4)', () => {
    renderEdit({ reauthTimeoutOvr: 120 });
    expect(
      screen.getByRole('switch', { name: 'Override Reauthentication Timeout' })
    ).toBeChecked();
    expect(screen.getByLabelText('Reauthentication Timeout (seconds)')).toHaveValue(120);
  });
});

describe('AaaEditor save payload semantics', () => {
  it('emits the deny object and reauth seconds on save', () => {
    const { onSave } = renderEdit({
      name: 'Policy1',
      attributes: { calledStationId: 'Bssid', nasIpAddress: '1.2.3.4', nasId: 'nas1' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Deny on repeated failed Authentications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.denyOnAuthFailure).toEqual({ attempts: 5, interval: 5, timeout: 300 });
    expect(payload.reauthTimeoutOvr).toBe(0);
    expect(payload.naiRealms).toBeNull();
  });

  it('gates Save while validation fails (missing NAS ID)', () => {
    renderEdit({ attributes: { calledStationId: 'Bssid', nasIpAddress: '1.2.3.4', nasId: '' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Event Timestamp' })); // make it dirty
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('AaaEditor lockdowns (A9)', () => {
  it('disables controls when canEdit is false', () => {
    renderEdit({ canEdit: false });
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Event Timestamp' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('applies the Local onboarding lockdowns', () => {
    renderEdit({ name: 'Local onboarding', canDelete: false });
    expect(screen.getByRole('switch', { name: 'Event Timestamp' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Include Framed-IP' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Report NAS Location' })).toBeDisabled();
    // Non-onboard-locked controls stay editable.
    expect(screen.getByLabelText('Name')).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Include Message Authenticator' })).toBeEnabled();
    // Server-table New buttons are hidden for the onboard policy.
    expect(screen.queryByRole('button', { name: /New/ })).not.toBeInTheDocument();
  });

  it('shows the policy-type badge', () => {
    renderEdit();
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });
});
