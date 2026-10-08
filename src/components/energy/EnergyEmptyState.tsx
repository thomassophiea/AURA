import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface EnergyEmptyStateProps {
  reason: 'no-collection' | 'no-data' | 'xiq-unsupported';
}

const COPY: Record<
  EnergyEmptyStateProps['reason'],
  { title: string; body: string; icon: typeof AlertTriangle }
> = {
  'no-collection': {
    title: 'AP power data collection is not enabled',
    body: 'No AP power has ever been collected for this scope. Contact your administrator to enable ENERGY_AP_STATE_ENABLED (measured AP power, primary) or MONITORING_AP_REPORTS_ENABLED (AP report series).',
    icon: AlertTriangle,
  },
  'no-data': {
    title: 'No power data in this window',
    body: 'No access points reported power telemetry for the selected site and time range. Try widening the time range.',
    icon: AlertTriangle,
  },
  'xiq-unsupported': {
    title: 'Energy analytics require an OS ONE Gateway',
    body: 'Advanced energy features — power, cost, and savings analytics — are available only for OS ONE Gateway APs. Upgrade this Site to OS ONE to enable them.',
    icon: Sparkles,
  },
};

export function EnergyEmptyState({ reason }: EnergyEmptyStateProps) {
  const { title, body, icon: Icon } = COPY[reason];
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

interface EnergyLoadErrorProps {
  /** What failed to load, e.g. "Energy overview". */
  what: string;
  message: string;
  onRetry?: () => void;
  /** Compact inline variant for use inside a card. */
  compact?: boolean;
}

/**
 * A request that failed is not "loading" and not "no data". Before this, a
 * failed fetch left `data` null and every card kept its skeleton forever.
 */
export function EnergyLoadError({ what, message, onRetry, compact = false }: EnergyLoadErrorProps) {
  return (
    <div
      role="alert"
      className={
        compact
          ? 'flex flex-col items-center gap-2 py-4 text-center'
          : 'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/40 py-10 text-center'
      }
    >
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      <p className="text-sm font-medium text-foreground">{what} could not be loaded</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
