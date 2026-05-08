import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RelativeTime } from './RelativeTime';

/**
 * The RelativeTime module caches `nowMs = Date.now()` at module load
 * time and only refreshes it when the shared 1Hz interval fires. Tests
 * with fake timers must advance the clock at least once after mounting
 * so the interval refreshes the snapshot to the fake time.
 */
function renderAndTick(ui: React.ReactElement) {
  const result = render(ui);
  act(() => {
    vi.advanceTimersByTime(1_000);
  });
  return result;
}

describe('RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "just now" within the first 5 seconds', () => {
    renderAndTick(<RelativeTime date={Date.now() - 2_000} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('renders "Ns ago" between 5 and 60 seconds', () => {
    // After renderAndTick advances 1s, elapsed is 12s + 1s = 13s.
    renderAndTick(<RelativeTime date={Date.now() - 12_000} />);
    expect(screen.getByText('13s ago')).toBeInTheDocument();
  });

  it('renders "Nm ago" between 1 minute and 1 hour', () => {
    renderAndTick(<RelativeTime date={Date.now() - 5 * 60_000} />);
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('renders "Nh ago" past 1 hour with no minutes when minutes are 0', () => {
    renderAndTick(<RelativeTime date={Date.now() - 2 * 60 * 60_000} />);
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('renders "Nh Nm ago" when both hours and minutes are non-zero', () => {
    renderAndTick(<RelativeTime date={Date.now() - (2 * 60 * 60_000 + 14 * 60_000)} />);
    expect(screen.getByText('2h 14m ago')).toBeInTheDocument();
  });

  it('falls back to an absolute timestamp past absoluteAfterSeconds', () => {
    const long = Date.now() - 86_500_000; // > 24h
    renderAndTick(<RelativeTime date={long} />);
    // Should not show a relative form like "Nh ago" / "Nm ago" / "Ns ago".
    const relativeForms = ['s ago', 'm ago', 'h ago'];
    for (const form of relativeForms) {
      expect(screen.queryByText(new RegExp(`\\d+${form}\\b`))).not.toBeInTheDocument();
    }
  });

  it('updates roughly every second', () => {
    const ts = Date.now() - 12_000;
    const { container } = renderAndTick(<RelativeTime date={ts} />);
    // After the initial tick (now elapsed = 13s relative to original ts).
    expect(container.textContent).toContain('13s ago');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(container.textContent).toContain('14s ago');
  });

  it('accepts a Date object as well as a millisecond timestamp', () => {
    // After renderAndTick advances 1s, elapsed is 30s + 1s = 31s.
    renderAndTick(<RelativeTime date={new Date(Date.now() - 30_000)} />);
    expect(screen.getByText('31s ago')).toBeInTheDocument();
  });

  it('exposes the absolute timestamp in the title attribute for hover detail', () => {
    const ts = Date.now() - 12_000;
    const { container } = render(<RelativeTime date={ts} />);
    const span = container.querySelector('span');
    expect(span?.getAttribute('title')).toBe(new Date(ts).toLocaleString());
  });

  it('multiple instances share a single tick (smoke test on shared interval)', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    render(
      <>
        <RelativeTime date={Date.now() - 1_000} />
        <RelativeTime date={Date.now() - 2_000} />
        <RelativeTime date={Date.now() - 3_000} />
      </>
    );
    // Other things in jsdom may set intervals (timers, etc.), but the
    // RelativeTime module must not be calling setInterval per instance.
    // We assert there's at most one extra setInterval call with a 1000ms
    // period attributed to RelativeTime.
    const oneSecondCalls = setIntervalSpy.mock.calls.filter(([, period]) => period === 1000).length;
    expect(oneSecondCalls).toBeLessThanOrEqual(1);
  });
});
