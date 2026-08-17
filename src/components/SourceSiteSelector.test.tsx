import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { SiteGroup } from '@/types/domain';
import type { Site } from '../services/api';
import type { XiqSite } from '../services/sle/xiqSites';
import { OS1_STAGING_LABEL, XIQ_DEFAULT_SITE_LABEL } from '../types/siteCatalog';

// jsdom lacks the pointer/scroll APIs Radix Select relies on.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  }
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

const SITE_GROUPS: SiteGroup[] = [
  {
    id: 'sg-1',
    org_id: 'org-1',
    name: 'Warehouses',
    controller_url: 'https://gw-a.example.test',
    connection_status: 'connected',
    is_default: true,
    hostname: 'gw-a',
    locking_id: '2624E-C7BE5',
  },
  {
    id: 'sg-2',
    org_id: 'org-1',
    name: 'Retail',
    controller_url: 'https://gw-b.example.test',
    connection_status: 'connected',
    is_default: false,
    hostname: 'gw-b',
    locking_id: '2110E-C42CF',
    secondary_controller: 'gw-b2.example.test',
  },
];

vi.mock('@/contexts/AppContext', () => ({ useAppContext: vi.fn() }));
vi.mock('./ConnectXiqDialog', () => ({ ConnectXiqDialog: () => null }));

const getToken = vi.fn();
vi.mock('../services/xiqService', () => ({ xiqService: { getToken: () => getToken() } }));

import { useAppContext } from '@/contexts/AppContext';
import { SourceSiteSelector } from './SourceSiteSelector';

const mockUseAppContext = vi.mocked(useAppContext);

function setupContext(siteGroups: SiteGroup[] = SITE_GROUPS) {
  mockUseAppContext.mockReturnValue({
    siteGroups,
    siteGroup: siteGroups[0] ?? null,
    organization: null,
    site: null,
    device: null,
    activeControllerIdentity: null,
    isLoadingOrg: false,
    navigationScope: 'global',
    orgSiteGroupFilter: null,
    setOrgSiteGroupFilter: vi.fn(),
    refreshControllerIdentity: vi.fn(),
    setActiveSiteGroup: vi.fn(),
    setActiveSite: vi.fn(),
    setActiveDevice: vi.fn(),
    refreshSiteGroups: vi.fn(),
    enterSiteGroup: vi.fn(),
    exitSiteGroup: vi.fn(),
    navigateToPage: vi.fn(),
    navigateToTemplateCreation: vi.fn(),
  } as ReturnType<typeof useAppContext>);
}

function site(id: string, name: string, siteGroupId?: string): Site {
  return { id, name, ...(siteGroupId ? { site_group_id: siteGroupId } : {}) } as Site;
}

/** Render, open the dropdown, and return the option labels in DOM order. */
function openAndListOptions(sites: Site[], xiqSites: XiqSite[] = []): string[] {
  render(
    <SourceSiteSelector value="all" onValueChange={vi.fn()} sites={sites} xiqSites={xiqSites} />
  );
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  return screen.getAllByRole('option').map((el) => el.textContent?.trim() ?? '');
}

beforeEach(() => {
  getToken.mockReset();
  getToken.mockReturnValue(null);
  setupContext();
});

