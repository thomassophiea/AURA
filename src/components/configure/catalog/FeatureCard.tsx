/**
 * FeatureCard — a single catalog tile: icon, label, description and a live
 * record-count badge. Zero-count tiles dim; tiles without an AURA destination
 * (viewId null) render non-interactive. Count `undefined` = still loading.
 */
import { memo } from 'react';
import { Card } from '../../ui/card';
import { cn } from '../../ui/utils';
import { ACCENTS, type AccentKey, type FeatureCardData } from './catalogData';

interface FeatureCardProps {
  item: FeatureCardData;
  accent: AccentKey;
  count: number | null | undefined;
  onSelect: (viewId: string) => void;
}

function CountBadge({ count, accent }: { count: number | null | undefined; accent: AccentKey }) {
  const styles = ACCENTS[accent];
  if (count === undefined) {
    return (
      <span
        className="inline-flex h-5 min-w-[1.75rem] animate-pulse items-center justify-center rounded-full bg-muted px-2 text-xs font-bold text-transparent"
        aria-hidden
      >
        00
      </span>
    );
  }
  if (count === null) {
    return (
      <span
        className="inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground"
        title="Count unavailable"
      >
        –
      </span>
    );
  }
  if (count === 0) {
    return (
      <span className="inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground">
        0
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-full border px-2 text-xs font-bold',
        styles.badge
      )}
    >
      {count}
    </span>
  );
}

function FeatureCardImpl({ item, accent, count, onSelect }: FeatureCardProps) {
  const styles = ACCENTS[accent];
  const Icon = item.icon;
  const dim = count === 0;
  const interactive = item.viewId !== null;

  const handleClick = () => {
    if (item.viewId) onSelect(item.viewId);
  };

  return (
    <Card
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={interactive ? undefined : true}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      className={cn(
        'group flex-row items-center gap-3.5 rounded-lg border-border px-4 py-3 shadow-none transition-colors',
        interactive
          ? cn('cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', styles.hoverBorder)
          : 'cursor-default',
        dim && 'opacity-50'
      )}
    >
      <Icon
        className={cn(
          'size-5 shrink-0 text-muted-foreground transition-colors',
          interactive && styles.iconActive
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{item.label}</span>
          {item.badge && (
            <span className="shrink-0 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
              {item.badge}
            </span>
          )}
        </div>
        {item.flag ? (
          <span className="mt-1 inline-block rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            {item.flag}
          </span>
        ) : (
          <p className="truncate text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>
      <CountBadge count={count} accent={accent} />
    </Card>
  );
}

export const FeatureCard = memo(FeatureCardImpl);
