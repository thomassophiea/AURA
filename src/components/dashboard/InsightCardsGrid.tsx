import { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { NoData } from '../ui/NoData';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Download,
  Network,
  Server,
  Signal,
  Timer,
  Upload,
  WifiOff,
  Zap,
} from 'lucide-react';
import { formatBitsPerSecond } from '../../lib/units';

interface ApStatsShape {
  total: number;
  online: number;
  offline: number;
  avgChannelUtil: number;
  lowPower: number;
  models: Record<string, number>;
}

interface ClientStatsShape {
  total: number;
  avgRfqi: number;
  throughputUpload: number;
  throughputDownload: number;
}

interface AlertCountsShape {
  critical: number;
  warning: number;
}

interface PoorService {
  id: string | number;
  [key: string]: unknown;
}

interface InsightCardsGridProps {
  apStats: ApStatsShape;
  clientStats: ClientStatsShape;
  alertCounts: AlertCountsShape;
  poorServices: PoorService[];
  lastUpdate: Date | null;
}

/**
 * InsightCardsGrid — second-tier 4-card grid below the hero KPIs in the
 * AI Insights view: Network Health, Capacity Planning, Anomaly Detection,
 * Predictive Maintenance. Each card uses the .aura-section Observatory
 * chrome (commit 32f259b) and the <NoData /> primitive (commit eb5dd79).
 */
