import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const ctx = vi.hoisted(() => ({
  current: {
    siteGroups: [] as Array<{ id: string; name: string }>,
    orgSiteGroupFilter: null as string | null,
    setOrgSiteGroupFilter: vi.fn(),
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
});
