import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Activity } from 'lucide-react';

// Mock useAppContext so we can vary navigationScope + siteGroup data per test.
const appContextValue = vi.hoisted(() => ({
  current: {
    organization: null,
    siteGroups: [] as Array<{ name: string }>,
    siteGroup: null as null | { name: string },
    navigationScope: 'global' as 'global' | 'site-group',
  },
}));

vi.mock('@/contexts/AppContext', () => ({
  useAppContext: () => appContextValue.current,
}));

import { PageHeader } from './PageHeader';

beforeEach(() => {
  appContextValue.current = {
    organization: null,
    siteGroups: [],
    siteGroup: null,
    navigationScope: 'global',
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PageHeader', () => {
  it('renders title and subtitle', () => {
    render(<PageHeader title="Dashboard" subtitle="Network overview" />);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Network overview')).toBeTruthy();
  });

  it('renders icon when provided', () => {
    const { container } = render(<PageHeader title="X" icon={Activity} />);
    // lucide icons render as <svg>
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('does not render the Refresh button when onRefresh is not provided', () => {
    render(<PageHeader title="X" />);
    expect(screen.queryByText('Refresh')).toBeNull();
  });

  it('renders the Refresh button when onRefresh is provided + fires it', () => {
    const onRefresh = vi.fn();
    render(<PageHeader title="X" onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables the Refresh button while refreshing=true and shows spin class', () => {
    const { container } = render(<PageHeader title="X" onRefresh={vi.fn()} refreshing />);
    const btn = screen.getByText('Refresh').closest('button')!;
    expect(btn.disabled).toBe(true);
    // animate-spin is applied to the icon when refreshing
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders custom actions slot', () => {
    render(<PageHeader title="X" actions={<button data-testid="custom-action">More</button>} />);
    expect(screen.getByTestId('custom-action')).toBeTruthy();
  });

  it('shows the site-group badge when navigationScope=global with site groups', () => {
    appContextValue.current.navigationScope = 'global';
    appContextValue.current.siteGroups = [{ name: 'HQ' }];
    appContextValue.current.siteGroup = { name: 'HQ' };
    render(<PageHeader title="X" />);
    expect(screen.getByText('HQ')).toBeTruthy();
  });

  it('hides the badge when navigationScope=site-group', () => {
    appContextValue.current.navigationScope = 'site-group';
    appContextValue.current.siteGroups = [{ name: 'HQ' }];
    appContextValue.current.siteGroup = { name: 'HQ' };
    render(<PageHeader title="X" />);
    expect(screen.queryByText('HQ')).toBeNull();
  });

  it('honors hideSiteGroupBadge prop even when in scope=global', () => {
    appContextValue.current.navigationScope = 'global';
    appContextValue.current.siteGroups = [{ name: 'HQ' }];
    appContextValue.current.siteGroup = { name: 'HQ' };
    render(<PageHeader title="X" hideSiteGroupBadge />);
    expect(screen.queryByText('HQ')).toBeNull();
  });

  it('falls back to the first siteGroup name when active siteGroup is null', () => {
    appContextValue.current.navigationScope = 'global';
    appContextValue.current.siteGroups = [{ name: 'EU' }];
    appContextValue.current.siteGroup = null;
    render(<PageHeader title="X" />);
    expect(screen.getByText('EU')).toBeTruthy();
  });
});
