import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CortexDeviceVerdict } from './CortexDeviceVerdict';
import { deviceVerdictFromLedger } from '../readings';

describe('CortexDeviceVerdict', () => {
  it('shows both verdicts for a single AP', () => {
    render(<CortexDeviceVerdict verdict={{ health: 'Healthy', rma: 'No RMA Indicated' }} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('No RMA Indicated')).toBeInTheDocument();
  });

  it('never implies a recommended RMA has been raised', () => {
    render(<CortexDeviceVerdict verdict={{ health: 'Unhealthy', rma: 'RMA Recommended' }} />);
    expect(screen.getByText(/assessment only — not a raised case/i)).toBeInTheDocument();
  });

  it('says in words that unknown APs are not a clean bill', () => {
    // The whole feature exists because this count was being read as "fine".
    render(<CortexDeviceVerdict verdict={{
      fleet: { apCount: 8, healthy: 4, degraded: 1, unhealthy: 0, unknown: 3, rmaCandidates: 0, rmaRecommended: 0 },
    }} />);
    expect(screen.getByText(/3 of 8 could not be assessed/i)).toBeInTheDocument();
    expect(screen.getByText(/not a clean\s+bill of health/i)).toBeInTheDocument();
  });

  it('does not add that line when nothing was unknown', () => {
    render(<CortexDeviceVerdict verdict={{
      fleet: { apCount: 8, healthy: 8, degraded: 0, unhealthy: 0, unknown: 0, rmaCandidates: 0, rmaRecommended: 0 },
    }} />);
    expect(screen.queryByText(/could not be assessed/i)).toBeNull();
  });

  it('renders nothing when there is no verdict', () => {
    const { container } = render(<CortexDeviceVerdict verdict={{}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('deviceVerdictFromLedger', () => {
  it('reads the fleet counts off the digest, not the prose', () => {
    const v = deviceVerdictFromLedger([
      { tool: 'getDeviceHealth', ok: true, digest: { deviceHealthFleet: { apCount: 8, healthy: 4, degraded: 4, unhealthy: 0, unknown: 0, rmaCandidates: 0, rmaRecommended: 0 } } },
    ] as never);
    expect(v?.fleet).toMatchObject({ apCount: 8, healthy: 4, degraded: 4 });
  });

  it('ignores a FAILED assessment rather than showing a verdict from it', () => {
    const v = deviceVerdictFromLedger([
      { tool: 'getDeviceHealth', ok: false, digest: { deviceHealth: { health: 'Healthy', rma: 'No RMA Indicated' } } },
    ] as never);
    expect(v).toBeNull();
  });

  it('returns null when no device assessment ran', () => {
    expect(deviceVerdictFromLedger([{ tool: 'diagnoseClient', ok: true, digest: {} }] as never)).toBeNull();
  });
});
