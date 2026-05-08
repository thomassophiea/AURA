import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstrumentPanel } from './InstrumentPanel';

describe('InstrumentPanel', () => {
  it('renders channel + label in the eyebrow', () => {
    render(<InstrumentPanel channel="CH-01" label="Access Points" value={42} unit="AP" />);
    expect(screen.getByText('CH-01')).toBeInTheDocument();
    expect(screen.getByText(/Access Points/)).toBeInTheDocument();
  });

  it('renders the value and unit', () => {
    render(<InstrumentPanel channel="CH-02" label="Clients" value={100} unit="CLNT" />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('CLNT')).toBeInTheDocument();
  });

  it('renders foot text on both sides when provided', () => {
    render(
      <InstrumentPanel
        channel="CH-03"
        label="Throughput"
        value="1.2"
        unit="MBPS"
        footLeft="↑ 800Kbps"
        footRight="↓ 400Kbps"
      />
    );
    expect(screen.getByText('↑ 800Kbps')).toBeInTheDocument();
    expect(screen.getByText('↓ 400Kbps')).toBeInTheDocument();
  });

  it('skips the foot row entirely when neither footLeft nor footRight provided', () => {
    const { container } = render(<InstrumentPanel channel="CH-04" label="Alerts" value={0} />);
    expect(container.querySelector('.aura-kpi-foot')).toBeNull();
  });

  it('renders as a button (role + tabIndex 0) when onClick is provided', () => {
    const onClick = vi.fn();
    render(
      <InstrumentPanel
        channel="CH-01"
        label="APs"
        value={5}
        onClick={onClick}
        ariaLabel="View APs"
      />
    );
    const btn = screen.getByRole('button', { name: 'View APs' });
    expect(btn).toBeInTheDocument();
    expect(btn.getAttribute('tabindex')).toBe('0');
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <InstrumentPanel
        channel="CH-01"
        label="APs"
        value={5}
        onClick={onClick}
        ariaLabel="View APs"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'View APs' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Enter and Space keypress', () => {
    const onClick = vi.fn();
    render(
      <InstrumentPanel
        channel="CH-01"
        label="APs"
        value={5}
        onClick={onClick}
        ariaLabel="View APs"
      />
    );
    const btn = screen.getByRole('button', { name: 'View APs' });
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does NOT fire onClick on other keys', () => {
    const onClick = vi.fn();
    render(
      <InstrumentPanel
        channel="CH-01"
        label="APs"
        value={5}
        onClick={onClick}
        ariaLabel="View APs"
      />
    );
    const btn = screen.getByRole('button', { name: 'View APs' });
    fireEvent.keyDown(btn, { key: 'a' });
    fireEvent.keyDown(btn, { key: 'Tab' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('falls back to non-button (no role, tabIndex -1) when no onClick', () => {
    const { container } = render(<InstrumentPanel channel="CH-04" label="Alerts" value={0} />);
    const root = container.querySelector('.aura-kpi');
    expect(root?.getAttribute('role')).toBeNull();
    expect(root?.getAttribute('tabindex')).toBe('-1');
  });

  it('honors revealIndex with an explicit animation-delay style', () => {
    const { container } = render(
      <InstrumentPanel channel="CH-05" label="X" value={0} revealIndex={3} />
    );
    const root = container.querySelector('.aura-kpi') as HTMLElement;
    expect(root.style.animationDelay).toBe(`${120 + 3 * 60}ms`);
  });

  it('applies tone classes to footLeft / footRight via tone props', () => {
    const { container } = render(
      <InstrumentPanel
        channel="CH-06"
        label="X"
        value={0}
        footLeft="ok"
        footLeftTone="good"
        footRight="bad"
        footRightTone="bad"
      />
    );
    const foot = container.querySelector('.aura-kpi-foot') as HTMLElement;
    expect(foot.querySelector('.aura-kpi-foot-good')).not.toBeNull();
    expect(foot.querySelector('.aura-kpi-foot-bad')).not.toBeNull();
  });

  it('forwards a custom className onto the root', () => {
    const { container } = render(
      <InstrumentPanel channel="CH-07" label="X" value={0} className="custom-x" />
    );
    expect((container.firstChild as HTMLElement).className).toMatch(/custom-x/);
  });
});
