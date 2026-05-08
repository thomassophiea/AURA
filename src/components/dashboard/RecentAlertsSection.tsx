import { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Activity, AlertCircle, AlertTriangle, ArrowRight } from 'lucide-react';

export interface Notification {
  id: string | number;
  message: string;
  timestamp: number | string | Date;
  severity?: string;
  level?: string;
}

interface RecentAlertsSectionProps {
  notifications: Notification[];
  /** Optional handler for the "View All" CTA. */
  onViewAll?: () => void;
}

/**
 * RecentAlertsSection — last-24h alerts preview, capped at 5 entries.
 * Severity-driven color tone: critical → error, warning → warning,
 * everything else → info.
 */
function RecentAlertsSectionImpl({ notifications, onViewAll }: RecentAlertsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Alerts</CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onViewAll}>
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {notifications.slice(0, 5).map((notif) => {
            const severity = (notif.severity || notif.level || '').toLowerCase();
            const isCritical = severity.includes('critical') || severity.includes('error');
            const isWarning = severity.includes('warning') || severity.includes('warn');

            return (
              <div
                key={notif.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  isCritical
                    ? 'border-[color:var(--status-error)]/50 bg-[color:var(--status-error-bg)]'
                    : isWarning
                      ? 'border-[color:var(--status-warning)]/50 bg-[color:var(--status-warning-bg)]'
                      : 'border-border'
                }`}
              >
                {isCritical ? (
                  <AlertCircle className="h-4 w-4 text-[color:var(--status-error)] mt-0.5 flex-shrink-0" />
                ) : isWarning ? (
                  <AlertTriangle className="h-4 w-4 text-[color:var(--status-warning)] mt-0.5 flex-shrink-0" />
                ) : (
                  <Activity className="h-4 w-4 text-[color:var(--status-info)] mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{notif.message}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(notif.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export const RecentAlertsSection = memo(RecentAlertsSectionImpl);
