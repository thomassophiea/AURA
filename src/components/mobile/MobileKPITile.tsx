/**
 * MobileKPITile - Large tappable status tile
 * Shows key metric with trend indicator
 */

import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MobileKPITileProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
  };
  badge?: number;
  status?: 'good' | 'warning' | 'critical';
  onClick?: () => void;
}

export function MobileKPITile({ icon: Icon, label, value, trend, badge, status, onClick }: MobileKPITileProps) {
  const statusColors = {
    good: 'border-green-500/20 bg-green-500/5',
    warning: 'border-yellow-500/20 bg-yellow-500/5',
    critical: 'border-red-500/20 bg-red-500/5',
  };

  const trendIcons = {
    up: TrendingUp,
    down: TrendingDown,
    neutral: Minus,
  };

  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    neutral: 'text-muted-foreground',
  };

  const TrendIcon = trend ? trendIcons[trend.direction] : null;

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-start p-4 rounded-xl border-2
        transition-all active:scale-95 min-h-[120px]
        ${status ? statusColors[status] : 'border-border bg-card'}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
      `}
      style={{ minHeight: '120px', minWidth: '100%' }}
    >
      {/* Badge */}
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-2 right-2 h-6 min-w-[24px] px-2 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}

      {/* Icon */}
      <div className="mb-2">
        <Icon className="h-6 w-6 text-primary" strokeWidth={2} />
      </div>

      {/* Value */}
      <div className="text-3xl font-bold text-foreground mb-1">
        {value}
      </div>

      {/* Label and Trend */}
      <div className="flex items-center justify-between w-full mt-auto">
        <span className="text-sm text-muted-foreground font-medium">
          {label}
        </span>
        {trend && TrendIcon && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trendColors[trend.direction]}`}>
            <TrendIcon className="h-3 w-3" />
            <span>{trend.value}</span>
          </div>
        )}
      </div>
    </button>
  );
}
