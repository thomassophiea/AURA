/**
 * PageLoadingState - Consistent loading states across the app
 * Prevents ghost items by providing uniform skeleton layouts
 */

import * as React from 'react';
import { cn } from './utils';
import { Skeleton } from './skeleton';

interface CardSkeletonProps {
  variant?: 'stat' | 'chart' | 'table' | 'list';
  count?: number;
  className?: string;
}

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

interface PageSkeletonProps {
  showHeader?: boolean;
  showFilters?: boolean;
  contentType?: 'cards' | 'table' | 'list';
  className?: string;
}

interface DashboardSkeletonProps {
  kpiCount?: number;
  chartCount?: number;
  className?: string;
}

interface LoadingOverlayProps {
  isVisible: boolean;
  children: React.ReactNode;
  className?: string;
}

const staggerDelay = (index: number) => ({
  animationDelay: `${index * 75}ms`,
});

function CardSkeleton({ variant = 'stat', count = 1, className }: CardSkeletonProps) {
  const cards = Array.from({ length: count }, (_, i) => i);

  const renderCard = (index: number) => {
    const baseClasses = 'rounded-xl border bg-card transition-opacity duration-300';
    
    switch (variant) {
      case 'stat':
        return (
          <div
            key={index}
            className={cn(baseClasses, 'p-6', className)}
            style={{ ...staggerDelay(index), contentVisibility: 'auto' }}
          >
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        );
      case 'chart':
        return (
          <div
            key={index}
            className={cn(baseClasses, 'p-6', className)}
            style={{ ...staggerDelay(index), contentVisibility: 'auto' }}
          >
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        );
      case 'table':
        return (
          <div
            key={index}
            className={cn(baseClasses, 'p-6', className)}
            style={{ ...staggerDelay(index), contentVisibility: 'auto' }}
          >
            <Skeleton className="h-5 w-32 mb-4" />
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-10 w-full" style={staggerDelay(row)} />
              ))}
            </div>
          </div>
        );
      case 'list':
        return (
          <div
            key={index}
            className={cn(baseClasses, 'p-6', className)}
            style={{ ...staggerDelay(index), contentVisibility: 'auto' }}
          >
            <Skeleton className="h-5 w-32 mb-4" />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="flex items-center gap-3" style={staggerDelay(item)}>
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return <>{cards.map(renderCard)}</>;
}

function TableSkeleton({ rows = 5, columns = 4, className }: TableSkeletonProps) {
  const columnWidths = ['w-1/4', 'w-1/3', 'w-1/5', 'w-1/6', 'w-1/4', 'w-1/5'];

  return (
    <div
      className={cn('rounded-xl border bg-card transition-opacity duration-300', className)}
      style={{ contentVisibility: 'auto' }}
    >
      <div className="border-b p-4">
        <div className="flex gap-4">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton
              key={i}
              className={cn('h-4', columnWidths[i % columnWidths.length])}
              style={staggerDelay(i)}
            />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 p-4" style={staggerDelay(rowIndex)}>
            {Array.from({ length: columns }, (_, colIndex) => (
              <Skeleton
                key={colIndex}
                className={cn('h-5', columnWidths[colIndex % columnWidths.length])}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PageSkeleton({
  showHeader = true,
  showFilters = true,
  contentType = 'cards',
  className,
}: PageSkeletonProps) {
  return (
    <div
      className={cn('space-y-6 transition-opacity duration-300', className)}
      style={{ contentVisibility: 'auto' }}
    >
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
      )}

      {showFilters && (
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-48" style={staggerDelay(0)} />
          <Skeleton className="h-10 w-32" style={staggerDelay(1)} />
          <Skeleton className="h-10 w-32" style={staggerDelay(2)} />
          <div className="flex-1" />
          <Skeleton className="h-10 w-24" style={staggerDelay(3)} />
        </div>
      )}

      {contentType === 'cards' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton variant="stat" count={4} />
        </div>
      )}

      {contentType === 'table' && <TableSkeleton rows={8} columns={5} />}

      {contentType === 'list' && (
        <div className="grid gap-6 md:grid-cols-2">
          <CardSkeleton variant="list" count={2} />
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton({ kpiCount = 4, chartCount = 2, className }: DashboardSkeletonProps) {
  return (
    <div
      className={cn('space-y-6 transition-opacity duration-300', className)}
      style={{ contentVisibility: 'auto' }}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      <div className={cn('grid gap-4', `md:grid-cols-2 lg:grid-cols-${Math.min(kpiCount, 4)}`)}>
        <CardSkeleton variant="stat" count={kpiCount} />
      </div>

      <div className={cn('grid gap-6', chartCount > 1 ? 'md:grid-cols-2' : '')}>
        <CardSkeleton variant="chart" count={chartCount} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <CardSkeleton variant="list" />
        <CardSkeleton variant="table" />
      </div>
    </div>
  );
}

function LoadingOverlay({ isVisible, children, className }: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isVisible && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px] transition-opacity duration-300">
          <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 shadow-lg border">
            <svg
              className="h-5 w-5 animate-spin text-primary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm font-medium">Refreshing...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export {
  CardSkeleton,
  TableSkeleton,
  PageSkeleton,
  DashboardSkeleton,
  LoadingOverlay,
};

export type {
  CardSkeletonProps,
  TableSkeletonProps,
  PageSkeletonProps,
  DashboardSkeletonProps,
  LoadingOverlayProps,
};
