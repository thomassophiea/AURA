import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ControllerIdentityBadge } from './ControllerIdentityBadge';

describe('ControllerIdentityBadge', () => {
  it('shows hostname and truncated locking id when ok', () => {
    render(<ControllerIdentityBadge identity={{ hostname: 'xcc-lab-01', lockingId: '1A2B-3C4D-5E6F', fetchedAt: '2026-06-16T00:00:00Z', status: 'ok' }} />);
    expect(screen.getByText('xcc-lab-01')).toBeInTheDocument();
    expect(screen.getByText(/Locking ID/)).toBeInTheDocument();
  });

  it('shows unavailable note when unreachable', () => {
    render(<ControllerIdentityBadge identity={{ hostname: '1.2.3.4', lockingId: '', fetchedAt: '2026-06-16T00:00:00Z', status: 'unreachable' }} />);
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    expect(screen.getByText(/Locking ID unavailable/i)).toBeInTheDocument();
  });

  it('renders nothing when identity is null', () => {
    const { container } = render(<ControllerIdentityBadge identity={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
