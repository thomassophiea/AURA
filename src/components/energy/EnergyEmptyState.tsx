import { AlertTriangle, Sparkles } from 'lucide-react';

interface EnergyEmptyStateProps {
  reason: 'no-collection' | 'no-data' | 'xiq-unsupported';
}

const COPY: Record<
  EnergyEmptyStateProps['reason'],
  { title: string; body: string; icon: typeof AlertTriangle }
> = {
  'no-collection': {
    title: 'AP power data collection is not enabled',
    body: 'Contact your administrator to enable MONITORING_AP_REPORTS_ENABLED so energy telemetry can be collected.',
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
