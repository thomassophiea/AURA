/**
 * Label -> control row with description + inline error, matching the manual
 * useState validation idiom (no RHF/zod). `inline` renders label and control
 * on one line (the Switch pattern from ConfigureRRM).
 */
import React from 'react';
import { Label } from '../../ui/label';
import { cn } from '../../ui/utils';

export interface FieldRowProps {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  /** Single-line layout: label block left, control right (switches, etc.). */
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function FieldRow({
  label,
  htmlFor,
  description,
  error,
  required,
  inline,
  className,
  children,
}: FieldRowProps) {
  const labelNode = (
    <Label htmlFor={htmlFor}>
      {label}
      {required && (
        <span className="text-destructive" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </Label>
  );

  if (inline) {
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            {labelNode}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {labelNode}
      {children}
      {description && !error && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
