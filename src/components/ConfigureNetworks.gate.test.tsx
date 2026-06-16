import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// localStorage shim — must land before any module imports that touch it (api singleton)
const { } = vi.hoisted(() => {
  const store: Record<string, string> = {};
  const mock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    length: 0,
    key: (_i: number) => null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, writable: true, configurable: true });
  // sessionStorage shim too
  const sstore: Record<string, string> = {};
  const smock = {
    getItem: (key: string) => sstore[key] ?? null,
    setItem: (key: string, value: string) => { sstore[key] = value; },
    removeItem: (key: string) => { delete sstore[key]; },
    clear: () => { Object.keys(sstore).forEach(k => delete sstore[k]); },
    length: 0,
    key: (_i: number) => null,
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: smock, writable: true, configurable: true });
  return {};
});

const ctx: any = {
  navigationScope: 'global',
  siteGroups: [{ id: 'sg1', name: 'SouthEast', controller_url: 'https://1.2.3.4' }],
  orgSiteGroupFilter: null,
  setOrgSiteGroupFilter: vi.fn(),
  navigateToTemplateCreation: vi.fn(),
  activeControllerIdentity: null,
  refreshControllerIdentity: vi.fn(),
  siteGroup: null,
};

vi.mock('@/contexts/AppContext', () => ({ useAppContext: () => ctx }));

// Mock services that get called at module load or on render
vi.mock('@/contexts/GridModeContext', () => ({
  useGridMode: () => ({ agGridEnabled: false }),
}));

vi.mock('../services/api', () => ({
  apiService: {
    getServices: vi.fn().mockResolvedValue([]),
    getTopologies: vi.fn().mockResolvedValue([]),
    getServiceStations: vi.fn().mockResolvedValue([]),
    getServiceSiteIds: vi.fn().mockResolvedValue([]),
    getServiceDeviceIds: vi.fn().mockResolvedValue([]),
    getSites: vi.fn().mockResolvedValue([]),
    getRoles: vi.fn().mockResolvedValue([]),
    getBaseUrl: vi.fn().mockReturnValue('/api/management'),
    setBaseUrl: vi.fn(),
  },
  Service: {},
  Role: {},
  Topology: {},
}));

vi.mock('../services/globalElementsService', () => ({
  globalElementsService: {
    getGlobalElements: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/tenantService', () => ({
  tenantService: {
    getCurrentOrganization: vi.fn().mockReturnValue(null),
    loadTenantHierarchy: vi.fn().mockResolvedValue(null),
  },
}));

// Mock heavy child components that would try to render complex UI
vi.mock('./NetworkEditDetail', () => ({
  NetworkEditDetail: () => null,
}));

vi.mock('./CreateWLANDialog', () => ({
  CreateWLANDialog: () => null,
}));

vi.mock('./QuickWLANDialog', () => ({
  QuickWLANDialog: () => null,
}));

vi.mock('./WifiQRCodeDialog', () => ({
  WifiQRCodeDialog: () => null,
}));

vi.mock('./DevEpicBadge', () => ({
  DevEpicBadge: () => null,
}));

vi.mock('@/components/ui/AGGridWrapper', () => ({
  AGGridWrapper: () => null,
}));

import { ConfigureNetworks } from './ConfigureNetworks';

describe('ConfigureNetworks org-scope gate', () => {
  it('shows the empty-state prompt when no Site Group is chosen', () => {
    render(<ConfigureNetworks />);
    expect(screen.getByText(/Select a Site Group to configure its controller/i)).toBeInTheDocument();
  });
});
