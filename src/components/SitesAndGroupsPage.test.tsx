import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const siteGroupsPageProps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const sitesPageProps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('./SiteGroupsPage', () => ({
  SiteGroupsPage: (props: Record<string, unknown>) => {
    siteGroupsPageProps.current = props;
    return <div data-testid="site-groups-page">SiteGroupsPage</div>;
  },
}));
vi.mock('./SitesPage', () => ({
  SitesPage: (props: Record<string, unknown>) => {
    sitesPageProps.current = props;
    return <div data-testid="sites-page">SitesPage</div>;
  },
}));

import { SitesAndGroupsPage } from './SitesAndGroupsPage';

describe('SitesAndGroupsPage', () => {
  it('renders both tab triggers', () => {
    render(<SitesAndGroupsPage />);
    expect(screen.getByText('Site Groups')).toBeTruthy();
    expect(screen.getByText('Sites')).toBeTruthy();
  });

  it('defaults to the site-groups tab (renders SiteGroupsPage)', () => {
    render(<SitesAndGroupsPage />);
    expect(screen.getByTestId('site-groups-page')).toBeTruthy();
  });

  it('initialTab="sites" mounts SitesPage', () => {
    render(<SitesAndGroupsPage initialTab="sites" />);
    expect(screen.getByTestId('sites-page')).toBeTruthy();
  });

  it('forwards onShowSiteDetail to SitesPage as onShowDetail', () => {
    const onShowSiteDetail = vi.fn();
    render(<SitesAndGroupsPage initialTab="sites" onShowSiteDetail={onShowSiteDetail} />);
    expect(sitesPageProps.current.onShowDetail).toBe(onShowSiteDetail);
  });

  it('passes onNavigateToSites callback to SiteGroupsPage', () => {
    render(<SitesAndGroupsPage />);
    expect(typeof siteGroupsPageProps.current.onNavigateToSites).toBe('function');
  });

  it('passes initial siteGroupFilter=null and onClearFilter to SitesPage', () => {
    render(<SitesAndGroupsPage initialTab="sites" />);
    expect(sitesPageProps.current.siteGroupFilter).toBeNull();
    expect(typeof sitesPageProps.current.onClearFilter).toBe('function');
  });
});
