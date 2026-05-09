import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';

const idleState = {
  isPulling: false,
  pullDistance: 0,
  isRefreshing: false,
  canRelease: false,
};

describe('PullToRefreshIndicator', () => {
  it('renders nothing when fully idle', () => {
    const { container } = render(<PullToRefreshIndicator state={idleState} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the "Pull to refresh" prompt when pulling', () => {
    render(<PullToRefreshIndicator state={{ ...idleState, isPulling: true, pullDistance: 30 }} />);
    expect(screen.getByText('Pull to refresh')).toBeTruthy();
  });

  it('switches to "Release to refresh" once canRelease=true', () => {
    render(
      <PullToRefreshIndicator
        state={{ ...idleState, isPulling: true, pullDistance: 80, canRelease: true }}
      />
    );
    expect(screen.getByText('Release to refresh')).toBeTruthy();
  });

  it('shows the spinner + Refreshing... text when isRefreshing', () => {
    const { container } = render(
      <PullToRefreshIndicator state={{ ...idleState, isRefreshing: true }} />
    );
    expect(screen.getByText('Refreshing...')).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders with translateY tied to pullDistance', () => {
    const { container } = render(
      <PullToRefreshIndicator state={{ ...idleState, isPulling: true, pullDistance: 40 }} />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.transform).toBe('translateY(40px)');
  });

  it('translateY pinned to threshold while refreshing', () => {
    const { container } = render(
      <PullToRefreshIndicator state={{ ...idleState, isRefreshing: true }} threshold={100} />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.transform).toBe('translateY(100px)');
  });

  it('opacity scales with pullDistance', () => {
    const { container } = render(
      <PullToRefreshIndicator
        state={{ ...idleState, isPulling: true, pullDistance: 15 }}
        threshold={60}
      />
    );
    const root = container.firstChild as HTMLElement;
    // pullDistance / (threshold * 0.5) = 15 / 30 = 0.5
    expect(root.style.opacity).toBe('0.5');
  });

  it('opacity is 1 while refreshing regardless of pullDistance', () => {
    const { container } = render(
      <PullToRefreshIndicator state={{ ...idleState, isRefreshing: true, pullDistance: 0 }} />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.opacity).toBe('1');
  });
});
