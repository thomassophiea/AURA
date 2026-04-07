/**
 * PullToRefreshIndicator - Visual feedback for pull-to-refresh gesture
 */

import React from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';
import type { PullToRefreshState } from '@/hooks/usePullToRefresh';

interface PullToRefreshIndicatorProps {
  state: PullToRefreshState;
  threshold?: number;
}

export function PullToRefreshIndicator({
  state,
  threshold = 60,
}: PullToRefreshIndicatorProps) {
  const { isPulling, pullDistance, isRefreshing, canRelease } = state;
  
  const isVisible = isPulling || isRefreshing || pullDistance > 0;
  
  if (!isVisible) return null;

  const rotation = Math.min((pullDistance / threshold) * 180, 180);
  const opacity = Math.min(pullDistance / (threshold * 0.5), 1);

  return (
    <div
      className="absolute left-0 right-0 flex flex-col items-center justify-center pointer-events-none z-50"
      style={{
        top: -60,
        height: 60,
        transform: `translateY(${isRefreshing ? threshold : pullDistance}px)`,
        transition: isPulling ? 'none' : 'transform 0.3s ease-out',
        opacity: isRefreshing ? 1 : opacity,
      }}
    >
      {isRefreshing ? (
        <>
          <RefreshCw className="h-6 w-6 text-primary animate-spin" />
          <span className="text-xs text-muted-foreground mt-1">Refreshing...</span>
        </>
      ) : (
        <>
          <div
            style={{
              transform: `rotate(${canRelease ? 180 : rotation}deg)`,
              transition: canRelease ? 'transform 0.2s ease-out' : 'none',
            }}
          >
            <ArrowDown className={`h-6 w-6 ${canRelease ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <span className="text-xs text-muted-foreground mt-1">
            {canRelease ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </>
      )}
    </div>
  );
}
