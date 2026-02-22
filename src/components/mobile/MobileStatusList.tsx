/**
 * MobileStatusList - Vertical list container for mobile
 * NO TABLES. Smooth scrolling with skeleton loading.
 */

import React from 'react';
import { Skeleton } from '../ui/skeleton';

interface MobileStatusListProps {
  children: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  emptyMessage?: string;
}

export function MobileStatusList({ children, loading, loadingRows = 5, emptyMessage = 'No items found' }: MobileStatusListProps) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: loadingRows }).map((_, i) => (
          <div key={i} className="px-3 py-2.5 bg-card/50 rounded-xl border border-border/50">
            <Skeleton className="h-4 w-3/4 mb-1.5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!children || (Array.isArray(children) && children.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {children}
    </div>
  );
}
