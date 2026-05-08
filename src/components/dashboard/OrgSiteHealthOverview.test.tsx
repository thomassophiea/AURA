import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrgSiteHealthOverview } from './OrgSiteHealthOverview';

const bands = [
  { band: '5GHz', count: 30, color: '#0ea5e9' },
  { band: '2.4GHz', count: 10, color: '#a78bfa' },
];
const snr = [
  { category: 'Excellent (>40dB)', count: 25, color: '#10b981' },
  { category: 'Good (25-40dB)', count: 15, color: '#f59e0b' },
];

describe('OrgSiteHealthOverview', () => {
  it('renders "Org Health Overview" when scope is "all"', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="all"
        rfqiData={[]}
        avgRssi={0}
        avgSnr={0}
        totalClients={40}
        bandDistribution={[]}
        snrDistribution={[]}
      />
    );
    expect(screen.getByText('Org Health Overview')).toBeInTheDocument();
  });

  it('renders "Site Health Overview" when scope is a site id', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="site-1"
        rfqiData={[]}
        avgRssi={0}
        avgSnr={0}
        totalClients={40}
        bandDistribution={[]}
        snrDistribution={[]}
      />
    );
    expect(screen.getByText('Site Health Overview')).toBeInTheDocument();
  });

  it('shows -- placeholders when metrics are zero/empty', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="all"
        rfqiData={[]}
        avgRssi={0}
        avgSnr={0}
        totalClients={0}
        bandDistribution={[]}
        snrDistribution={[]}
      />
    );
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(3);
  });

  it('renders avg RSSI in dBm when non-zero', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="all"
        rfqiData={[]}
        avgRssi={-65}
        avgSnr={0}
        totalClients={40}
        bandDistribution={[]}
        snrDistribution={[]}
      />
    );
    expect(screen.getByText('-65 dBm')).toBeInTheDocument();
  });

  it('renders avg SNR in dB when > 0', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="all"
        rfqiData={[]}
        avgRssi={0}
        avgSnr={32}
        totalClients={40}
        bandDistribution={[]}
        snrDistribution={[]}
      />
    );
    expect(screen.getByText('32 dB')).toBeInTheDocument();
  });

  it('computes RFQI as the avg of rfqi values, scaling small values * 20', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="all"
        // rfqi=4 < 5 → scaled to 80; rfqi=4 → scaled to 80; avg = 80 → "80%"
        rfqiData={[
          { timestamp: 0, healthy: 0, needsAttention: 0, rfqi: 4 },
          { timestamp: 0, healthy: 0, needsAttention: 0, rfqi: 4 },
        ]}
        avgRssi={0}
        avgSnr={0}
        totalClients={40}
        bandDistribution={[]}
        snrDistribution={[]}
      />
    );
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('renders the band distribution rows with their counts and percent', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="all"
        rfqiData={[]}
        avgRssi={0}
        avgSnr={0}
        totalClients={40}
        bandDistribution={bands}
        snrDistribution={[]}
      />
    );
    expect(screen.getByText('5GHz')).toBeInTheDocument();
    expect(screen.getByText('30 (75%)')).toBeInTheDocument();
    expect(screen.getByText('10 (25%)')).toBeInTheDocument();
  });

  it('shows the "No band data available" empty state', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="all"
        rfqiData={[]}
        avgRssi={0}
        avgSnr={0}
        totalClients={40}
        bandDistribution={[]}
        snrDistribution={[]}
      />
    );
    expect(screen.getByText('No band data available')).toBeInTheDocument();
  });

  it('renders SNR distribution rows with category, count, and percent of SNR-tracked clients', () => {
    render(
      <OrgSiteHealthOverview
        siteScope="all"
        rfqiData={[]}
        avgRssi={0}
        avgSnr={0}
        totalClients={40}
        bandDistribution={[]}
        snrDistribution={snr}
      />
    );
    expect(screen.getByText('Excellent (>40dB)')).toBeInTheDocument();
    expect(screen.getByText('Good (25-40dB)')).toBeInTheDocument();
    // SNR percentages are computed against snrTotal (40), not totalClients —
    // 25/40 = 62.5% → 63
    expect(screen.getByText('25 (63%)')).toBeInTheDocument();
    expect(screen.getByText('15 (38%)')).toBeInTheDocument();
  });
});
