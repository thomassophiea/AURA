import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InsightCardsGrid } from './InsightCardsGrid';

const baseApStats = {
  total: 10,
  online: 9,
  offline: 1,
  avgChannelUtil: 25,
  lowPower: 0,
  models: { 'AP-650': 6, 'AP-460': 4 },
};

const baseClientStats = {
  total: 50,
  avgRfqi: 80,
  throughputUpload: 1_000_000,
  throughputDownload: 5_000_000,
};

const baseAlertCounts = { critical: 0, warning: 0 };

describe('InsightCardsGrid — Network Health card', () => {
  it('renders RFQI and Channel Util as percentages when finite > 0', () => {
    render(
      <InsightCardsGrid
        apStats={baseApStats}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('renders <NoData> em-dash when avgRfqi is 0/undefined', () => {
    render(
      <InsightCardsGrid
        apStats={baseApStats}
        clientStats={{ ...baseClientStats, avgRfqi: 0 }}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    // The NoData inline em-dash is exposed via aria-label.
    expect(screen.getAllByLabelText('No data available').length).toBeGreaterThan(0);
  });

  it('AP availability rounds via apStats.online / apStats.total', () => {
    render(
      <InsightCardsGrid
        apStats={{ ...baseApStats, total: 10, online: 9 }}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('AP availability shows 0% when total is 0', () => {
    render(
      <InsightCardsGrid
        apStats={{ ...baseApStats, total: 0, online: 0 }}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});

describe('InsightCardsGrid — Capacity Planning card', () => {
  it('shows avg clients per AP rounded', () => {
    render(
      <InsightCardsGrid
        apStats={{ ...baseApStats, online: 9 }}
        clientStats={{ ...baseClientStats, total: 50 }}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    // 50 / 9 = 5.55 → 6
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('shows 0 avg clients when no APs online', () => {
    render(
      <InsightCardsGrid
        apStats={{ ...baseApStats, online: 0 }}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    // The "0" is rendered as the avg-clients value; assert presence loosely
    // since other zero-valued elements may exist.
    expect(screen.getByText('Avg Clients per AP').nextElementSibling?.textContent).toBe('0');
  });
});

describe('InsightCardsGrid — Anomaly Detection card', () => {
  it('shows All Clear when no offline APs and no critical alerts', () => {
    render(
      <InsightCardsGrid
        apStats={{ ...baseApStats, offline: 0 }}
        clientStats={baseClientStats}
        alertCounts={{ critical: 0, warning: 0 }}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('All Clear')).toBeInTheDocument();
  });

  it('shows offline-AP alert when offline > 0', () => {
    render(
      <InsightCardsGrid
        apStats={{ ...baseApStats, offline: 3 }}
        clientStats={baseClientStats}
        alertCounts={{ critical: 0, warning: 0 }}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('Offline Access Points')).toBeInTheDocument();
    expect(screen.queryByText('All Clear')).not.toBeInTheDocument();
  });

  it('shows critical alert row when alertCounts.critical > 0', () => {
    render(
      <InsightCardsGrid
        apStats={baseApStats}
        clientStats={baseClientStats}
        alertCounts={{ critical: 4, warning: 0 }}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('Critical Alerts')).toBeInTheDocument();
  });

  it('renders an "Updating..." last-checked when lastUpdate is null', () => {
    render(
      <InsightCardsGrid
        apStats={baseApStats}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText(/Updating\.\.\./)).toBeInTheDocument();
  });

  it('renders the locale time when lastUpdate is provided', () => {
    const ts = new Date('2026-05-08T12:00:00Z');
    render(
      <InsightCardsGrid
        apStats={baseApStats}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={ts}
      />
    );
    expect(screen.getByText(new RegExp(ts.toLocaleTimeString()))).toBeInTheDocument();
  });
});

describe('InsightCardsGrid — Predictive Maintenance card', () => {
  it('shows Systems Healthy when no low power and no poor services', () => {
    render(
      <InsightCardsGrid
        apStats={{ ...baseApStats, lowPower: 0 }}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('Systems Healthy')).toBeInTheDocument();
  });

  it('shows Low Power AP row when lowPower > 0', () => {
    render(
      <InsightCardsGrid
        apStats={{ ...baseApStats, lowPower: 2 }}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('Low Power APs')).toBeInTheDocument();
  });

  it('shows Service Degradation row when poorServices is non-empty', () => {
    render(
      <InsightCardsGrid
        apStats={baseApStats}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[{ id: 's1' }]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText('Service Degradation')).toBeInTheDocument();
  });

  it('lists up to 3 model names', () => {
    render(
      <InsightCardsGrid
        apStats={{
          ...baseApStats,
          models: { 'AP-650': 5, 'AP-460': 4, 'AP-310': 3, 'AP-260': 2 },
        }}
        clientStats={baseClientStats}
        alertCounts={baseAlertCounts}
        poorServices={[]}
        lastUpdate={null}
      />
    );
    expect(screen.getByText(/Models tracked:/)).toBeInTheDocument();
    expect(screen.getByText(/\+1 more/)).toBeInTheDocument();
  });
});