describe('SourceSiteSelector — OS1 Site Group hierarchy', () => {
  it('names each Gateway boundary and its Locking ID', () => {
    render(
      <SourceSiteSelector
        value="all"
        onValueChange={vi.fn()}
        sites={[site('s1', 'PrimarySite', 'sg-1')]}
        xiqSites={[]}
      />
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(screen.getByText('Warehouses')).toBeInTheDocument();
    expect(screen.getByText('2624E-C7BE5')).toBeInTheDocument();
    // Site Group labels appear even when only one Gateway holds every site, so
    // which Gateway owns a Site is never left implied.
    expect(screen.getAllByText('Site Group').length).toBe(2);
  });

  it('distinguishes a single Gateway from a Gateway pair', () => {
    render(
      <SourceSiteSelector value="all" onValueChange={vi.fn()} sites={[]} xiqSites={[]} />
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(screen.getByText('Standalone')).toBeInTheDocument();
    expect(screen.getByText('Gateway Pair')).toBeInTheDocument();
  });

  it('lists each Site under the Gateway that owns it', () => {
    const options = openAndListOptions([
      site('s1', 'PrimarySite', 'sg-1'),
      site('s2', 'Store 014', 'sg-2'),
      site('s3', 'AFC LAB', 'sg-1'),
    ]);
    // Warehouses' sites, then Retail's, then Staging.
    expect(options).toEqual([
      'All OS-ONE Sites',
      'AFC LAB',
      'PrimarySite',
      'Store 014',
      `${OS1_STAGING_LABEL}System`,
      'Connect XIQ…',
    ]);
  });
});

describe('SourceSiteSelector — OS1 Staging', () => {
  it('is the last OS1 entry even against a site name that sorts after it', () => {
    const options = openAndListOptions([site('s1', 'zzz Depot', 'sg-1')]);
    const os1 = options.filter((o) => o !== 'Connect XIQ…');
    expect(os1.at(-1)).toBe(`${OS1_STAGING_LABEL}System`);
  });

  it('is offered even when no OS1 sites exist at all', () => {
    const options = openAndListOptions([]);
    expect(options).toContain(`${OS1_STAGING_LABEL}System`);
  });

  it('is marked as a system location rather than a site', () => {
    openAndListOptions([site('s1', 'PrimarySite', 'sg-1')]);
    const staging = screen
      .getAllByRole('option')
      .find((el) => el.textContent?.startsWith(OS1_STAGING_LABEL));
    expect(staging?.textContent).toContain('System');
  });
});

describe('SourceSiteSelector — XIQ', () => {
  it('closes the XIQ list with Default Site', () => {
    const options = openAndListOptions(
      [site('s1', 'PrimarySite', 'sg-1')],
      [
        { id: '9', name: 'zzz Campus', siteGroupId: 'sg-1' },
        { id: '1', name: 'AAA Campus', siteGroupId: 'sg-1' },
      ]
    );
    const xiqStart = options.indexOf('All XIQ Sites');
    expect(xiqStart).toBeGreaterThan(-1);
    expect(options.slice(xiqStart)).toEqual([
      'All XIQ Sites',
      'AAA Campus',
      'zzz Campus',
      `${XIQ_DEFAULT_SITE_LABEL}System`,
      // Already connected, so the existing affordance reads "Reconnect".
      'Reconnect XIQ…',
    ]);
  });

  it('offers Default Site once XIQ is connected, even with no XIQ sites', () => {
    getToken.mockReturnValue({ access_token: 't', region: 'global' });
    const options = openAndListOptions([site('s1', 'PrimarySite', 'sg-1')], []);
    expect(options).toContain(`${XIQ_DEFAULT_SITE_LABEL}System`);
  });

  it('shows no XIQ section at all when XIQ has never been connected', () => {
    const options = openAndListOptions([site('s1', 'PrimarySite', 'sg-1')], []);
    expect(options).not.toContain('All XIQ Sites');
    expect(options).not.toContain(`${XIQ_DEFAULT_SITE_LABEL}System`);
    // The pre-existing way in is preserved.
    expect(options).toContain('Connect XIQ…');
  });
});

describe('SourceSiteSelector — selection', () => {
  it('reports the site name for a normal OS1 site by default', () => {
    const onValueChange = vi.fn();
    render(
      <SourceSiteSelector
        value="all"
        onValueChange={onValueChange}
        sites={[site('s1', 'PrimarySite', 'sg-1')]}
        xiqSites={[]}
      />
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(screen.getByText('PrimarySite'));
    expect(onValueChange).toHaveBeenCalledWith('PrimarySite');
  });

  it('reports the site id when the page filters by id', () => {
    const onValueChange = vi.fn();
    render(
      <SourceSiteSelector
        value="all"
        onValueChange={onValueChange}
        sites={[site('s1', 'PrimarySite', 'sg-1')]}
        xiqSites={[]}
        osSiteValue="id"
      />
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(screen.getByText('PrimarySite'));
    expect(onValueChange).toHaveBeenCalledWith('s1');
  });

  it('reports the Staging sentinel, never the Gateway word "Unassigned"', () => {
    const onValueChange = vi.fn();
    render(
      <SourceSiteSelector value="all" onValueChange={onValueChange} sites={[]} xiqSites={[]} />
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(screen.getByText(OS1_STAGING_LABEL));
    expect(onValueChange).toHaveBeenCalledWith('__os1_staging__');
    expect(screen.queryByText(/Unassigned/)).toBeNull();
  });
});
