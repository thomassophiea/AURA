import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyChannel } from './EmptyChannel';

describe('EmptyChannel', () => {
  it('renders the title and channel code', () => {
    render(<EmptyChannel channel="CH-01" title="No access points found" />);
    expect(screen.getByText('No access points found')).toBeInTheDocument();
    // Channel code is rendered both as the dim background AND inside the eyebrow when eyebrow is set,
    // so finding it by exact text could match more than one node — we just confirm it is present.
    expect(screen.getAllByText(/CH-01/).length).toBeGreaterThan(0);
  });

  it('combines channel + eyebrow text in the eyebrow row when eyebrow is provided', () => {
    render(<EmptyChannel channel="CH-02" eyebrow="no signal" title="No clients" />);
    expect(screen.getByText(/CH-02 — no signal/)).toBeInTheDocument();
  });

  it('omits eyebrow row when eyebrow not provided', () => {
    render(<EmptyChannel channel="CH-03" title="Empty" />);
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <EmptyChannel
        channel="CH-04"
        title="No clients"
        description="No active clients in the last 24 hours."
      />
    );
    expect(screen.getByText('No active clients in the last 24 hours.')).toBeInTheDocument();
  });

  it('renders a custom action node when provided', () => {
    render(
      <EmptyChannel channel="CH-05" title="x" action={<button type="button">Refresh</button>} />
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('exposes role=status for assistive tech', () => {
    const { container } = render(<EmptyChannel channel="CH-06" title="x" />);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('forwards a custom className onto the root', () => {
    const { container } = render(<EmptyChannel channel="CH-07" title="x" className="custom-x" />);
    expect((container.firstChild as HTMLElement).className).toMatch(/custom-x/);
  });
});
