import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// vi.mock factories are hoisted above any module-level `const`s, so the
// mock fns must come from vi.hoisted() to be referenceable inside the
// factory.
const { subscribeToApiLogs, getApiLogs } = vi.hoisted(() => ({
  subscribeToApiLogs: vi.fn(),
  getApiLogs: vi.fn(),
}));
vi.mock('../../services/api', () => ({
  apiService: {
    subscribeToApiLogs,
    getApiLogs,
  },
}));

import { ConnectionState } from './ConnectionState';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
  subscribeToApiLogs.mockReset();
  subscribeToApiLogs.mockReturnValue(() => {});
  getApiLogs.mockReset();
  getApiLogs.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

const ok = (msAgo: number) => ({
  status: 200,
  isPending: false,
  timestamp: new Date(Date.now() - msAgo),
});

describe('ConnectionState', () => {
  it('shows WAITING when no successful log has been seeded', () => {
    render(<ConnectionState />);
    expect(screen.getByText('WAITING')).toBeInTheDocument();
  });

  it('shows LIVE within the staleAfterSeconds window after a recent success', () => {
    getApiLogs.mockReturnValue([ok(5_000)]); // 5s ago
    render(<ConnectionState />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('flips to STALE between staleAfterSeconds and offlineAfterSeconds', () => {
    getApiLogs.mockReturnValue([ok(45_000)]); // 45s ago — past 30s default
    render(<ConnectionState />);
    expect(screen.getByText('STALE')).toBeInTheDocument();
  });

  it('flips to OFFLINE past offlineAfterSeconds', () => {
    getApiLogs.mockReturnValue([ok(180_000)]); // 3m ago — past 120s default
    render(<ConnectionState />);
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });

  it('subscribes to apiService log updates and re-renders on a new success', () => {
    let push: ((log: { status: number; isPending: boolean; timestamp: Date }) => void) | undefined;
    subscribeToApiLogs.mockImplementation(
      (cb: (log: { status: number; isPending: boolean; timestamp: Date }) => void) => {
        push = cb;
        return () => {};
      }
    );
    render(<ConnectionState />);
    expect(screen.getByText('WAITING')).toBeInTheDocument();
    act(() => {
      push?.({
        status: 200,
        isPending: false,
        timestamp: new Date(Date.now()),
      });
    });
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('honors a custom staleAfterSeconds threshold', () => {
    getApiLogs.mockReturnValue([ok(20_000)]); // 20s ago
    render(<ConnectionState staleAfterSeconds={10} />);
    // 20s past a 10s threshold → STALE.
    expect(screen.getByText('STALE')).toBeInTheDocument();
  });

  it('does not seed lastSuccess from non-2xx logs', () => {
    getApiLogs.mockReturnValue([
      { status: 500, isPending: false, timestamp: new Date() },
      { status: undefined, isPending: true, timestamp: new Date() },
    ]);
    render(<ConnectionState />);
    expect(screen.getByText('WAITING')).toBeInTheDocument();
  });

  it('exposes role=status and aria-live=polite for assistive tech', () => {
    const { container } = render(<ConnectionState />);
    const root = container.querySelector('[role="status"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('re-classifies on its own 1Hz tick when no log update arrives', () => {
    // Seed a log that's borderline LIVE, then advance system time so the
    // computed elapsed exceeds the stale threshold.
    getApiLogs.mockReturnValue([ok(28_000)]); // just below 30s
    render(<ConnectionState />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    act(() => {
      vi.setSystemTime(new Date('2026-05-08T12:00:05Z')); // +5s wall clock
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('STALE')).toBeInTheDocument();
  });
});
