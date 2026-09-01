import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// The two protocol pages own their own API surfaces and are tested elsewhere;
// stub them so this test exercises only the shell (tabs, gate, deep links).
vi.mock('../ppsk', () => ({
  PpskPage: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="ppsk-page">ppsk embedded={String(!!embedded)}</div>
  ),
}));
vi.mock('../privateSae', () => ({
  PrivateSaePage: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="psae-page">psae embedded={String(!!embedded)}</div>
  ),
}));

import { PrivateCredentialsPage } from './PrivateCredentialsPage';

function mockPublicSettings(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(payload) })
  );
}

beforeEach(() => {
  mockPublicSettings({ ssoEnabled: false, cortexEnabled: false, privateSaeEnabled: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PrivateCredentialsPage', () => {
  it('renders the unified header with Organization scope and both protocol tabs', () => {
    render(<PrivateCredentialsPage />);
    expect(screen.getByRole('heading', { name: 'Private Credentials' })).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pre-Shared Keys (WPA2)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Private SAE (WPA3)' })).toBeInTheDocument();
  });

  it('defaults to the PPSK tab, embedded', () => {
    render(<PrivateCredentialsPage />);
    expect(screen.getByTestId('ppsk-page').textContent).toContain('embedded=true');
  });

  it('deep-links to the SAE tab via initialType (legacy configure-private-sae route)', () => {
    render(<PrivateCredentialsPage initialType="psae" />);
    expect(screen.getByTestId('psae-page').textContent).toContain('embedded=true');
  });

  it('shows the disabled panel instead of the SAE page when the server flag is off', async () => {
    mockPublicSettings({ ssoEnabled: false, cortexEnabled: false, privateSaeEnabled: false });
    render(<PrivateCredentialsPage initialType="psae" />);
    await waitFor(() =>
      expect(
        screen.getByText('Private SAE is not enabled on this deployment')
      ).toBeInTheDocument()
    );
    expect(screen.queryByTestId('psae-page')).not.toBeInTheDocument();
    // PPSK stays fully available.
    expect(screen.getByRole('tab', { name: 'Pre-Shared Keys (WPA2)' })).toBeEnabled();
  });

  it('keeps the SAE page rendered when the settings endpoint is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<PrivateCredentialsPage initialType="psae" />);
    expect(screen.getByTestId('psae-page')).toBeInTheDocument();
  });
});
