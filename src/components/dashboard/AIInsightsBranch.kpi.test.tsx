/**
 * The KPI tiles used to read from a live controller snapshot only, so every one
 * of them showed identical numbers no matter which time range was selected —
 * the selector looked inert. These cover the fix: the tiles reflect the selected
 * window, fall back honestly when the store has nothing, and always say which
 * of the two they are showing.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { AIInsightsBranch } from './AIInsightsBranch';
import { EMPTY_RANGED_STATS, type RangedNetworkStats } from '../../lib/rangedNetworkStats';
import { resolveTimeRange } from '../../lib/timeRange';

// Child panels pull in charts, drift detection and API clients; none of that is
// under test here and all of it is slow or network-bound in jsdom.
vi.mock('./DriftStrip', () => ({ DriftStrip: () => null }));
vi.mock('./InsightCardsGrid', () => ({ InsightCardsGrid: () => null }));
vi.mock('./OrgSiteHealthOverview', () => ({ OrgSiteHealthOverview: () => null }));
vi.mock('./SitesAttentionWidget', () => ({ SitesAttentionWidget: () => null }));
vi.mock('./DetailPanel', () => ({ DetailPanel: () => null }));
vi.mock('../AuditLogsWidget', () => ({ AuditLogsWidget: () => null }));
vi.mock('../BestPracticesWidget', () => ({ BestPracticesWidget: () => null }));

beforeAll(() => {
  if (!(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const NOW = new Date(2026, 7, 7, 15, 0, 0, 0);

/** Live snapshot: deliberately distinct from every window figure below. */
const SNAPSHOT_AP = {
  total: 99,
  online: 98,
  offline: 1,
  primary: 0,
  backup: 0,
  standby: 0,
  lowPower: 0,
  normalPower: 0,
  models: {},
  avgChannelUtil: 0,
};
const SNAPSHOT_CLIENTS = {
  total: 777,
  authenticated: 776,
  throughputUpload: 1_000_000,
  throughputDownload: 2_000_000,
  avgRfqi: 90,
};

function windowStats(overrides: Partial<RangedNetworkStats> = {}): RangedNetworkStats {
  return {
    ...EMPTY_RANGED_STATS,
    apTotal: 6,
    apPeak: 6,
    apOnline: 6,
    clientTotal: 35,
    clientPeak: 42,
    clientAuthenticated: 34,
    throughputUpload: 3_000_000,
    throughputDownload: 4_000_000,
    tickCount: 288,
    available: true,
    ...overrides,
  };
}

function renderBranch({
  rangedStats = windowStats(),
  token = 'day-1',
}: { rangedStats?: RangedNetworkStats; token?: string } = {}) {
  return render(
    <AIInsightsBranch
      apStats={SNAPSHOT_AP}
      clientStats={SNAPSHOT_CLIENTS}
      alertCounts={{ critical: 2, warning: 3, info: 0 }}
      poorServices={[]}
      lastUpdate={NOW}
      siteScope="all"
      rfqiData={[]}
      avgRssi={-60}
      avgSnr={30}
      bandDistribution={[]}
      snrDistribution={[]}
      aiInsightsDetailPanel={false}
      aiActiveHealthTab="healthy"
      setAiActiveHealthTab={() => {}}
      selectedNetworkEvent={null}
      setSelectedNetworkEvent={() => {}}
      onCloseDetailPanel={() => {}}
      setSelectorTab={() => {}}
      rangedStats={rangedStats}
      timeRange={resolveTimeRange(token, NOW)}
    />
  );
}

/** The MetricCard whose title matches `label`. */
function tile(label: string): HTMLElement {
  const title = screen.getByText(new RegExp(`^${label}$`, 'i'));
  const element = title.closest('[data-slot="card"]');
  if (!element) throw new Error(`No KPI tile found for ${label}`);
  return element as HTMLElement;
}

describe('KPI tiles reflect the selected window', () => {
  it('shows the window AP count, not the live snapshot', () => {
    renderBranch();
    const aps = tile('Access points');
    expect(within(aps).getByText('6')).toBeInTheDocument();
    expect(within(aps).queryByText('99')).not.toBeInTheDocument();
  });

  it('shows the window client count, not the live snapshot', () => {
    renderBranch();
    const clients = tile('Clients');
    expect(within(clients).getByText('35')).toBeInTheDocument();
    expect(within(clients).queryByText('777')).not.toBeInTheDocument();
  });

  it('surfaces the peak, which a mean alone would hide', () => {
    renderBranch();
    expect(within(tile('Clients')).getByText(/peak 42/i)).toBeInTheDocument();
  });

  it('sums window throughput rather than using the live reading', () => {
    renderBranch();
    // 3 Mbps + 4 Mbps, not the snapshot's 1 + 2.
    expect(within(tile('Throughput')).getByText(/7/)).toBeInTheDocument();
  });

  it('produces different figures for different windows — the reported bug', () => {
    const { unmount } = renderBranch({ rangedStats: windowStats({ clientTotal: 35 }) });
    expect(within(tile('Clients')).getByText('35')).toBeInTheDocument();
    unmount();

    renderBranch({ rangedStats: windowStats({ clientTotal: 41 }) });
    expect(within(tile('Clients')).getByText('41')).toBeInTheDocument();
  });
});

describe('KPI tiles say which basis they are on', () => {
  it('labels window figures with the range', () => {
    renderBranch({ token: 'day-1' });
    expect(within(tile('Clients')).getByText(/avg · yesterday/i)).toBeInTheDocument();
    expect(within(tile('Access points')).getByText(/avg · yesterday/i)).toBeInTheDocument();
  });

  it('tracks the selected range in the label', () => {
    renderBranch({ token: '7d' });
    expect(within(tile('Clients')).getByText(/avg · last 7 days/i)).toBeInTheDocument();
  });

  it('always marks alerts as current state, since alarms are not persisted', () => {
    renderBranch();
    expect(within(tile('Active alerts')).getByText(/· now$/)).toBeInTheDocument();
  });
});

describe('KPI tiles fall back honestly when nothing was stored', () => {
  it('uses the live snapshot and says "now"', () => {
    renderBranch({ rangedStats: EMPTY_RANGED_STATS });

    const clients = tile('Clients');
    expect(within(clients).getByText('777')).toBeInTheDocument();
    expect(within(clients).getByText(/· now$/)).toBeInTheDocument();
    expect(within(clients).queryByText(/avg ·/i)).not.toBeInTheDocument();
  });

  it('shows pending rather than a peak it does not have', () => {
    renderBranch({ rangedStats: EMPTY_RANGED_STATS });
    expect(within(tile('Clients')).getByText(/1 pending/i)).toBeInTheDocument();
  });

  it('falls back per figure, not all-or-nothing', () => {
    // Counts stored, throughput not — a deployment without the throughput family.
    renderBranch({
      rangedStats: windowStats({ throughputUpload: null, throughputDownload: null }),
    });
    expect(within(tile('Clients')).getByText(/avg ·/i)).toBeInTheDocument();
    expect(within(tile('Throughput')).getByText(/· now$/)).toBeInTheDocument();
  });
});
