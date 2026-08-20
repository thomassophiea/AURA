import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnergySiteRankings } from './EnergySiteRankings';
import type { EnergySite } from '@/types/energy';

const sites: EnergySite[] = [
  { siteId: 's1', siteName: 'HQ', apWithDataCount: 40, totalKwh: 210.5, avgWattsPerAp: 12.4, estimatedAnnualCost: 1200.5 },
  { siteId: 's2', siteName: 'Branch', apWithDataCount: 10, totalKwh: 55.1, avgWattsPerAp: 11.1, estimatedAnnualCost: 300.25 },
];

describe('EnergySiteRankings', () => {
  it('renders one row per site with formatted values', () => {
    render(<EnergySiteRankings sites={sites} loading={false} onSelectSite={() => {}} />);
    expect(screen.getByText('HQ')).toBeInTheDocument();
    expect(screen.getByText('210.5 kWh')).toBeInTheDocument();
    expect(screen.getByText('$1,200.50')).toBeInTheDocument();
  });

  it('invokes onSelectSite when a row is clicked', () => {
    const onSelectSite = vi.fn();
    render(<EnergySiteRankings sites={sites} loading={false} onSelectSite={onSelectSite} />);
    fireEvent.click(screen.getByText('Branch'));
    expect(onSelectSite).toHaveBeenCalledWith('s2');
  });

  it('uses the configured currency symbol', () => {
    render(
      <EnergySiteRankings
        sites={sites}
        loading={false}
        onSelectSite={() => {}}
        currencySymbol="€"
      />
    );
    expect(screen.getByText('€1,200.50')).toBeInTheDocument();
  });
});
