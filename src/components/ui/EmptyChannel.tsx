import { ReactNode } from 'react';
import { cn } from './utils';

interface EmptyChannelProps {
  /** Channel code shown large + dimmed, e.g. "CH-01". */
  channel: string;
  /** Eyebrow line above the title, e.g. "no signal". */
  eyebrow?: string;
  /** Main title, e.g. "No access points found". */
  title: string;
  /** Optional explanatory body. */
  description?: ReactNode;
  /** Optional action node (Button, link). */
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyChannel — empty-state primitive for the Observatory aesthetic.
 * Renders a dim channel-code, eyebrow, title, optional description and
 * action. Use when a list/table is structurally empty (no APs, no clients,
 * no events) — distinct from ConnectionError (controller unreachable).
 */
export function EmptyChannel({
  channel,
  eyebrow,
  title,
  description,
  action,
  className,
}: EmptyChannelProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center text-center',
        'min-h-[180px] gap-3 px-6 py-10',
        'border border-dashed border-[color:var(--aura-amber-hairline)]',
        'rounded-sm bg-[color:var(--aura-panel)]/40',
        className
      )}
      role="status"
    >
      {/* Big dim channel code in the background */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none font-[var(--aura-display)] text-[64px] leading-none tracking-[-0.02em] text-foreground/5"
        style={{
          fontFamily: 'var(--aura-display)',
          fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
        }}
      >
        {channel}
      </div>
      {eyebrow && (
        <div
          className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[color:var(--aura-amber)]/80"
          style={{ fontFamily: 'var(--aura-mono)' }}
        >
          {channel} — {eyebrow}
        </div>
      )}
      <div
        className="text-base text-foreground"
        style={{
          fontFamily: 'var(--aura-display)',
          fontVariationSettings: "'opsz' 144, 'SOFT' 20, 'WONK' 0",
          fontWeight: 380,
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
