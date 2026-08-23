import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SLEDashboard } from './SLEDashboard';

// The Infrastructure tab has its own fast, independent data source (the Sentinel
// engine). It must not be held hostage by the slow SLE metrics load that powers
// the Wireless tab. These tests pin that contract: while the SLE provider load
// is still pending, the Infrastructure tab is reachable and renders.

const providerLoad = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ filters: { site: 'all' }, updateFilter: vi.fn() }),
}));
vi.mock('@/contexts/AppContext', () => ({
  useAppContext: () => ({ navigationScope: 'os', siteGroups: [], siteGroup: null }),
}));
vi.mock('../../hooks/useSourceSites', () => ({
  useSourceSites: () => ({ sites: [], xiqSites: [] }),
}));
vi.mock('../../hooks/useSelectedTimeRange', () => ({
  useSelectedTimeRange: () => ({
    token: '24h',
    setToken: vi.fn(),
    range: {
      startIso: '2026-08-22T00:00:00.000Z',
      endIso: '2026-08-23T00:00:00.000Z',
      bucketMinutes: 5,
      isLive: false,
    },
    optionGroups: [],
    dayStatuses: [],
    retentionDays: 7,
    neverCollected: false,
    selectedCoverage: {},
  }),
}));
vi.mock('../../hooks/useDevModeUnlock', () => ({
  useDevModeUnlock: () => ({ isUnlocked: false }),
}));
vi.mock('../../hooks/useMonitoringHistory', () => ({
  useMonitoringHistory: () => ({
    series: [],
    sources: [],
    worstSourceState: 'fresh',
    lastSuccessfulCollectionAt: null,
    neverCollected: false,
    error: null,
  }),
}));
vi.mock('../../services/sle/sleProviderFactory', () => ({
  getSleProvider: () => ({ load: providerLoad }),
}));
vi.mock('../../services/siteContextService', () => ({
  resolveSiteContext: () => ({ source: 'controller' }),
  buildXiqSiteValue: () => '',
}));
vi.mock('../../services/siteCatalog', () => ({
  isSystemSiteKey: () => false,
  systemSiteLabel: () => null,
}));
vi.mock('../../services/sleDataCollection', () => ({
  sleDataCollectionService: {
    isCollectionActive: () => true,
    startCollection: vi.fn(),
  },
}));
vi.mock('../../services/api', () => ({
  apiService: {
    clearBurstCache: vi.fn(),
    getBaseUrl: () => '/api/management',
    setBaseUrl: vi.fn(),
  },
}));
vi.mock('../../services/sentinelService', () => ({
  getStatus: vi.fn().mockResolvedValue({ activeAlerts: 0 }),
}));

// Stub heavy sub-components down to identifiable markers.
vi.mock('../TimeRangeSelector', () => ({ TimeRangeSelector: () => <div /> }));
vi.mock('../SelectedRangeLabel', () => ({ SelectedRangeLabel: () => <div /> }));
vi.mock('../SourceSiteSelector', () => ({ SourceSiteSelector: () => <div /> }));
vi.mock('../monitoring/DataFreshnessBadge', () => ({ DataFreshnessBadge: () => <div /> }));
vi.mock('./SLERadialMap', () => ({ SLERadialMap: () => <div /> }));
vi.mock('./SLEOctopus', () => ({ SLEOctopus: () => <div /> }));
vi.mock('./SLEHoneycomb', () => ({ SLEHoneycomb: () => <div /> }));
vi.mock('./SLEWaterfall', () => ({ SLEWaterfall: () => <div /> }));
vi.mock('./SentinelInfraTab', () => ({
  SentinelInfraTab: () => <div>INFRA-TAB-CONTENT</div>,
}));

describe('SLEDashboard — Infrastructure tab decoupled from SLE load', () => {
  it('keeps the Infrastructure tab reachable while SLE metrics are still loading', async () => {
    // Provider load never resolves — the page stays in its loading state.
    providerLoad.mockReturnValue(new Promise(() => {}));

    render(<SLEDashboard />);

    // The tab bar (and the Infrastructure trigger) must render even though the
    // SLE metrics have not finished loading. Before the fix the whole page was
    // replaced by a full-page "Loading..." spinner and this trigger was absent.
    const infraTab = await screen.findByRole('tab', { name: /Infrastructure/i });
    expect(infraTab).toBeInTheDocument();
    expect(infraTab).not.toHaveAttribute('disabled');

    // The loading state is scoped: it lives inside the (still-active) Wireless
    // tab body, not over the whole page — so the Infrastructure tab coexists
    // with it and stays clickable.
    expect(screen.getByText('Loading Operational Insights...')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Wireless/i })).toBeInTheDocument();
  });

  it('shows the SLE summary bar once the metrics load resolves', async () => {
    providerLoad.mockResolvedValue({
      source: 'controller',
      stations: [],
      aps: [],
      sles: [],
      warnings: [],
    });

    render(<SLEDashboard />);

    // Loading spinner clears and the SLE-derived summary (Overall score) renders.
    expect(await screen.findByText('Overall')).toBeInTheDocument();
    expect(screen.queryByText('Loading Operational Insights...')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Infrastructure/i })).toBeInTheDocument();
  });
});
