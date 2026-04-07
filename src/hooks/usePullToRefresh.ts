/**
 * usePullToRefresh - Native iOS-style pull-to-refresh gesture
 * Triggers refresh callback when user pulls down at top of scrollable area
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useHaptic } from './useHaptic';

export interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
  disabled?: boolean;
}

export interface PullToRefreshState {
  isPulling: boolean;
  pullDistance: number;
  isRefreshing: boolean;
  canRelease: boolean;
}

export interface PullToRefreshReturn {
  state: PullToRefreshState;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  containerRef: React.RefObject<HTMLDivElement>;
  indicatorStyle: React.CSSProperties;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 60,
  maxPull = 120,
  disabled = false,
}: PullToRefreshOptions): PullToRefreshReturn {
  const haptic = useHaptic();
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const hasTriggeredHaptic = useRef(false);

  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
    canRelease: false,
  });

  const canPull = useCallback(() => {
    if (disabled || state.isRefreshing) return false;
    const container = containerRef.current;
    if (!container) return false;
    return container.scrollTop <= 0;
  }, [disabled, state.isRefreshing]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!canPull()) return;
      touchStartY.current = e.touches[0].clientY;
      hasTriggeredHaptic.current = false;
      setState((prev) => ({ ...prev, isPulling: true, pullDistance: 0, canRelease: false }));
    },
    [canPull]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!state.isPulling || state.isRefreshing) return;

      const container = containerRef.current;
      if (!container || container.scrollTop > 0) {
        setState((prev) => ({ ...prev, isPulling: false, pullDistance: 0 }));
        return;
      }

      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartY.current;

      if (diff < 0) {
        setState((prev) => ({ ...prev, pullDistance: 0, canRelease: false }));
        return;
      }

      const resistance = 0.4;
      const pullDistance = Math.min(diff * resistance, maxPull);
      const canRelease = pullDistance >= threshold;

      if (canRelease && !hasTriggeredHaptic.current) {
        haptic.medium();
        hasTriggeredHaptic.current = true;
      } else if (!canRelease && hasTriggeredHaptic.current) {
        hasTriggeredHaptic.current = false;
      }

      setState((prev) => ({ ...prev, pullDistance, canRelease }));
    },
    [state.isPulling, state.isRefreshing, maxPull, threshold, haptic]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!state.isPulling) return;

    if (state.canRelease && !state.isRefreshing) {
      setState((prev) => ({ ...prev, isRefreshing: true, isPulling: false }));
      haptic.success();

      try {
        await onRefresh();
      } finally {
        setState({
          isPulling: false,
          pullDistance: 0,
          isRefreshing: false,
          canRelease: false,
        });
      }
    } else {
      setState({
        isPulling: false,
        pullDistance: 0,
        isRefreshing: false,
        canRelease: false,
      });
    }
  }, [state.isPulling, state.canRelease, state.isRefreshing, onRefresh, haptic]);

  const indicatorStyle: React.CSSProperties = {
    transform: `translateY(${state.isRefreshing ? threshold : state.pullDistance}px)`,
    transition: state.isPulling ? 'none' : 'transform 0.3s ease-out',
  };

  return {
    state,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    containerRef,
    indicatorStyle,
  };
}
