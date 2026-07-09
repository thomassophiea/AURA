/**
 * Override row for the per-AP `*Ovr` pattern: a toggle that switches between
 * the profile-inherited value (read-only tag) and a local override control.
 */
import React from 'react';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { cn } from '../../ui/utils';

export interface OvrRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** True when the field is locally overridden (the `*Ovr` flag). */
  overridden: boolean;
  onOverriddenChange: (overridden: boolean) => void;
  /** Display of the inherited value shown while not overridden. */
  inheritedDisplay?: React.ReactNode;
  className?: string;
  /** The override control, rendered only while overridden. */
  children: React.ReactNode;
}

export function OvrRow({
  label,
  description,
  overridden,
  onOverriddenChange,
  inheritedDisplay,
  className,
  children,
}: OvrRowProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label>{label}</Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!overridden && (
            <Badge variant="secondary" className="text-xs">
              Inherited
            </Badge>
          )}
          <Switch
            checked={overridden}
            onCheckedChange={onOverriddenChange}
            aria-label="Override inherited value"
          />
        </div>
      </div>
      {overridden ? (
        children
      ) : inheritedDisplay !== undefined ? (
        <p className="text-sm text-muted-foreground">{inheritedDisplay}</p>
      ) : null}
    </div>
  );
}
