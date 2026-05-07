import { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from './utils';

interface PartialDataProps {
  /** Short message describing what's missing. */
  message: ReactNode;
  /** Optional className for the container. */
  className?: string;
}

/**
 * PartialData — small inline notice strip surfaced when only some fields
 * in a response are available. Sized to live inside a card content area
 * just above or below the affected widget.
 */
export function PartialData({ message, className }: PartialDataProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-sm border border-[color:var(--aura-amber-hairline)]',
        'bg-[color:var(--aura-amber-soft)]/40 px-3 py-2',
        'font-mono text-[11px] leading-snug text-muted-foreground',
        className
      )}
      role="note"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--aura-amber)]" />
      <span>{message}</span>
    </div>
  );
}
