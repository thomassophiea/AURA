import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { useAppContext } from '@/contexts/AppContext';
import type { SiteGroup } from '@/types/domain';

// The api singleton reads storage at module load, so a working localStorage has
// to exist before this file's imports run. src/test/setup.ts installs one and
// runs first, which is why the hand-rolled shim that used to sit here is gone.
type AppContextValue = ReturnType<typeof useAppContext>;

/** A complete SiteGroup, so fixtures stay honest about the shape components see. */
function siteGroup(id: string, name: string, controllerUrl: string): SiteGroup {
  return {
    id,
    org_id: 'org1',
    name,
    controller_url: controllerUrl,
    connection_status: 'connected',
    is_default: false,
  };
}

function makeCtx(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    navigationScope: 'global',
    siteGroups: [siteGroup('sg1', 'SouthEast', 'https://1.2.3.4')],
    orgSiteGroupFilter: null,
    setOrgSiteGroupFilter: vi.fn(),
    navigateToTemplateCreation: vi.fn(),
    activeControllerIdentity: null,
    refreshControllerIdentity: vi.fn(),
    siteGroup: null,
    ...overrides,
    // Only the fields this component reads are stubbed; the gate does not touch
    // the rest of the context, and listing them would just be noise to maintain.
  } as unknown as AppContextValue;
}

// Mutable, per-test context. The mock reads the *current* value at render time.
let ctx: AppContextValue = makeCtx();

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
  it('shows the empty-state prompt when multiple Site Groups exist and none is chosen', () => {
    ctx = makeCtx({
      siteGroups: [
        siteGroup('sg1', 'SouthEast', 'https://1.2.3.4'),
        siteGroup('sg2', 'NorthWest', 'https://5.6.7.8'),
      ],
      orgSiteGroupFilter: null,
    });
    render(<ConfigureNetworks />);
    expect(
      screen.getByText(/Select a Site Group to configure its gateway/i)
    ).toBeInTheDocument();
  });

  it('auto-selects the sole Site Group at org scope (no empty-state prompt)', () => {
    ctx = makeCtx({
      siteGroups: [siteGroup('sg1', 'SouthEast', 'https://1.2.3.4')],
      orgSiteGroupFilter: null,
    });
    render(<ConfigureNetworks />);
    expect(
      screen.queryByText(/Select a Site Group to configure its gateway/i)
    ).toBeNull();
  });
});
