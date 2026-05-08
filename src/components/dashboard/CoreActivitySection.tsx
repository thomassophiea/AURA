import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Info,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { formatBitsPerSecond, TOOLTIPS } from '../../lib/units';

interface ApStatsShape {
  total: number;
  online: number;
  offline: number;
  models: Record<string, number>;
}

interface ClientStatsShape {
  total: number;
  authenticated: number;
  throughputUpload: number;
  throughputDownload: number;
}

interface AlertCountsShape {
  critical: number;
  warning: number;
}

interface ThroughputSample {
  total: number;
  [k: string]: unknown;
}

interface CoreActivitySectionProps {
  apStats: ApStatsShape;
  clientStats: ClientStatsShape;
  alertCounts: AlertCountsShape;
  throughputTrend: ThroughputSample[];
}

/**
 * CoreActivitySection — site/network-overview view's 4-card KPI grid:
 * Access Points, Connected Clients, Network Throughput (with mini area
 * chart), Active Alerts. Distinct from the AI Insights view's top-KPIs;
 * this one carries richer per-card content (model breakdown, auth rate,
 * up/down split, sparkline, etc.).
 */
function CoreActivitySectionImpl({
  apStats,
  clientStats,
  alertCounts,
  throughputTrend,
}: CoreActivitySectionProps) {
  const apUptimePercent =
    apStats.total > 0 && apStats.online > 0
      ? Math.round((apStats.online / apStats.total) * 100)
      : 0;
  const authRate =
    clientStats.total > 0 ? Math.round((clientStats.authenticated / clientStats.total) * 100) : 0;
  const totalThroughput = clientStats.throughputUpload + clientStats.throughputDownload;

  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="text-lg font-semibold">Core Operational Activity</h3>
        <p className="text-sm text-muted-foreground">Real-time network operations and status</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total APs */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Access Points</CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-blue shadow-md group-hover:scale-110 transition-transform">
              <Wifi className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">{apStats.total}</div>
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-[color:var(--status-success)] border-[color:var(--status-success)] text-xs"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {apStats.online} Online
                </Badge>
                {apStats.offline > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[color:var(--status-error)] border-[color:var(--status-error)] text-xs"
                  >
                    <WifiOff className="h-3 w-3 mr-1" />
                    {apStats.offline} Offline
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-medium">{apUptimePercent}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium text-[color:var(--status-success)]">
                  {apStats.offline === 0 ? 'Optimal' : 'Check Required'}
                </span>
              </div>
              {Object.keys(apStats.models).length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Models</p>
                  <div className="space-y-0.5">
                    {Object.entries(apStats.models)
                      .sort(([, a], [, b]) => b - a)
                      .map(([model, count]) => (
                        <div key={model} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate" title={model}>
                            {model}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {count}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Connected Clients */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Connected Clients</CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-violet shadow-md group-hover:scale-110 transition-transform">
              <Users className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">{clientStats.total}</div>
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Authenticated</span>
                <span className="font-medium">{clientStats.authenticated}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Auth Rate</span>
                <span className="font-medium">{authRate}%</span>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-[color:var(--status-success)]" />
                <span className="text-[color:var(--status-success)] font-medium">Active</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Network Throughput */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm flex items-center gap-1.5 font-semibold">
              Network Throughput
              <span title={TOOLTIPS.REAL_TIME_THROUGHPUT}>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </span>
            </CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-green shadow-md group-hover:scale-110 transition-transform">
              <Activity className="h-3.5 w-3.5 text-white animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">
              {formatBitsPerSecond(totalThroughput)}
            </div>
            <p className="text-xs text-muted-foreground">Total network traffic (Mbps/Gbps)</p>

            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span title="Upload throughput in Mbps/Gbps">Upload</span>
                </div>
                <div className="font-medium text-[color:var(--status-info)]">
                  {formatBitsPerSecond(clientStats.throughputUpload)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendingDown className="h-3 w-3" />
                  <span title="Download throughput in Mbps/Gbps">Download</span>
                </div>
                <div className="font-medium text-[color:var(--status-success)]">
                  {formatBitsPerSecond(clientStats.throughputDownload)}
                </div>
              </div>
            </div>

            {clientStats.total > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className="text-muted-foreground cursor-help"
                    title="Average throughput per connected client"
                  >
                    Avg per client
                  </span>
                  <span className="font-medium">
                    {formatBitsPerSecond(totalThroughput / clientStats.total)}
                  </span>
                </div>
              </div>
            )}

            {throughputTrend.length > 0 && (
              <div className="mt-3 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={throughputTrend.slice(-15)}>
                    <defs>
                      <linearGradient id="throughputGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#BB86FC" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#BB86FC" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#BB86FC"
                      strokeWidth={1.5}
                      fill="url(#throughputGradient)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Alerts */}
        <Card className="relative overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-semibold">Active Alerts</CardTitle>
            <div className="p-1.5 rounded-lg badge-gradient-amber shadow-md group-hover:scale-110 transition-transform">
              <AlertTriangle className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold text-foreground">
              {alertCounts.critical + alertCounts.warning}
            </div>
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex gap-2">
                {alertCounts.critical > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {alertCounts.critical} Critical
                  </Badge>
                )}
                {alertCounts.warning > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {alertCounts.warning} Warning
                  </Badge>
                )}
              </div>
              {alertCounts.critical === 0 && alertCounts.warning === 0 ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs">
                    <CheckCircle className="h-3 w-3 text-[color:var(--status-success)]" />
                    <span className="text-[color:var(--status-success)] font-medium">
                      All systems normal
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium text-[color:var(--status-success)]">Optimal</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Action needed</span>
                  <span className="font-medium text-[color:var(--status-warning)]">
                    Review alerts
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const CoreActivitySection = memo(CoreActivitySectionImpl);
