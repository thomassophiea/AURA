import { AlertTriangle } from 'lucide-react';

interface EnergyEmptyStateProps {
  reason: 'no-collection' | 'no-data';
}

const COPY: Record<EnergyEmptyStateProps['reason'], { title: string; body: string }> = {
  'no-collection': {
    title: 'AP power data collection is not enabled',
    body: 'Contact your administrator to enable MONITORING_AP_REPORTS_ENABLED so energy telemetry can be collected.',
  },
  'no-data': {
    title: 'No power data in this window',
    body: 'No access points reported power telemetry for the selected site and time range. Try widening the time range.',
  },
};

export function EnergyEmptyState({ reason }: EnergyEmptyStateProps) {
  const { title, body } = COPY[reason];
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
