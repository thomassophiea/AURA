import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoreActivitySection } from './CoreActivitySection';

const baseAp = {
  total: 10,
  online: 9,
  offline: 1,
  models: { 'AP-650': 6, 'AP-460': 4 },
};
const baseClient = {
  total: 50,
  authenticated: 48,
  throughputUpload: 2_000_000,
  throughputDownload: 8_000_000,
};
const baseAlerts = { critical: 1, warning: 2 };

describe('CoreActivitySection', () => {
  it('renders the section title and description', () => {
    render(
      <CoreActivitySection
        apStats={baseAp}
        clientStats={baseClient}
        alertCounts={baseAlerts}
        throughputTrend={[]}
      />
    );
    expect(screen.getByText('Core Operational Activity')).toBeInTheDocument();
    expect(screen.getByText(/Real-time network operations/)).toBeInTheDocument();
  });

  it('shows online + offline badges and counts', () => {
    render(
      <CoreActivitySection
        apStats={baseAp}
        clientStats={baseClient}
        alertCounts={baseAlerts}
        throughputTrend={[]}
      />
    );
    expect(screen.getByText('9 Online')).toBeInTheDocument();
    expect(screen.getByText('1 Offline')).toBeInTheDocument();
  });

  it('hides the offline badge when offline === 0', () => {
    render(
      <CoreActivitySection
        apStats={{ ...baseAp, offline: 0, online: 10 }}
        clientStats={baseClient}
        alertCounts={baseAlerts}
        throughputTrend={[]}
      />
    );
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument();
  });

  it('lists each AP model with its count', () => {
    render(
      <CoreActivitySection
        apStats={baseAp}
        clientStats={baseClient}
        alertCounts={baseAlerts}
        throughputTrend={[]}
      />
    );
    expect(screen.getByText('AP-650')).toBeInTheDocument();
    expect(screen.getByText('AP-460')).toBeInTheDocument();
  });

  it('hides the Models section when models map is empty', () => {
    render(
      <CoreActivitySection
        apStats={{ ...baseAp, models: {} }}
        clientStats={baseClient}
        alertCounts={baseAlerts}
        throughputTrend={[]}
      />
    );
    expect(screen.queryByText('Models')).not.toBeInTheDocument();
  });

  it('renders auth count + auth rate %', () => {
    render(
      <CoreActivitySection
        apStats={baseAp}
        clientStats={{ ...baseClient, total: 50, authenticated: 40 }}
        alertCounts={baseAlerts}
        throughputTrend={[]}
      />
    );
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('renders critical and warning badges when both are non-zero', () => {
    render(
      <CoreActivitySection
        apStats={baseAp}
        clientStats={baseClient}
        alertCounts={{ critical: 3, warning: 5 }}
        throughputTrend={[]}
      />
    );
    expect(screen.getByText('3 Critical')).toBeInTheDocument();
    expect(screen.getByText('5 Warning')).toBeInTheDocument();
  });

  it('shows All systems normal when both alert counts are zero', () => {
    render(
      <CoreActivitySection
        apStats={baseAp}
        clientStats={baseClient}
        alertCounts={{ critical: 0, warning: 0 }}
        throughputTrend={[]}
      />
    );
    expect(screen.getByText('All systems normal')).toBeInTheDocument();
  });

  it('renders Avg per client only when clientStats.total > 0', () => {
    const { rerender } = render(
      <CoreActivitySection
        apStats={baseAp}
        clientStats={{ ...baseClient, total: 0 }}
        alertCounts={baseAlerts}
        throughputTrend={[]}
      />
    );
    expect(screen.queryByText(/Avg per client/)).not.toBeInTheDocument();

    rerender(
      <CoreActivitySection
        apStats={baseAp}
        clientStats={baseClient}
        alertCounts={baseAlerts}
        throughputTrend={[]}
      />
    );
    expect(screen.getByText(/Avg per client/)).toBeInTheDocument();
  });
});
