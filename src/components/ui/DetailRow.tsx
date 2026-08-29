import * as React from 'react';
import { cn } from './utils';
import { EmptyCell, MonoCell } from './cells';

interface DetailRowProps {
  label: React.ReactNode;
  /** Value to render. Strings get truncate+title hardening; nodes render as-is. */
  value?: React.ReactNode;
  /** Render string values in monospace with copy-on-hover (MAC, IP, serial…). */
  mono?: boolean;
  /** Copy-toast label when mono (e.g. "MAC address"). */
  copyLabel?: string;
  /** Extra classes for the row container. */
  className?: string;
  /** Extra classes for the value span (ignored for custom nodes). */
  valueClassName?: string;
}

/**
 * The hardened label/value row for detail panes. Replaces the 125 hand-rolled
 * `flex justify-between` rows that broke on long hostnames, MACs and IPv6:
 * the label never shrinks, the value truncates with the full text recoverable
 * (title attr, or copy button in mono mode).
 */
export function DetailRow({
  label,
  value,
  mono = false,
  copyLabel,
  className,
  valueClassName,
}: DetailRowProps) {
  let rendered: React.ReactNode;
  if (value === null || value === undefined || value === '') {
    rendered = <EmptyCell />;
  } else if (typeof value === 'string' || typeof value === 'number') {
    const str = String(value);
    rendered = mono ? (
      <MonoCell value={str} label={copyLabel ?? String(label)} className={valueClassName} />
    ) : (
      <span className={cn('block min-w-0 truncate text-sm font-medium', valueClassName)} title={str}>
        {str}
      </span>
    );
  } else {
    rendered = value;
  }

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center justify-end text-right">{rendered}</span>
    </div>
  );
}
