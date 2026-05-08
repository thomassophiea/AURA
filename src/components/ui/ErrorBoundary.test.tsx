import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { getApiLogs } = vi.hoisted(() => ({
  getApiLogs: vi.fn<
    () => Array<{
      method: string;
      endpoint: string;
      status?: number;
      duration?: number;
      error?: string;
      timestamp: Date;
      isPending: boolean;
    }>
  >(),
}));

vi.mock('../../services/api', () => ({
  apiService: {
    getApiLogs,
  },
}));

import { ErrorBoundary } from './ErrorBoundary';

function Boom({ message = 'kaboom' }: { message?: string }): never {
  throw new Error(message);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  getApiLogs.mockReset();
  getApiLogs.mockReturnValue([]);
});

describe('ErrorBoundary — render gates', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div>healthy child</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('healthy child')).toBeInTheDocument();
  });

  it('renders the fallback card when a child throws', () => {
    render(
      <ErrorBoundary fallbackTitle="Page Error">
        <Boom message="x" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Page Error')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
  });

  it('uses the default title when fallbackTitle is not provided', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>OFFLINE</div>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });
});

describe('ErrorBoundary — reset', () => {
  it('Try Again invokes the onReset callback', () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('Refresh Page button is rendered alongside Try Again', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /Refresh Page/i })).toBeInTheDocument();
  });
});

describe('ErrorBoundary — diagnostic Copy report', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('Copy report button writes a structured diagnostic to the clipboard', async () => {
    getApiLogs.mockReturnValue([
      {
        method: 'GET',
        endpoint: '/v1/dashboard',
        status: 500,
        duration: 250,
        timestamp: new Date('2026-05-08T12:00:00Z'),
        isPending: false,
        error: 'boom',
      },
    ]);
    render(
      <ErrorBoundary>
        <Boom message="failed thing" />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /Copy report/i }));
    await act(async () => {
      // allow handleCopyReport's awaited promise to settle
    });
    const calls = (navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(1);
    const payload = calls[0][0] as string;
    expect(payload).toContain('AURA Error Report');
    expect(payload).toContain('failed thing');
    expect(payload).toContain('GET /v1/dashboard 500 250ms');
    expect(payload).toContain('err=boom');
  });

  it('shows "Copied" briefly after a successful copy', async () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /Copy report/i }));
    await act(async () => {
      // settle the writeText promise
    });
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('falls back gracefully if getApiLogs itself throws', () => {
    getApiLogs.mockImplementation(() => {
      throw new Error('logs broken');
    });
    render(
      <ErrorBoundary>
        <Boom message="x" />
      </ErrorBoundary>
    );
    // Just ensure we don't crash; clicking Copy should still call writeText.
    fireEvent.click(screen.getByRole('button', { name: /Copy report/i }));
    expect(navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });
});
