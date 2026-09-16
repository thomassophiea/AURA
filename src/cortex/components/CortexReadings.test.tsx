/**
 * RFQI is emphasised because it decides contention versus coverage, and the
 * remedies for those two work against each other. An answer that hides it has
 * hidden the most decisive number it holds.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CortexReadings } from './CortexReadings';

const base = {
  rss: null, snr: null, rfqi: null, downlinkLossRatio: null,
  wirelessRttMs: null, networkRttMs: null, dnsRttMs: null, hasIpv4: null,
};

describe('CortexReadings', () => {
  it('shows measured values as tiles with units', () => {
    render(<CortexReadings readings={{ ...base, rss: -61, snr: 31, rfqi: 4, hasIpv4: true }} />);
    expect(screen.getByText('-61 dBm')).toBeInTheDocument();
    expect(screen.getByText('31 dB')).toBeInTheDocument();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();
  });

  it('marks RFQI as the key reading', () => {
    render(<CortexReadings readings={{ ...base, rss: -61, rfqi: 2 }} />);
    expect(screen.getByText('RFQI')).toBeInTheDocument();
    // The emphasis marker rides on the RFQI tile only.
    expect(screen.getByText('key')).toBeInTheDocument();
  });

  it('collapses everything unmeasured into ONE muted line', () => {
    // The defect: an earlier answer gave each absent reading its own bullet, so
    // a healthy client read as uninvestigated.
    const { container } = render(<CortexReadings readings={{ ...base, rss: -61 }} />);
    const absent = container.textContent ?? '';
    expect(absent).toMatch(/Not measured on this read:/);
    expect(absent).toMatch(/RFQI/);
    // One line, not one element per field.
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('bands a bad RFQI differently from a good one', () => {
    const bad = render(<CortexReadings readings={{ ...base, rfqi: 1 }} />).container.innerHTML;
    const good = render(<CortexReadings readings={{ ...base, rfqi: 5 }} />).container.innerHTML;
    expect(bad).toContain('rose');
    expect(good).toContain('emerald');
  });

  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<CortexReadings readings={base} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not treat a missing reading as zero', () => {
    // RFQI 0 is a real, critical value. A null must not paint that tile.
    render(<CortexReadings readings={{ ...base, rss: -61 }} />);
    expect(screen.queryByText('0 / 5')).toBeNull();
  });
});
