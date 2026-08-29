/**
 * Shared table cell primitives.
 *
 * Every table in the app should render technical identifiers, timestamps,
 * truncated labels and empty values through these — they encode the
 * conventions (mono for identifiers, relative time with absolute tooltip,
 * truncate-with-recovery, one empty glyph) that were previously
 * re-implemented per page.
 */
import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { RelativeTime } from './RelativeTime';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { cn } from './utils';

/** The one empty-value glyph. Replaces the '-' / '—' / 'N/A' mix. */
export function EmptyCell({ className }: { className?: string }) {
  return (
    <span aria-label="No data" className={cn('text-muted-foreground/60', className)}>
      —
    </span>
  );
}

interface MonoCellProps {
  /** The identifier (MAC, IP, serial, FQDN…). Null/empty renders the empty glyph. */
  value: string | null | undefined;
  /** Show a hover copy button (default true). */
  copyable?: boolean;
  /** Announced in the copy toast, e.g. "MAC address". Defaults to "Value". */
  label?: string;
  className?: string;
}

/**
 * Monospace identifier cell with copy-on-hover. The most common operator
 * action on a table is grabbing a MAC/IP/serial; triple-click selection is
 * unreliable on row-click targets, so give it a button.
 */
export function MonoCell({ value, copyable = true, label = 'Value', className }: MonoCellProps) {
  const [copied, setCopied] = React.useState(false);
  if (!value) return <EmptyCell />;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`, { description: value, duration: 1500 });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <span className={cn('group/mono inline-flex min-w-0 items-center gap-1', className)}>
      <span className="truncate font-mono text-xs tabular-nums" title={value}>
        {value}
      </span>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/mono:opacity-100"
        >
          {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
        </button>
      )}
    </span>
  );
}

interface TimestampCellProps {
  /** Epoch ms, ISO string, or Date. Invalid/empty renders the empty glyph. */
  value: number | string | Date | null | undefined;
  /** relative = "5m ago" (absolute in tooltip); absolute = "Mar 4, 14:05". */
  mode?: 'relative' | 'absolute';
  className?: string;
}

function toDate(value: number | string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Consistent timestamp cell: relative by default, absolute recoverable via tooltip. */
export function TimestampCell({ value, mode = 'relative', className }: TimestampCellProps) {
  if (value === null || value === undefined || value === '') return <EmptyCell />;
  const date = toDate(value);
  if (!date) return <EmptyCell />;

  if (mode === 'absolute') {
    const label = date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return (
      <span className={cn('whitespace-nowrap tabular-nums', className)} title={date.toLocaleString()}>
        {label}
      </span>
    );
  }
  return <RelativeTime date={date} className={cn('whitespace-nowrap tabular-nums', className)} />;
}

interface TruncatedCellProps {
  /** Display text. Null/empty renders the empty glyph. */
  value: string | null | undefined;
  /** Max width utility (default 'max-w-[240px]'). Must be a literal class. */
  maxWidthClass?: string;
  /** Use a rich tooltip instead of the native title attribute. */
  tooltip?: boolean;
  className?: string;
}

/**
 * Truncating text cell where the full value stays recoverable. Wraps in a
 * block-level span (truncate is inert on inline boxes) and always carries
 * the complete value in a tooltip/title.
 */
export function TruncatedCell({
  value,
  maxWidthClass = 'max-w-[240px]',
  tooltip = false,
  className,
}: TruncatedCellProps) {
  if (!value) return <EmptyCell />;
  const content = (
    <span className={cn('block truncate', maxWidthClass, className)} title={tooltip ? undefined : value}>
      {value}
    </span>
  );
  if (!tooltip) return content;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[420px] break-words">
          {value}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface NumericCellProps {
  value: number | string | null | undefined;
  /** Rendered after the value with a thin space, e.g. "dBm", "Mbps", "%". */
  unit?: string;
  className?: string;
}

/** Right-aligned numeric cell in tabular numerals — matches the AG `numeric` column type. */
export function NumericCell({ value, unit, className }: NumericCellProps) {
  if (value === null || value === undefined || value === '' || Number.isNaN(value as number)) {
    return <EmptyCell className="block text-right" />;
  }
  return (
    <span className={cn('block whitespace-nowrap text-right tabular-nums', className)}>
      {value}
      {unit ? <span className="text-muted-foreground"> {unit}</span> : null}
    </span>
  );
}
