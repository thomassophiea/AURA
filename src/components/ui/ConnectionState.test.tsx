import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { ApiCallLog } from '../../types/api';

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

import { ConnectionState, classifyConnection, outcomeOf } from './ConnectionState';

let nextId = 1;
function log(partial: Partial<ApiCallLog> & { msAgo?: number }): ApiCallLog {
  const { msAgo = 1_000, ...rest } = partial;
  return {
    id: nextId++,
    method: 'GET',
    endpoint: '/v1/aps/query',
    timestamp: new Date(Date.now() - msAgo),
    duration: 50,
    isPending: false,
    ...rest,
  };
}
const ok = (msAgo = 1_000) => log({ status: 200, msAgo });
const netFail = (msAgo = 1_000) => log({ error: 'Unable to connect', msAgo });
const serverError = (msAgo = 1_000) => log({ status: 503, msAgo });

let push: ((entry: ApiCallLog) => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
  push = undefined;
  subscribeToApiLogs.mockReset();
  subscribeToApiLogs.mockImplementation((cb: (entry: ApiCallLog) => void) => {
    push = cb;
    return () => {};
  });
  getApiLogs.mockReset();
  getApiLogs.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('outcomeOf', () => {
  it('ignores pending and cancelled requests', () => {
    expect(outcomeOf(log({ isPending: true }))).toBeNull();
    expect(outcomeOf(log({ error: 'aborted', cancelled: true }))).toBeNull();
  });

  it('treats any non-429, non-5xx answer as a reachable Gateway', () => {
    expect(outcomeOf(log({ status: 200 }))).toBe('ok');
    expect(outcomeOf(log({ status: 401 }))).toBe('ok');
    expect(outcomeOf(log({ status: 404 }))).toBe('ok');
  });

  it('treats 429 and 5xx as degraded, and no status as a transport failure', () => {
    expect(outcomeOf(log({ status: 429 }))).toBe('degraded');
    expect(outcomeOf(log({ status: 502 }))).toBe('degraded');
    expect(outcomeOf(log({ error: 'timed out' }))).toBe('failed');
  });
});

describe('classifyConnection', () => {
  it('is unknown with no outcomes', () => {
    expect(classifyConnection([])).toBe('unknown');
  });

  it('is live when the latest request succeeded', () => {
    expect(classifyConnection(['failed', 'failed', 'ok'])).toBe('live');
  });

  it('stays live when one endpoint in a healthy fan-out errors', () => {
    expect(classifyConnection(['ok', 'ok', 'ok', 'degraded'])).toBe('live');
    expect(classifyConnection(['ok', 'ok', 'ok', 'failed'])).toBe('live');
  });

  it('is degraded when most recent requests failed', () => {
    expect(classifyConnection(['ok', 'degraded', 'degraded', 'degraded'])).toBe('degraded');
    expect(classifyConnection(['ok', 'degraded', 'failed', 'failed'])).toBe('degraded');
  });

  it('is offline after three consecutive transport failures', () => {
    expect(classifyConnection(['ok', 'ok', 'failed', 'failed', 'failed'])).toBe('offline');
  });
});

describe('ConnectionState', () => {
  it('shows Connecting… when nothing has completed yet', () => {
    render(<ConnectionState />);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
  });

  it('shows Connected after a successful request', () => {
    getApiLogs.mockReturnValue([ok()]);
    render(<ConnectionState />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('stays Connected on an idle page no matter how long it sits (no polling ⇒ no decay)', () => {
    getApiLogs.mockReturnValue([ok(5_000)]);
    render(<ConnectionState />);
    act(() => {
      vi.setSystemTime(new Date('2026-05-08T12:30:00Z'));
      vi.advanceTimersByTime(30 * 60_000);
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByText('Data stale')).toBeNull();
    expect(screen.queryByText('Disconnected')).toBeNull();
  });

  it('turns Disconnected only when requests actually fail to reach the Gateway', () => {
    getApiLogs.mockReturnValue([ok(10_000)]);
    render(<ConnectionState />);
    act(() => {
      push?.(netFail());
      push?.(netFail());
    });
    expect(screen.queryByText('Disconnected')).toBeNull();
    act(() => push?.(netFail()));
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    // …and recovers on the next success.
    act(() => push?.(ok()));
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows Connection degraded when the Gateway answers mostly with server errors', () => {
    getApiLogs.mockReturnValue([serverError(), serverError(), serverError()]);
    render(<ConnectionState />);
    expect(screen.getByText('Connection degraded')).toBeInTheDocument();
  });

  it('does not count a cancelled request or a re-delivered log entry', () => {
    render(<ConnectionState />);
    const success = ok();
    act(() => push?.(success));
    const failure = netFail();
    act(() => {
      push?.(log({ error: 'aborted', cancelled: true }));
      push?.(failure);
      push?.(failure);
      push?.(failure);
    });
    // One real failure after a success is not a disconnect.
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('runs no timer of its own', () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');
    getApiLogs.mockReturnValue([ok()]);
    render(<ConnectionState />);
    expect(intervalSpy).not.toHaveBeenCalled();
  });

  it('exposes role=status and aria-live=polite for assistive tech', () => {
    const { container } = render(<ConnectionState />);
    const root = container.querySelector('[role="status"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });
});
