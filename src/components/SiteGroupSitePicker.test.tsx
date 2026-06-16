import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SiteGroup } from '@/types/domain';
import type { ControllerIdentity } from '@/types/controllerIdentity';

// jsdom doesn't ship ResizeObserver; cmdk uses it internally.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// ----- AppContext mock -----
const mockSetOrgSiteGroupFilter = vi.fn();

const SITE_GROUPS: SiteGroup[] = [
  {
    id: 'sg-1',
    org_id: 'org-1',
    name: 'Lab Controller',
    controller_url: 'https://lab.example.com',
    connection_status: 'connected',
    is_default: true,
    hostname: 'lab-ctrl-01',
    locking_id: 'LOCK-AABB',
  },
  {
    id: 'sg-2',
    org_id: 'org-1',
    name: 'Prod Controller',
    controller_url: 'https://prod.example.com',
    connection_status: 'connected',
    is_default: false,
    hostname: 'prod-ctrl-01',
    locking_id: 'LOCK-CCDD',
  },
];

const IDENTITY: ControllerIdentity = {
  hostname: 'lab-ctrl-01',
  lockingId: 'LOCK-AABB',
  fetchedAt: '2026-01-01T00:00:00Z',
  status: 'ok',
};

vi.mock('@/contexts/AppContext', () => ({
  useAppContext: vi.fn(),
}));

// Import after mock registration
import { useAppContext } from '@/contexts/AppContext';
import { SiteGroupSitePicker } from './SiteGroupSitePicker';

const mockUseAppContext = vi.mocked(useAppContext);

function setupContext(overrides: Partial<ReturnType<typeof useAppContext>> = {}) {
  mockUseAppContext.mockReturnValue({
    siteGroups: SITE_GROUPS,
    orgSiteGroupFilter: null,
    setOrgSiteGroupFilter: mockSetOrgSiteGroupFilter,
    activeControllerIdentity: null,
    // The rest are not used by the component but required by the type
    organization: null,
    siteGroup: null,
    site: null,
    device: null,
    isLoadingOrg: false,
    navigationScope: 'global',
    refreshControllerIdentity: vi.fn(),
    setActiveSiteGroup: vi.fn(),
    setActiveSite: vi.fn(),
    setActiveDevice: vi.fn(),
    refreshSiteGroups: vi.fn(),
    enterSiteGroup: vi.fn(),
    exitSiteGroup: vi.fn(),
    navigateToPage: vi.fn(),
    navigateToTemplateCreation: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAppContext>);
}

// Helper: render and click the trigger to open the popover
function renderAndOpen(props: React.ComponentProps<typeof SiteGroupSitePicker>) {
  render(<SiteGroupSitePicker {...props} />);
  // Click the trigger button to open the popover
  fireEvent.click(screen.getByRole('button'));
}

// ── Test 1 ──────────────────────────────────────────────────────────────────
describe('SiteGroupSitePicker — trigger label', () => {
  it('shows selected controller hostname + locking_id and "All Sites" when orgSiteGroupFilter is set', () => {
    setupContext({ orgSiteGroupFilter: 'sg-1', activeControllerIdentity: IDENTITY });

    render(
      <SiteGroupSitePicker
        sites={['Site A', 'Site B']}
        selectedSite="all"
        onSelectSite={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button');
    // Should contain the hostname
    expect(trigger.textContent).toContain('lab-ctrl-01');
    // Should contain the locking_id
    expect(trigger.textContent).toContain('LOCK-AABB');
    // Should contain the site label
    expect(trigger.textContent).toContain('All Sites');
  });
});

// ── Test 2 ──────────────────────────────────────────────────────────────────
describe('SiteGroupSitePicker — controller list', () => {
  it('opening popover lists controllers with hostname/locking_id; clicking one calls setOrgSiteGroupFilter', () => {
    setupContext({ orgSiteGroupFilter: null });

    renderAndOpen({
      sites: [],
      selectedSite: 'all',
      onSelectSite: vi.fn(),
    });

    // Both controllers should appear
    expect(screen.getByText('Lab Controller')).toBeInTheDocument();
    expect(screen.getByText('Prod Controller')).toBeInTheDocument();

    // Hostname/locking_id detail lines should appear
    expect(screen.getByText(/lab-ctrl-01/)).toBeInTheDocument();
    expect(screen.getByText(/LOCK-AABB/)).toBeInTheDocument();

    // Click the first controller item
    fireEvent.click(screen.getByText('Lab Controller'));
    expect(mockSetOrgSiteGroupFilter).toHaveBeenCalledWith('sg-1');
  });
});

// ── Test 3 ──────────────────────────────────────────────────────────────────
describe('SiteGroupSitePicker — site selection', () => {
  it('clicking a site calls onSelectSite with that site name', () => {
    setupContext({ orgSiteGroupFilter: 'sg-1' });
    const onSelectSite = vi.fn();

    renderAndOpen({
      sites: ['Site Alpha', 'Site Beta'],
      selectedSite: 'all',
      onSelectSite,
    });

    fireEvent.click(screen.getByText('Site Alpha'));
    expect(onSelectSite).toHaveBeenCalledWith('Site Alpha');
  });
});
