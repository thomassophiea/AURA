import { memo, useEffect, useState } from 'react';
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
import { formatBitsPerSecond, formatPercent } from '../../lib/units';
import { apiService } from '../../services/api';

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

interface GatewayLoad {
  cpu: number | null;
  memory: number | null;
}

/** Standard muted icon chip for card headers — semantic tints are reserved for state. */
function HeaderChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2 text-muted-foreground" aria-hidden>
      {children}
    </div>
  );
}

/**
 * InsightCardsGrid — second-tier 4-card grid below the hero KPIs in the
 * Overview: Network Health, Capacity Planning, Active Issues, Maintenance
 * Watch. Every figure is live data or an explicit <NoData />; this grid
 * previously shipped hardcoded CPU/memory/coverage strings styled as
 * telemetry.
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

  // Real gateway load — replaces the hardcoded "5.5% CPU / 38% Memory".
  const [gatewayLoad, setGatewayLoad] = useState<GatewayLoad | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiService
      .getOSOneInfo()
      .then((info) => {
        if (cancelled) return;
        const system = info?.system;
        setGatewayLoad({
          cpu: Number.isFinite(system?.cpuUtilization) ? system!.cpuUtilization : null,
          memory: Number.isFinite(system?.memoryFreePercent)
            ? 100 - system!.memoryFreePercent
            : null,
        });
      })
      .catch(() => {
        if (!cancelled) setGatewayLoad({ cpu: null, memory: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const modelNames = Object.keys(apStats.models);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Network Health */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <HeaderChip>
              <Activity className="h-5 w-5" />
            </HeaderChip>
            <div>
              <CardTitle className="text-base">Network Health</CardTitle>
              <CardDescription>Infrastructure status overview</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex h-full flex-col space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>AP availability</span>
              <span
                className={
                  apAvailability < 95
                    ? 'font-medium text-[color:var(--status-warning)]'
                    : 'font-medium'
                }
              >
                {Math.round(apAvailability)}%
              </span>
            </div>
            <Progress value={apAvailability} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {apStats.online} of {apStats.total} APs online · target &gt;95%
            </p>
          </div>

          <div className="flex-1" />

          <div className="border-t pt-3">
            <div className="mb-3 flex items-center gap-2">
              <Signal className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">RF Quality</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">RFQI</span>
                  <span className="text-lg font-semibold tabular-nums">
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
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Channel utilization</span>
                  <span
                    className={`text-lg font-semibold tabular-nums ${
                      apStats.avgChannelUtil > 60 ? 'text-[color:var(--status-warning)]' : ''
                    }`}
                  >
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <HeaderChip>
              <BarChart3 className="h-5 w-5" />
            </HeaderChip>
            <div>
              <CardTitle className="text-base">Capacity Planning</CardTitle>
              <CardDescription>Resource utilization trends</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex h-full flex-col space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Avg clients per AP</span>
              <span className="font-medium tabular-nums">{avgClientsPerAp}</span>
            </div>
            <Progress value={capacityUtilization} className="h-2" />
            <p className="text-xs text-muted-foreground">Recommended: &lt;50 clients per AP</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-xs text-muted-foreground">Upload</span>
              </div>
              <p className="text-lg font-semibold tabular-nums">
                {formatBitsPerSecond(clientStats.throughputUpload)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-xs text-muted-foreground">Download</span>
              </div>
              <p className="text-lg font-semibold tabular-nums">
                {formatBitsPerSecond(clientStats.throughputDownload)}
              </p>
            </div>
          </div>

          <div className="flex-1" />

          <div className="border-t pt-3">
            <div className="mb-3 flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">Gateway load</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">CPU</span>
                  <span
                    className={`text-lg font-semibold tabular-nums ${
                      (gatewayLoad?.cpu ?? 0) > 80 ? 'text-[color:var(--status-error)]' : ''
                    }`}
                  >
                    {gatewayLoad === null ? (
                      <span className="inline-block h-5 w-12 animate-pulse rounded bg-muted" />
                    ) : gatewayLoad.cpu !== null ? (
                      formatPercent(gatewayLoad.cpu)
                    ) : (
                      <NoData field="system.cpuUtilization" />
                    )}
                  </span>
                </div>
                <Progress value={gatewayLoad?.cpu ?? 0} className="h-1.5" />
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Memory</span>
                  <span
                    className={`text-lg font-semibold tabular-nums ${
                      (gatewayLoad?.memory ?? 0) > 85 ? 'text-[color:var(--status-error)]' : ''
                    }`}
                  >
                    {gatewayLoad === null ? (
                      <span className="inline-block h-5 w-12 animate-pulse rounded bg-muted" />
                    ) : gatewayLoad.memory !== null ? (
                      formatPercent(gatewayLoad.memory, 0)
                    ) : (
                      <NoData field="system.memoryFreePercent" />
                    )}
                  </span>
                </div>
                <Progress value={gatewayLoad?.memory ?? 0} className="h-1.5" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anomaly Detection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <HeaderChip>
              <AlertCircle className="h-5 w-5" />
            </HeaderChip>
            <div>
              <CardTitle className="text-base">Active Issues</CardTitle>
              <CardDescription>Offline devices and critical alerts</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {apStats.offline > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--status-error)]/30 bg-[color:var(--status-error-bg)] p-3">
              <WifiOff className="mt-0.5 h-5 w-5 text-[color:var(--status-error)]" aria-hidden />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-error)]">
                  Offline Access Points
                </p>
                <p className="text-xs text-muted-foreground">
                  {apStats.offline === 1
                    ? '1 AP is currently offline and requires attention'
                    : `${apStats.offline} APs are currently offline and require attention`}
                </p>
              </div>
            </div>
          )}
          {alertCounts.critical > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--status-error)]/30 bg-[color:var(--status-error-bg)] p-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 text-[color:var(--status-error)]"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-error)]">
                  Critical Alerts
                </p>
                <p className="text-xs text-muted-foreground">
                  {alertCounts.critical === 1
                    ? '1 critical issue needs immediate attention'
                    : `${alertCounts.critical} critical issues need immediate attention`}
                </p>
              </div>
            </div>
          )}
          {allClearAnomaly && (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--status-success)]/30 bg-[color:var(--status-success-bg)] p-3">
              <CheckCircle
                className="mt-0.5 h-5 w-5 text-[color:var(--status-success)]"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-success)]">All Clear</p>
                <p className="text-xs text-muted-foreground">
                  No active issues — network operating normally
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <HeaderChip>
              <Timer className="h-5 w-5" />
            </HeaderChip>
            <div>
              <CardTitle className="text-base">Maintenance Watch</CardTitle>
              <CardDescription>Power, RF and service warnings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {apStats.lowPower > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning-bg)] p-3">
              <Zap className="mt-0.5 h-5 w-5 text-[color:var(--status-warning)]" aria-hidden />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-warning)]">
                  Low Power APs
                </p>
                <p className="text-xs text-muted-foreground">
                  {apStats.lowPower === 1
                    ? '1 AP is running in low power mode — check PoE budget'
                    : `${apStats.lowPower} APs are running in low power mode — check PoE budget`}
                </p>
              </div>
            </div>
          )}
          {poorServices.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning-bg)] p-3">
              <Network className="mt-0.5 h-5 w-5 text-[color:var(--status-warning)]" aria-hidden />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-warning)]">
                  Service Degradation
                </p>
                <p className="text-xs text-muted-foreground">
                  {poorServices.length === 1
                    ? '1 network is showing performance issues'
                    : `${poorServices.length} networks are showing performance issues`}
                </p>
              </div>
            </div>
          )}
          {allClearMaintenance && (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--status-success)]/30 bg-[color:var(--status-success-bg)] p-3">
              <CheckCircle
                className="mt-0.5 h-5 w-5 text-[color:var(--status-success)]"
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-[color:var(--status-success)]">
                  Systems Healthy
                </p>
                <p className="text-xs text-muted-foreground">
                  No power, RF or service warnings detected
                </p>
              </div>
            </div>
          )}
          {modelNames.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">
                AP models deployed: {modelNames.slice(0, 3).join(', ')}
                {modelNames.length > 3 && ` +${modelNames.length - 3} more`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const InsightCardsGrid = memo(InsightCardsGridImpl);
