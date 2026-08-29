import * as React from 'react';
import { Badge } from './badge';
import { cn } from './utils';
import {
  normalizeStatus,
  statusDisplayLabel,
  STATUS_TONES,
  type SemanticStatus,
} from '@/lib/statusColors';

interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Raw status string (any vocabulary) or a pre-normalized semantic status. */
  status: string | SemanticStatus | null | undefined;
  /** Dot diameter in px (default 8). */
  size?: number;
}

/**
 * Theme-correct status dot. Color carries through the `--status-*` vars, so
 * the same state is the same color on every page in both themes. Always pair
 * with a visible label or an aria-label — color alone is not meaning.
 */
export const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ status, size = 8, className, ...props }, ref) => {
    const tone = STATUS_TONES[normalizeStatus(status)];
    return (
      <span
        ref={ref}
        aria-hidden={props['aria-label'] ? undefined : true}
        className={cn('inline-block shrink-0 rounded-full', tone.dot, className)}
        style={{ width: size, height: size }}
        {...props}
      />
    );
  }
);
StatusDot.displayName = 'StatusDot';

interface StatusBadgeProps extends React.ComponentProps<'span'> {
  /** Raw status string — normalized internally. */
  status: string | null | undefined;
  /**
   * Label override. By default the raw value is shown when presentable
   * ("Online", "Connected") and rewritten when machine-speak ("InService").
   */
  label?: string;
  /** Render the leading dot (default true). */
  withDot?: boolean;
}

/**
 * The shared status badge: tinted surface + dot + normalized label.
 * Replaces the per-page getStatusBadgeVariant / getSeverityBadge helpers.
 */
export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, withDot = true, className, ...props }, ref) => {
    const semantic = normalizeStatus(status);
    const tone = STATUS_TONES[semantic];
    const text = label ?? statusDisplayLabel(status);
    return (
      <Badge ref={ref} variant={tone.badgeVariant} className={cn('gap-1.5', className)} {...props}>
        {withDot && <StatusDot status={semantic} size={6} />}
        {text}
      </Badge>
    );
  }
);
StatusBadge.displayName = 'StatusBadge';
