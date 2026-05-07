import { ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { cn } from './utils';

interface ConnectionErrorProps {
  /** Title shown to the user. Default: "Controller unreachable". */
  title?: string;
  /** Detail text shown below title. */
  description?: ReactNode;
  /** Optional retry action node. */
  action?: ReactNode;
  /** Render at hero scale (full-width, larger paddings) vs. inline scale. */
  scale?: 'hero' | 'inline';
  className?: string;
}

/**
 * ConnectionError — failure-state primitive for when the controller is
 * unreachable or a critical request failed. Use as a route-level fallback
 * (RouteErrorBoundary, dashboard branch failure) — not for inline empty
 * lists (use EmptyChannel for those).
 */
export function ConnectionError({
  title = 'Controller unreachable',
  description,
  action,
  scale = 'inline',
  className,
}: ConnectionErrorProps) {
  const isHero = scale === 'hero';
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center text-center',
        isHero ? 'min-h-[280px] gap-4 px-8 py-12' : 'min-h-[160px] gap-3 px-6 py-8',
        'border border-[color:var(--status-error)]/30',
        'rounded-sm bg-[color:var(--aura-panel)]/40',
        className
      )}
      role="alert"
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full',
          'bg-[color:var(--status-error)]/10 text-[color:var(--status-error)]',
          isHero ? 'h-14 w-14' : 'h-10 w-10'
        )}
      >
        <AlertOctagon className={isHero ? 'h-7 w-7' : 'h-5 w-5'} />
      </div>
      <div
        className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[color:var(--status-error)]/85"
        style={{ fontFamily: 'var(--aura-mono)' }}
      >
        Connection error
      </div>
      <div
        className={isHero ? 'text-2xl' : 'text-lg'}
        style={{
          fontFamily: 'var(--aura-display)',
          fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 0",
          fontWeight: 380,
          color: 'var(--foreground)',
          letterSpacing: '-0.012em',
        }}
      >
        {title}
      </div>
      {description && <div className="max-w-md text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
