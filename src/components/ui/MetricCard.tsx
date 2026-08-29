import * as React from 'react';
import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card } from './card';
import { Skeleton } from './skeleton';
import { cn } from './utils';
import { STATUS_TONES, type SemanticStatus } from '@/lib/statusColors';

export interface MetricCardTrend {
  /** Signed delta to display, already formatted (e.g. "+3.2%", "-14"). */
  label: string;
  /** Which way the metric moved. */
  direction: 'up' | 'down' | 'flat';
  /**
   * Whether the move is good news. Drives color: positive = success,
   * negative = danger, neutral = muted. (Up is not always good — retries up
   * is bad.) Defaults to neutral.
   */
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface MetricCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Sentence-case metric name, e.g. "Access points online". */
  title: React.ReactNode;
  /** The headline value, preformatted (use lib/units helpers). */
  value: React.ReactNode;
  /** Small line under the value, e.g. "of 24 total" / "peak 71 W". */
  subtitle?: React.ReactNode;
  /** Optional icon — rendered muted, top-right, tinted by `tone`. */
  icon?: LucideIcon;
  /**
   * Semantic tone for the icon chip and (optionally) the value. Use sparingly:
   * a wall of colored tiles reads as noise. Default is neutral chrome.
   */
  tone?: SemanticStatus | 'default';
  /** Color the value itself with the tone (for genuine states, not decoration). */
  toneValue?: boolean;
  /** Optional trend/delta row. */
  trend?: MetricCardTrend;
  /** Render a loading skeleton in place of value/subtitle. */
  loading?: boolean;
}

const TREND_SENTIMENT_CLASS: Record<NonNullable<MetricCardTrend['sentiment']>, string> = {
  positive: 'text-[color:var(--status-success)]',
  negative: 'text-[color:var(--status-error)]',
  neutral: 'text-muted-foreground',
};

/**
 * The one KPI tile. Consistent padding, title placement, value typography
 * (2xl semibold tabular), icon treatment, trend row, and loading state —
 * replaces the eight ad-hoc stat-card families.
 */
export const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  (
    {
      title,
      value,
      subtitle,
      icon: Icon,
      tone = 'default',
      toneValue = false,
      trend,
      loading = false,
      className,
      ...props
    },
    ref
  ) => {
    const toneClasses = tone !== 'default' ? STATUS_TONES[tone] : null;
    const interactive = typeof props.onClick === 'function';

    return (
      <Card
        ref={ref}
        className={cn(
          'flex h-full flex-col gap-0 p-4',
          interactive &&
            'cursor-pointer transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        {...(interactive ? { role: 'button', tabIndex: 0 } : {})}
        {...props}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">
            {title}
          </span>
          {Icon && (
            <span
              aria-hidden
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                toneClasses ? cn(toneClasses.bg, toneClasses.text) : 'bg-muted/60 text-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
        </div>
        <div className="mt-2 flex-1">
          {loading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-20" />
              {subtitle !== undefined && <Skeleton className="h-3.5 w-28" />}
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'text-2xl font-semibold tabular-nums leading-tight',
                  toneValue && toneClasses ? toneClasses.text : 'text-foreground'
                )}
              >
                {value}
              </div>
              {(subtitle || trend) && (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {trend && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 font-medium tabular-nums',
                        TREND_SENTIMENT_CLASS[trend.sentiment ?? 'neutral']
                      )}
                    >
                      {trend.direction === 'up' && <TrendingUp className="h-3 w-3" aria-hidden />}
                      {trend.direction === 'down' && (
                        <TrendingDown className="h-3 w-3" aria-hidden />
                      )}
                      {trend.label}
                    </span>
                  )}
                  {subtitle && <span className="min-w-0 truncate">{subtitle}</span>}
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    );
  }
);
MetricCard.displayName = 'MetricCard';
