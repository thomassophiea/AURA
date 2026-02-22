/**
 * MobileStatusRow - Two-line row component (ENFORCED)
 * Primary line: name + status badge
 * Secondary line: max 2 attributes
 */

import React from 'react';
import { ChevronRight, Circle } from 'lucide-react';
import { Badge } from '../ui/badge';

interface MobileStatusRowProps {
  primaryText: string;
  secondaryText: string;
  status?: {
    label: string;
    variant: 'default' | 'success' | 'warning' | 'destructive';
  };
  indicator?: 'online' | 'offline' | 'warning';
  onClick?: () => void;
  rightContent?: React.ReactNode;
}

export function MobileStatusRow({
  primaryText,
  secondaryText,
  status,
  indicator,
  onClick,
  rightContent,
}: MobileStatusRowProps) {
  const indicatorColors = {
    online: 'text-green-500',
    offline: 'text-red-500',
    warning: 'text-amber-500',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        w-full px-3 py-2.5 bg-card/50 rounded-xl border border-border/50
        flex items-center gap-2.5 min-h-[56px]
        backdrop-blur-sm shadow-sm
        ${onClick ? 'active:bg-accent/80 active:scale-[0.99] transition-all duration-150 cursor-pointer' : ''}
      `}
    >
      {/* Status Indicator Dot */}
      {indicator && (
        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
          indicator === 'online' ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' :
          indicator === 'offline' ? 'bg-red-500' : 'bg-amber-500'
        }`} />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Primary Line: Name + Badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {primaryText}
          </span>
          {status && (
            <Badge variant={status.variant} className="text-[9px] px-1.5 py-0 h-4 font-medium">
              {status.label}
            </Badge>
          )}
        </div>

        {/* Secondary Line: Attributes */}
        <p className="text-xs text-muted-foreground/80 truncate mt-0.5">
          {secondaryText}
        </p>
      </div>

      {/* Right Content or Chevron */}
      {rightContent || (onClick && <ChevronRight className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />)}
    </Component>
  );
}
