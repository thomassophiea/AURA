import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { cn } from './utils';

interface NoDataProps {
  /** What's missing — used in the tooltip body for context. */
  field?: string;
  /** Visual variant. Inline = em-dash glyph; chip = small pill; block = larger placeholder. */
  variant?: 'inline' | 'chip' | 'block';
  /** Optional additional Tailwind classes. */
  className?: string;
}

/**
 * NoData — render this where a value would otherwise display, but the source
 * field is missing/null/undefined. Replaces the anti-pattern of `value || 85`
 * fallbacks that silently lie when real data is absent.
 */
export function NoData({ field, variant = 'inline', className }: NoDataProps) {
  const tooltipMessage = field
    ? `No data: \`${field}\` is missing from the API response.`
    : 'No data available for this field.';

  const content = (() => {
    switch (variant) {
      case 'chip':
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-sm border border-border/40 bg-muted/30',
              'px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider',
              'text-muted-foreground/70',
              className
            )}
          >
            <span aria-hidden="true">—</span>
            <span>no data</span>
          </span>
        );
      case 'block':
        return (
          <span
            className={cn(
              'inline-block min-w-[2ch] text-center font-mono text-muted-foreground/50',
              className
            )}
            aria-label="No data available"
          >
            ——
          </span>
        );
      case 'inline':
      default:
        return (
          <span
            className={cn(
              'inline-block font-mono text-muted-foreground/60',
              'tabular-nums',
              className
            )}
            aria-label="No data available"
          >
            —
          </span>
        );
    }
  })();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-[11px]">
          {tooltipMessage}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
