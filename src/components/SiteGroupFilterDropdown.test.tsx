import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const ctx = vi.hoisted(() => ({
  current: {
    siteGroups: [] as Array<{ id: string; name: string }>,
    orgSiteGroupFilter: null as string | null,
    setOrgSiteGroupFilter: vi.fn(),
    activeControllerIdentity: null as { hostname: string; lockingId: string; fetchedAt: string; status: 'ok' | 'unreachable' } | null,
  },
}));

vi.mock('@/contexts/AppContext', () => ({
  useAppContext: () => ctx.current,
}));

import { SiteGroupFilterDropdown } from './SiteGroupFilterDropdown';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

beforeEach(() => {
  ctx.current = {
    siteGroups: [],
    orgSiteGroupFilter: null,
    setOrgSiteGroupFilter: vi.fn(),
    activeControllerIdentity: null,
  };
});

describe('SiteGroupFilterDropdown', () => {
  it('renders nothing when there are 0 site groups', () => {
    const { container } = render(<SiteGroupFilterDropdown />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is exactly 1 site group (no need to filter)', () => {
    ctx.current.siteGroups = [{ id: 'sg-1', name: 'HQ' }];
    const { container } = render(<SiteGroupFilterDropdown />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the Select trigger when there are 2+ site groups', () => {
    ctx.current.siteGroups = [
      { id: 'sg-1', name: 'HQ' },
      { id: 'sg-2', name: 'EU' },
    ];
    render(<SiteGroupFilterDropdown />);
    // Default placeholder text appears in the trigger
    expect(screen.getByText('All Site Groups')).toBeTruthy();
  });

  it('shows the active site-group name when filter is set', () => {
    ctx.current.siteGroups = [
      { id: 'sg-1', name: 'HQ' },
      { id: 'sg-2', name: 'EU' },
    ];
    ctx.current.orgSiteGroupFilter = 'sg-2';
    render(<SiteGroupFilterDropdown />);
    expect(screen.getByText('EU')).toBeTruthy();
  });

  it('shows the active controller hostname hint when a group is selected and identity is ok', () => {
    ctx.current.siteGroups = [
      { id: 'sg1', name: 'SouthEast' },
      { id: 'sg2', name: 'NorthWest' },
    ];
    ctx.current.orgSiteGroupFilter = 'sg1';
    ctx.current.activeControllerIdentity = {
      hostname: 'xcc-lab-01',
      lockingId: '1A2B',
      fetchedAt: 'x',
      status: 'ok',
    };
    render(<SiteGroupFilterDropdown />);
    expect(screen.getByText(/xcc-lab-01/)).toBeInTheDocument();
  });

  it('does not show a hostname hint when identity status is unreachable', () => {
    ctx.current.siteGroups = [
      { id: 'sg1', name: 'SouthEast' },
      { id: 'sg2', name: 'NorthWest' },
    ];
    ctx.current.orgSiteGroupFilter = 'sg1';
    ctx.current.activeControllerIdentity = {
      hostname: 'xcc-lab-01',
      lockingId: '1A2B',
      fetchedAt: 'x',
      status: 'unreachable',
    };
    render(<SiteGroupFilterDropdown />);
    expect(screen.queryByText(/xcc-lab-01/)).toBeNull();
  });

  it('does not show a hostname hint when no group is selected', () => {
    ctx.current.siteGroups = [
      { id: 'sg1', name: 'SouthEast' },
      { id: 'sg2', name: 'NorthWest' },
    ];
    ctx.current.orgSiteGroupFilter = null;
    ctx.current.activeControllerIdentity = {
      hostname: 'xcc-lab-01',
      lockingId: '1A2B',
      fetchedAt: 'x',
      status: 'ok',
    };
    render(<SiteGroupFilterDropdown />);
    expect(screen.queryByText(/xcc-lab-01/)).toBeNull();
  });
});
