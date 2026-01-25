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
    warning: 'text-yellow-500',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        w-full p-4 bg-card rounded-lg border border-border
        flex items-center gap-3 min-h-[72px]
        ${onClick ? 'active:bg-accent transition-colors cursor-pointer' : ''}
      `}
    >
      {/* Status Indicator Dot */}
      {indicator && (
        <Circle
          className={`h-2.5 w-2.5 fill-current flex-shrink-0 ${indicatorColors[indicator]}`}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Primary Line: Name + Badge */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base font-medium text-foreground truncate">
            {primaryText}
          </span>
          {status && (
            <Badge variant={status.variant} className="text-[10px] px-1.5 py-0 h-5">
              {status.label}
            </Badge>
          )}
        </div>

        {/* Secondary Line: Attributes (max 2) */}
        <p className="text-sm text-muted-foreground truncate">
          {secondaryText}
        </p>
      </div>

      {/* Right Content or Chevron */}
      {rightContent || (onClick && <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />)}
    </Component>
  );
}
