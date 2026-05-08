import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface RecentEventsSummaryProps {
  /** Number of APs currently offline. */
  offlineApCount: number;
  /** Number of critical alerts. */
  criticalCount: number;
  /** Number of warning alerts. */
  warningCount: number;
}

/**
 * RecentEventsSummary — last-24h roll-up card for the AI Insights branch
 * of the dashboard. Renders an "all clear" success row when no incidents
 * are present.
 */
function RecentEventsSummaryImpl({
  offlineApCount,
  criticalCount,
  warningCount,
}: RecentEventsSummaryProps) {
  const allClear = offlineApCount === 0 && criticalCount === 0 && warningCount === 0;

  return (
    <Card className="border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-[color:var(--status-warning)]" />
            <CardTitle className="text-base font-semibold">Recent Events</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground">Last 24h</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {offlineApCount > 0 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-[color:var(--status-error-bg)] border border-[color:var(--status-error)]/30">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm">APs Offline</span>
              </div>
              <Badge variant="destructive" className="text-xs">
                {offlineApCount}
              </Badge>
            </div>
          )}
          {criticalCount > 0 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-[color:var(--status-error-bg)] border border-[color:var(--status-error)]/30">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm">Critical Alerts</span>
              </div>
              <Badge variant="destructive" className="text-xs">
                {criticalCount}
              </Badge>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-[color:var(--status-warning-bg)] border border-[color:var(--status-warning)]/30">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-sm">Warnings</span>
              </div>
              <Badge className="text-xs bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30">
                {warningCount}
              </Badge>
            </div>
          )}
          {allClear && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[color:var(--status-success-bg)] border border-[color:var(--status-success)]/30">
              <CheckCircle className="h-4 w-4 text-[color:var(--status-success)]" />
              <span className="text-sm text-[color:var(--status-success)]">
                No issues detected - all systems operational
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const RecentEventsSummary = memo(RecentEventsSummaryImpl);