function InsightCardsGridImpl({
  apStats,
  clientStats,
  alertCounts,
  poorServices,
  lastUpdate,
}: InsightCardsGridProps) {
  const apAvailability = apStats.total > 0 ? (apStats.online / apStats.total) * 100 : 0;
  const avgClientsPerAp = apStats.online > 0 ? Math.round(clientStats.total / apStats.online) : 0;
  const capacityUtilization = Math.min(((avgClientsPerAp || 0) / 50) * 100, 100);
  const allClearAnomaly = apStats.offline === 0 && alertCounts.critical === 0;
  const allClearMaintenance = apStats.lowPower === 0 && poorServices.length === 0;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Network Health */}
      <Card className="aura-section">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[color:var(--status-success-bg)]">
              <Activity className="h-5 w-5 text-[color:var(--status-success)]" />
            </div>
            <div>
              <CardTitle className="text-base">Network Health</CardTitle>
              <CardDescription>Infrastructure status overview</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col h-full space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>AP Availability</span>
              <span className="font-medium">{Math.round(apAvailability)}%</span>
            </div>
            <Progress value={apAvailability} className="h-2" />
            <p className="text-xs text-muted-foreground">Target: &gt;95% availability</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>OS ONE Coverage</span>
              <span className="font-medium">100%</span>
            </div>
            <Progress value={100} className="h-2" />
            <p className="text-xs text-muted-foreground">All APs running OS ONE</p>
          </div>

          <div className="flex-1" />

          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Signal className="h-4 w-4 text-[color:var(--status-success)]" />
              <span className="text-sm font-medium">RF Quality</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-gradient-to-br from-green-500/10 to-green-600/5 border border-[color:var(--status-success)]/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">RFQI</span>
                  <span className="text-lg font-bold text-[color:var(--status-success)]">
                    {Number.isFinite(clientStats.avgRfqi) && clientStats.avgRfqi > 0 ? (
                      `${clientStats.avgRfqi}%`
                    ) : (
                      <NoData field="clientStats.avgRfqi" />
                    )}
                  </span>
                </div>
                <Progress
                  value={
                    Number.isFinite(clientStats.avgRfqi) && clientStats.avgRfqi > 0
                      ? clientStats.avgRfqi
                      : 0
                  }
                  className="h-1.5"
                />
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-[color:var(--status-warning)]/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Ch. Util</span>
                  <span className="text-lg font-bold text-[color:var(--status-warning)]">
                    {Number.isFinite(apStats.avgChannelUtil) && apStats.avgChannelUtil > 0 ? (
                      `${apStats.avgChannelUtil}%`
                    ) : (
                      <NoData field="apStats.avgChannelUtil" />
                    )}
                  </span>
                </div>
                <Progress
                  value={
                    Number.isFinite(apStats.avgChannelUtil) && apStats.avgChannelUtil > 0
                      ? apStats.avgChannelUtil
                      : 0
                  }
                  className="h-1.5"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Capacity Planning */}
      <Card className="aura-section">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">Capacity Planning</CardTitle>
              <CardDescription>Resource utilization trends</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col h-full space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Avg Clients per AP</span>
              <span className="font-medium">{avgClientsPerAp}</span>
            </div>
            <Progress value={capacityUtilization} className="h-2" />
            <p className="text-xs text-muted-foreground">Recommended: &lt;50 clients per AP</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Upload className="h-4 w-4 text-[color:var(--status-info)]" />
                <span className="text-xs text-muted-foreground">Upload</span>
              </div>
              <p className="text-lg font-semibold">
                {formatBitsPerSecond(clientStats.throughputUpload)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <Download className="h-4 w-4 text-[color:var(--status-success)]" />
                <span className="text-xs text-muted-foreground">Download</span>
              </div>
              <p className="text-lg font-semibold">
                {formatBitsPerSecond(clientStats.throughputDownload)}
              </p>
            </div>
          </div>

          <div className="flex-1" />

          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Server className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">OS ONE Control</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">CPU</span>
                  <span className="text-lg font-bold text-primary">5.5%</span>
                </div>
                <Progress value={5.5} className="h-1.5" />
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-[color:var(--status-info)]/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Memory</span>
                  <span className="text-lg font-bold text-[color:var(--status-info)]">38%</span>
                </div>
                <Progress value={38} className="h-1.5" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anomaly Detection */}
      <Card className="aura-section">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[color:var(--status-warning-bg)]">
              <AlertCircle className="h-5 w-5 text-[color:var(--status-warning)]" />
            </div>
            <div>
              <CardTitle className="text-base">Anomaly Detection</CardTitle>
              <CardDescription>Unusual patterns and alerts</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {apStats.offline > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[color:var(--status-error-bg)] border border-[color:var(--status-error)]/30">
              <WifiOff className="h-5 w-5 text-[color:var(--status-error)] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-error)]">
                  Offline Access Points
                </p>
                <p className="text-xs text-muted-foreground">
                  {apStats.offline} AP(s) are currently offline and require attention
                </p>
              </div>
            </div>
          )}
          {alertCounts.critical > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[color:var(--status-error-bg)] border border-[color:var(--status-error)]/30">
              <AlertTriangle className="h-5 w-5 text-[color:var(--status-error)] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-error)]">
                  Critical Alerts
                </p>
                <p className="text-xs text-muted-foreground">
                  {alertCounts.critical} critical issue(s) need immediate attention
                </p>
              </div>
            </div>
          )}
          {allClearAnomaly && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[color:var(--status-success-bg)] border border-[color:var(--status-success)]/30">
              <CheckCircle className="h-5 w-5 text-[color:var(--status-success)] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-success)]">All Clear</p>
                <p className="text-xs text-muted-foreground">
                  No anomalies detected - network operating normally
                </p>
              </div>
            </div>
          )}
          <div className="pt-2 text-xs text-muted-foreground">
            Last checked: {lastUpdate?.toLocaleTimeString() || 'Updating...'}
          </div>
        </CardContent>
      </Card>

      {/* Predictive Maintenance */}
      <Card className="aura-section">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Timer className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-base">Predictive Maintenance</CardTitle>
              <CardDescription>Potential issues forecast</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {apStats.lowPower > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[color:var(--status-warning-bg)] border border-[color:var(--status-warning)]/30">
              <Zap className="h-5 w-5 text-[color:var(--status-warning)] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-warning)]">
                  Low Power APs
                </p>
                <p className="text-xs text-muted-foreground">
                  {apStats.lowPower} AP(s) running in low power mode - check PoE budget
                </p>
              </div>
            </div>
          )}
          {poorServices.length > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[color:var(--status-warning-bg)] border border-[color:var(--status-warning)]/30">
              <Network className="h-5 w-5 text-[color:var(--status-warning)] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-warning)]">
                  Service Degradation
                </p>
                <p className="text-xs text-muted-foreground">
                  {poorServices.length} service(s) showing performance issues
                </p>
              </div>
            </div>
          )}
          {allClearMaintenance && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[color:var(--status-success-bg)] border border-[color:var(--status-success)]/30">
              <CheckCircle className="h-5 w-5 text-[color:var(--status-success)] mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-success)]">
                  Systems Healthy
                </p>
                <p className="text-xs text-muted-foreground">
                  No maintenance issues predicted in the near term
                </p>
              </div>
            </div>
          )}
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              Models tracked:{' '}
              {Object.entries(apStats.models)
                .slice(0, 3)
                .map(([m]) => m)
                .join(', ')}
              {Object.keys(apStats.models).length > 3 &&
                ` +${Object.keys(apStats.models).length - 3} more`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const InsightCardsGrid = memo(InsightCardsGridImpl);
