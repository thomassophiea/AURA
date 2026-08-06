import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DataFreshnessBadge } from './DataFreshnessBadge';

const LAST_SUCCESS = '2026-08-05T11:00:00.000Z';

describe('DataFreshnessBadge', () => {
  it('labels recently collected data as stored, never as live', () => {
    render(<DataFreshnessBadge state="fresh" lastSuccessfulCollectionAt={LAST_SUCCESS} />);
    const badge = screen.getByLabelText(/database/i);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent?.toLowerCase()).not.toContain('live');
  });

  it('warns when data is stale and names the last successful collection', () => {
    render(<DataFreshnessBadge state="stale" lastSuccessfulCollectionAt={LAST_SUCCESS} />);
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByLabelText(/showing stored data through/i)).toBeInTheDocument();
  });

  it('says the gateway is unavailable and that stored data is shown', () => {
    render(<DataFreshnessBadge state="offline" lastSuccessfulCollectionAt={LAST_SUCCESS} />);
    expect(screen.getByText('Gateway unavailable')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/gateway unavailable\. showing stored data through/i)
    ).toBeInTheDocument();
  });

  it('distinguishes never-collected from offline', () => {
    const { unmount } = render(<DataFreshnessBadge state="never_collected" />);
    expect(screen.getByText('No data collected')).toBeInTheDocument();
    expect(screen.getByLabelText(/different from a gateway being offline/i)).toBeInTheDocument();
    unmount();

    render(<DataFreshnessBadge state="offline" />);
    expect(screen.getByText('Gateway unavailable')).toBeInTheDocument();
  });

  it('handles a missing collection timestamp without rendering "Invalid Date"', () => {
    render(<DataFreshnessBadge state="stale" lastSuccessfulCollectionAt={null} />);
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
  });

  it('ignores an unparseable timestamp rather than showing it', () => {
    render(<DataFreshnessBadge state="stale" lastSuccessfulCollectionAt="not-a-date" />);
    expect(screen.getByLabelText(/no recent collection\. showing stored data\.$/i)).toBeInTheDocument();
  });

  it('falls back to an unknown state for an unrecognized value', () => {
    // @ts-expect-error deliberately exercising an out-of-contract value
    render(<DataFreshnessBadge state="bogus" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('exposes the state for styling and assertions', () => {
    render(<DataFreshnessBadge state="offline" />);
    expect(screen.getByText('Gateway unavailable').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'offline'
    );
  });
});
