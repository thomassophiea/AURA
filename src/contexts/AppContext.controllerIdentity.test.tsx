import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AppContextProvider, useAppContext } from './AppContext';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    isAuthenticated: () => true,
    setBaseUrl: vi.fn(),
    getControllerIdentity: vi.fn(),
  },
}));
vi.mock('../services/tenantService', () => ({
  tenantService: {
    getCurrentOrganization: () => null,
    getSiteGroups: vi.fn().mockResolvedValue([]),
  },
}));

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
  });
});
