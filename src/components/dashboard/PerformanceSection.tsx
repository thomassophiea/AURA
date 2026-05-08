import { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  Download,
  Radio,
  Signal,
  TrendingUp,
  Upload,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface PerformanceMetrics {
  avgRssi: number;
  avgSnr: number;
  authenticatedRate: number;
  apUptime: number;
  channelUtil: number;
  rfqi: number;
  totalThroughputMbps: number;
}

interface RadarDatum {
  metric: string;
  value: number;
  fullMark: number;
}

interface ApStatsShape {
  total: number;
  online: number;
  offline: number;
  primary: number;
  backup: number;
  standby: number;
  lowPower: number;
  normalPower: number;
}

interface ClientStatsShape {
  total: number;
  throughputUpload: number;
  throughputDownload: number;
}

interface ClientDistributionItem {
  service: string;
  count: number;
  percentage: number;
}

interface PerformanceSectionProps {
  performanceMetrics: PerformanceMetrics | null;
  radarData: RadarDatum[];
  apStats: ApStatsShape;
  clientStats: ClientStatsShape;
  clientDistribution: ClientDistributionItem[];
  colors: string[];
  onServiceClick: (serviceName: string) => void;
}

/**
 * PerformanceSection — Performance Metrics + Service Quality radar +
 * AP Distribution + Client Distribution. Big mostly-leaf section of the
 * site/network-overview view.
 */
function PerformanceSectionImpl({
  performanceMetrics,
  radarData,
  apStats,
  clientStats,
  clientDistribution,
  colors,
  onServiceClick,
}: PerformanceSectionProps) {
  const pct = (n: number) => (apStats.total > 0 ? Math.round((n / apStats.total) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="text-lg font-semibold">Performance and Quality</h3>
        <p className="text-sm text-muted-foreground">
          Network performance indicators and distribution analytics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Performance Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>Network quality indicators with insights</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-[color:var(--status-success)]" />
                    <span className="text-sm font-medium">Signal Strength (RSSI)</span>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      performanceMetrics.avgRssi >= -50
                        ? 'text-[color:var(--status-success)]'
                        : performanceMetrics.avgRssi >= -70
                          ? 'text-[color:var(--status-warning)]'
                          : 'text-[color:var(--status-error)]'
                    }`}
                  >
                    {performanceMetrics.avgRssi.toFixed(0)} dBm
                  </span>
                </div>
                <Progress
                  value={Math.max(0, Math.min(100, (performanceMetrics.avgRssi + 100) * 1.25))}
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.avgRssi >= -50
                    ? '✓ Excellent signal - Optimal performance'
                    : performanceMetrics.avgRssi >= -60
                      ? '✓ Good signal - Reliable connectivity'
                      : performanceMetrics.avgRssi >= -70
                        ? '⚠ Fair signal - Consider AP placement'
                        : '⚠ Weak signal - Recommend additional APs'}
                </p>
              </div>
            )}

            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Signal className="h-4 w-4 text-[color:var(--status-info)]" />
                    <span className="text-sm font-medium">Signal Quality (SNR)</span>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      performanceMetrics.avgSnr >= 40
                        ? 'text-[color:var(--status-success)]'
                        : performanceMetrics.avgSnr >= 25
                          ? 'text-[color:var(--status-warning)]'
                          : 'text-[color:var(--status-error)]'
                    }`}
                  >
                    {performanceMetrics.avgSnr.toFixed(0)} dB
                  </span>
                </div>
                <Progress
                  value={Math.max(0, Math.min(100, (performanceMetrics.avgSnr / 50) * 100))}
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.avgSnr >= 40
                    ? '✓ Excellent - Minimal interference'
                    : performanceMetrics.avgSnr >= 25
                      ? '✓ Good - Acceptable noise levels'
                      : '⚠ Poor - High interference detected'}
                </p>
              </div>
            )}

            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-[color:var(--status-success)]" />
                    <span className="text-sm font-medium">Success Rate</span>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      performanceMetrics.authenticatedRate >= 98
                        ? 'text-[color:var(--status-success)]'
                        : performanceMetrics.authenticatedRate >= 95
                          ? 'text-[color:var(--status-warning)]'
                          : 'text-[color:var(--status-error)]'
                    }`}
                  >
                    {performanceMetrics.authenticatedRate.toFixed(2)}%
                  </span>
                </div>
                <Progress value={performanceMetrics.authenticatedRate} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.authenticatedRate >= 98
                    ? '✓ Optimal - Meeting SLA targets'
                    : performanceMetrics.authenticatedRate >= 95
                      ? '⚠ Acceptable - Minor issues detected'
                      : '⚠ Below target - Investigate connection issues'}
                </p>
              </div>
            )}

            {performanceMetrics && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-[color:var(--status-info)]" />
                    <span className="text-sm font-medium">AP Uptime</span>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      performanceMetrics.apUptime >= 99
                        ? 'text-[color:var(--status-success)]'
                        : performanceMetrics.apUptime >= 95
                          ? 'text-[color:var(--status-warning)]'
                          : 'text-[color:var(--status-error)]'
                    }`}
                  >
                    {performanceMetrics.apUptime.toFixed(1)}%
                  </span>
                </div>
                <Progress value={performanceMetrics.apUptime} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {apStats.online} of {apStats.total} APs online
                  {apStats.offline > 0 ? ` — ${apStats.offline} offline` : ' — all healthy'}
                </p>
              </div>
            )}

            {performanceMetrics && performanceMetrics.channelUtil > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[color:var(--status-warning)]" />
                    <span className="text-sm font-medium">Channel Utilization</span>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      performanceMetrics.channelUtil <= 50
                        ? 'text-[color:var(--status-success)]'
                        : performanceMetrics.channelUtil <= 75
                          ? 'text-[color:var(--status-warning)]'
                          : 'text-[color:var(--status-error)]'
                    }`}
                  >
                    {performanceMetrics.channelUtil.toFixed(0)}%
                  </span>
                </div>
                <Progress value={performanceMetrics.channelUtil} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.channelUtil <= 50
                    ? '✓ Healthy — ample airtime available'
                    : performanceMetrics.channelUtil <= 75
                      ? '⚠ Moderate — monitor for congestion'
                      : '⚠ High utilization — consider channel plan or adding APs'}
                </p>
              </div>
            )}

            {performanceMetrics && performanceMetrics.rfqi > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--status-success)]" />
                    <span className="text-sm font-medium">RF Quality Index</span>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      performanceMetrics.rfqi >= 80
                        ? 'text-[color:var(--status-success)]'
                        : performanceMetrics.rfqi >= 60
                          ? 'text-[color:var(--status-warning)]'
                          : 'text-[color:var(--status-error)]'
                    }`}
                  >
                    {performanceMetrics.rfqi.toFixed(0)}%
                  </span>
                </div>
                <Progress value={performanceMetrics.rfqi} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {performanceMetrics.rfqi >= 80
                    ? '✓ Excellent RF environment'
                    : performanceMetrics.rfqi >= 60
                      ? '⚠ Acceptable — some interference present'
                      : '⚠ Poor RF — investigate interference sources'}
                </p>
              </div>
            )}

            {performanceMetrics && performanceMetrics.totalThroughputMbps > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[color:var(--status-info)]" />
                    <span className="text-sm font-medium">Network Throughput</span>
                  </div>
                  <span className="text-sm font-bold text-[color:var(--status-info)]">
                    {performanceMetrics.totalThroughputMbps >= 1000
                      ? `${(performanceMetrics.totalThroughputMbps / 1000).toFixed(2)} Gbps`
                      : `${performanceMetrics.totalThroughputMbps.toFixed(1)} Mbps`}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    {clientStats.throughputUpload >= 1_000_000
                      ? `${(clientStats.throughputUpload / 1_000_000).toFixed(1)} Mbps`
                      : `${(clientStats.throughputUpload / 1_000).toFixed(0)} Kbps`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3" />
                    {clientStats.throughputDownload >= 1_000_000
                      ? `${(clientStats.throughputDownload / 1_000_000).toFixed(1)} Mbps`
                      : `${(clientStats.throughputDownload / 1_000).toFixed(0)} Kbps`}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Quality Radar */}
        <Card>
          <CardHeader>
            <CardTitle>Service Quality Overview</CardTitle>
            <CardDescription>Multi-dimensional performance view</CardDescription>
          </CardHeader>
          <CardContent>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Performance"
                    dataKey="value"
                    stroke="#BB86FC"
                    fill="#BB86FC"
                    fillOpacity={0.6}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                No metrics available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AP & Client Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Access Point Distribution</CardTitle>
            <CardDescription>By role and power state</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-3">By Role</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <span className="text-sm">Primary</span>
                  </div>
                  <div className="text-sm font-medium">
                    {apStats.primary} ({pct(apStats.primary)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-cyan-500" />
                    <span className="text-sm">Backup</span>
                  </div>
                  <div className="text-sm font-medium">
                    {apStats.backup} ({pct(apStats.backup)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-500" />
                    <span className="text-sm">Standby</span>
                  </div>
                  <div className="text-sm font-medium">
                    {apStats.standby} ({pct(apStats.standby)}%)
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3">By Power State</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--status-success)]" />
                    <span className="text-sm">Normal Power</span>
                  </div>
                  <div className="text-sm font-medium text-[color:var(--status-success)]">
                    {apStats.normalPower} ({pct(apStats.normalPower)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[color:var(--status-warning)]" />
                    <span className="text-sm">Low Power</span>
                  </div>
                  <div className="text-sm font-medium text-[color:var(--status-warning)]">
                    {apStats.lowPower} ({pct(apStats.lowPower)}%)
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client Distribution</CardTitle>
            <CardDescription>Across services and networks</CardDescription>
          </CardHeader>
          <CardContent>
            {clientStats.total === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No clients connected</p>
              </div>
            ) : clientDistribution.length > 0 ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  {clientDistribution.slice(0, 6).map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors"
                      onClick={() => onServiceClick(item.service)}
                      title={`Click to view ${item.count} client(s) on ${item.service}`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: colors[idx % colors.length] }}
                        />
                        <span className="text-sm truncate">{item.service}</span>
                      </div>
                      <div className="flex items-center gap-3 ml-2">
                        <span className="text-sm font-medium">{item.count}</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {clientDistribution.length > 1 && (
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={clientDistribution.slice(0, 6)}
                          dataKey="count"
                          nameKey="service"
                          cx="50%"
                          cy="50%"
                          outerRadius={50}
                          isAnimationActive={false}
                          onClick={(data) => {
                            const item = data as unknown as ClientDistributionItem | undefined;
                            if (item?.service) onServiceClick(item.service);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {clientDistribution.slice(0, 6).map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={colors[index % colors.length]}
                              style={{ cursor: 'pointer' }}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                            color: 'hsl(var(--foreground))',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Unable to load client distribution</p>
                <p className="text-xs mt-1">Service information not available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const PerformanceSection = memo(PerformanceSectionImpl);
