import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AppContextProvider, useAppContext } from './AppContext';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    isAuthenticated: () => true,
    setBaseUrl: vi.fn(),
    getBaseUrl: vi.fn(() => '/api/management'),
    getControllerIdentity: vi.fn(),
  },
}));
vi.mock('../services/tenantService', () => ({
  tenantService: {
    getCurrentOrganization: () => null,
    getSiteGroups: vi.fn().mockResolvedValue([]),
    updateController: vi.fn().mockResolvedValue(undefined),
  },
}));

import { tenantService } from '../services/tenantService';

const SG = { id: 'sg1', name: 'SouthEast', controller_url: 'https://1.2.3.4' } as any;

function Probe() {
  const { activeControllerIdentity, enterSiteGroup } = useAppContext();
  return (
    <div>
      <button onClick={() => enterSiteGroup(SG)}>enter</button>
      <span data-testid="host">{activeControllerIdentity?.hostname ?? 'none'}</span>
    </div>
  );
}

describe('AppContext activeControllerIdentity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('populates identity on enterSiteGroup', async () => {
    (apiService.getControllerIdentity as any).mockResolvedValue({
      hostname: 'xcc-lab-01', lockingId: '1A2B', fetchedAt: 'x', status: 'ok',
    });
    render(
      <AppContextProvider navigationScope="global" onNavigationScopeChange={() => {}}>
        <Probe />
      </AppContextProvider>
    );
    await act(async () => { screen.getByText('enter').click(); });
    await waitFor(() => expect(screen.getByTestId('host')).toHaveTextContent('xcc-lab-01'));
    expect(apiService.setBaseUrl).toHaveBeenCalledWith('https://1.2.3.4/management');
  });

  it('persists hostname + locking_id onto the controller record on ok', async () => {
    (apiService.getControllerIdentity as any).mockResolvedValue({
      hostname: 'xcc-lab-01', lockingId: '2624E-C7BE5', fetchedAt: 'x', status: 'ok',
    });
    render(
      <AppContextProvider navigationScope="global" onNavigationScopeChange={() => {}}>
        <Probe />
      </AppContextProvider>
    );
    await act(async () => { screen.getByText('enter').click(); });
    await waitFor(() =>
      expect(tenantService.updateController).toHaveBeenCalledWith('sg1', {
        hostname: 'xcc-lab-01',
        locking_id: '2624E-C7BE5',
      })
    );
  });

  it('does NOT persist when identity is unreachable', async () => {
    (apiService.getControllerIdentity as any).mockResolvedValue({
      hostname: '1.2.3.4', lockingId: '', fetchedAt: 'x', status: 'unreachable',
    });
    render(
      <AppContextProvider navigationScope="global" onNavigationScopeChange={() => {}}>
        <Probe />
      </AppContextProvider>
    );
    await act(async () => { screen.getByText('enter').click(); });
    await waitFor(() => expect(screen.getByTestId('host')).toHaveTextContent('1.2.3.4'));
    expect(tenantService.updateController).not.toHaveBeenCalled();
  });
});
