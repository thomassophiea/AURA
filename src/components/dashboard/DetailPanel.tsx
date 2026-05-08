import { memo } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { AnimatedValue } from '../ui/animated-value';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Brain,
  CheckCircle,
  CheckCircle2,
  Eye,
  Radio,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { formatBitsPerSecond } from '../../lib/units';

type SelectorTab = 'ai-insights' | 'access-point' | 'client' | 'switch' | 'site';

type HealthTab = 'needsAttention' | 'healthy';

interface NetworkEvent {
  id: string;
  time: string;
  type: 'single' | 'group' | 'infrastructure';
  description: string;
  affectedCount: number;
  aiExplanation: string;
  severity: 'low' | 'medium' | 'high';
  status: 'resolved' | 'in-progress' | 'monitoring' | 'stable' | 'requires-action';
  entityNames?: string[];
}

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

interface DetailPanelProps {
  aiActiveHealthTab: HealthTab;
  setAiActiveHealthTab: (tab: HealthTab) => void;
  selectedNetworkEvent: NetworkEvent | null;
  setSelectedNetworkEvent: (event: NetworkEvent | null) => void;
  onClose: () => void;
  apStats: ApStatsShape;
  clientStats: ClientStatsShape;
  alertCounts: AlertCountsShape;
  setSelectorTab: (tab: SelectorTab) => void;
  lastUpdate: Date | null;
}

/**
 * DetailPanel — the AI Insights Detail Panel: Health Category Tabs
 * (Needs Attention / Healthy / Selected Event), AI Analysis section
 * with flashy gradient, Events table with severity/affected breakdown.
 *
 * Extracted as a single ~800-line block from DashboardEnhanced; touches
 * only what's in DetailPanelProps. State remains owned by the parent.
 */
function DetailPanelImpl({
  aiActiveHealthTab,
  setAiActiveHealthTab,
  selectedNetworkEvent,
  setSelectedNetworkEvent,
  onClose,
  apStats,
  clientStats,
  alertCounts,
  setSelectorTab,
  lastUpdate,
}: DetailPanelProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        {/* Health Category Tabs */}
        <div className="border-b mb-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setAiActiveHealthTab('needsAttention');
                  setSelectedNetworkEvent(null);
                }}
                className={`pb-2 px-3 transition-colors border-b-2 ${
                  aiActiveHealthTab === 'needsAttention' && !selectedNetworkEvent
                    ? 'text-[color:var(--status-error)] border-[color:var(--status-error)]'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-sm font-medium">Needs Attention</div>
                    <div className="text-xs opacity-75">{apStats.offline} APs</div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  setAiActiveHealthTab('healthy');
                  setSelectedNetworkEvent(null);
                }}
                className={`pb-2 px-3 transition-colors border-b-2 ${
                  aiActiveHealthTab === 'healthy' && !selectedNetworkEvent
                    ? 'text-[color:var(--status-success)] border-[color:var(--status-success)]'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-sm font-medium">Healthy</div>
                    <div className="text-xs opacity-75">{apStats.online} APs</div>
                  </div>
                </div>
              </button>
              {/* Selected Event Tab */}
              {selectedNetworkEvent && (
                <div className="pb-2 px-3 text-purple-600 border-b-2 border-purple-600">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <div className="text-left">
                      <div className="text-sm font-medium truncate max-w-[200px]">
                        {selectedNetworkEvent.description}
                      </div>
                      <div className="text-xs opacity-75">Event Details</div>
                    </div>
                    <button
                      onClick={() => setSelectedNetworkEvent(null)}
                      className="ml-2 hover:bg-purple-100 rounded-full p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => onClose()}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              title="Close details panel"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {!selectedNetworkEvent ? (
          <div className="space-y-4">
            {/* AI Assistant Panel - Flashy Design */}
            <div className="relative overflow-hidden rounded-xl border border-purple-500/30 bg-card dark:bg-gradient-to-br dark:from-slate-900 dark:via-purple-950/50 dark:to-slate-900">
              {/* Animated background effects */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-600/10 via-transparent to-transparent" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-cyan-600/10 via-transparent to-transparent" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />

              {/* Header */}
              <div className="relative px-4 py-3 border-b border-purple-500/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-purple-500/20 rounded-lg blur-md animate-pulse" />
                    <div className="relative bg-gradient-to-br from-purple-500 to-cyan-500 p-2 rounded-lg">
                      <Brain className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      AI Network Analysis
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Real-time insights powered by AI
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {lastUpdate?.toLocaleTimeString() || 'Analyzing...'}
                </div>
              </div>

              {/* Content */}
              <div className="relative p-4">
                {aiActiveHealthTab === 'needsAttention' ? (
                  /* Issues View */
                  <div className="space-y-3">
                    {apStats.offline > 0 && (
                      <div className="bg-[color:var(--status-error-bg)] border border-[color:var(--status-error)]/30 rounded-lg p-3 backdrop-blur-sm">
                        <div className="flex items-start gap-3">
                          <div className="bg-[color:var(--status-error-bg)] p-2 rounded-lg">
                            <Wifi className="w-4 h-4 text-[color:var(--status-error)]" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[color:var(--status-error)]">
                                {apStats.offline} AP{apStats.offline > 1 ? 's' : ''} Offline
                              </span>
                              <span className="px-1.5 py-0.5 text-xs bg-[color:var(--status-error-bg)] text-[color:var(--status-error)] rounded-full font-medium">
                                CRITICAL
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Reduced wireless coverage in affected areas
                            </p>
                            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                              <Zap className="w-3 h-3" /> Check PoE power and network cables
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {alertCounts.critical > 0 && (
                      <div className="bg-[color:var(--status-warning-bg)] border border-[color:var(--status-warning)]/30 rounded-lg p-3 backdrop-blur-sm">
                        <div className="flex items-start gap-3">
                          <div className="bg-[color:var(--status-warning-bg)] p-2 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-[color:var(--status-warning)]" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[color:var(--status-warning)]">
                                {alertCounts.critical} Critical Alert
                                {alertCounts.critical > 1 ? 's' : ''}
                              </span>
                              <span className="px-1.5 py-0.5 text-xs bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning)] rounded-full font-medium">
                                ACTION NEEDED
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Potential service degradation detected
                            </p>
                            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                              <Zap className="w-3 h-3" /> Review alert details and remediate
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {clientStats.total > clientStats.authenticated && (
                      <div className="bg-[color:var(--status-info-bg)] border border-[color:var(--status-info)]/30 rounded-lg p-3 backdrop-blur-sm">
                        <div className="flex items-start gap-3">
                          <div className="bg-[color:var(--status-info-bg)] p-2 rounded-lg">
                            <Users className="w-4 h-4 text-[color:var(--status-info)]" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[color:var(--status-info)]">
                                {clientStats.total - clientStats.authenticated} Pending Auth
                              </span>
                              <span className="px-1.5 py-0.5 text-xs bg-[color:var(--status-info-bg)] text-[color:var(--status-info)] rounded-full font-medium">
                                INFO
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Clients waiting for authentication
                            </p>
                            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                              <Zap className="w-3 h-3" /> Verify RADIUS/auth server status
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {apStats.offline === 0 &&
                      alertCounts.critical === 0 &&
                      clientStats.total === clientStats.authenticated && (
                        <div className="bg-[color:var(--status-success-bg)] border border-[color:var(--status-success)]/30 rounded-lg p-3 backdrop-blur-sm">
                          <div className="flex items-center gap-3">
                            <div className="bg-[color:var(--status-success-bg)] p-2 rounded-lg">
                              <CheckCircle className="w-4 h-4 text-[color:var(--status-success)]" />
                            </div>
                            <div>
                              <span className="text-sm font-semibold text-[color:var(--status-success)]">
                                All Systems Operational
                              </span>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                No issues detected. Network performing optimally.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  /* Healthy Summary View */
                  <div className="grid grid-cols-2 gap-3">
                    {/* Access Points Card */}
                    <div className="bg-[color:var(--status-success-bg)] border border-[color:var(--status-success)]/30 rounded-lg p-4 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="bg-[color:var(--status-success-bg)] p-2 rounded-md">
                          <Wifi className="w-5 h-5 text-[color:var(--status-success)]" />
                        </div>
                        <AnimatedValue
                          value={apStats.online}
                          className="text-2xl font-bold text-[color:var(--status-success)]"
                          pulseColor="bg-[color:var(--status-success-bg)]"
                        />
                      </div>
                      <div className="text-sm text-[color:var(--status-success)] font-medium">
                        Access Points Online
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Availability</span>
                          <AnimatedValue
                            value={`${apStats.total > 0 ? Math.round((apStats.online / apStats.total) * 100) : 0}%`}
                            pulseColor="bg-[color:var(--status-success-bg)]"
                          />
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                            style={{
                              width: `${apStats.total > 0 ? (apStats.online / apStats.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Clients Card */}
                    <div className="bg-[color:var(--status-info-bg)] border border-[color:var(--status-info)]/30 rounded-lg p-4 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="bg-[color:var(--status-info-bg)] p-2 rounded-md">
                          <Users className="w-5 h-5 text-[color:var(--status-info)]" />
                        </div>
                        <AnimatedValue
                          value={clientStats.authenticated}
                          className="text-2xl font-bold text-[color:var(--status-info)]"
                          pulseColor="bg-[color:var(--status-info-bg)]"
                        />
                      </div>
                      <div className="text-sm text-[color:var(--status-info)] font-medium">
                        Clients Authenticated
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Auth Rate</span>
                          <AnimatedValue
                            value={`${clientStats.total > 0 ? Math.round((clientStats.authenticated / clientStats.total) * 100) : 0}%`}
                            pulseColor="bg-[color:var(--status-info-bg)]"
                          />
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                            style={{
                              width: `${clientStats.total > 0 ? (clientStats.authenticated / clientStats.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Throughput Card - Full Width */}
                    <div className="col-span-2 bg-muted/50 border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-primary/10 p-1.5 rounded-md">
                            <Activity className="w-4 h-4 text-primary" />
                          </div>
                          <span className="text-xs text-foreground font-medium">
                            Network Throughput
                          </span>
                        </div>
                        <span className="text-sm font-bold text-foreground">
                          {formatBitsPerSecond(
                            clientStats.throughputUpload + clientStats.throughputDownload
                          )}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <ArrowUp className="w-3 h-3 text-[color:var(--status-success)]" />
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Upload</span>
                              <span className="text-[color:var(--status-success)] font-medium">
                                {formatBitsPerSecond(clientStats.throughputUpload)}
                              </span>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full w-3/5" />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowDown className="w-3 h-3 text-[color:var(--status-info)]" />
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">Download</span>
                              <span className="text-[color:var(--status-info)] font-medium">
                                {formatBitsPerSecond(clientStats.throughputDownload)}
                              </span>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full w-2/5" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Models Deployed */}
                    <div className="col-span-2 flex items-center justify-between bg-muted/50 border border-border rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="bg-muted p-1 rounded">
                          <Radio className="w-3 h-3 text-muted-foreground" />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {Object.keys(apStats.models).length} AP model types deployed
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="px-1.5 py-0.5 bg-primary/10 rounded text-primary">
                          ~{apStats.online > 0 ? Math.round(clientStats.total / apStats.online) : 0}{' '}
                          clients/AP
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Events Table */}
            <div className="border rounded-lg">
              <div className="bg-muted/50 px-4 py-2 border-b flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[color:var(--status-info)]" />
                <h3 className="text-sm font-medium">Recent Events</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Time
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Event
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Affected
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                        AI Explanation
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Generate events based on real data */}
                    {aiActiveHealthTab === 'needsAttention' ? (
                      <>
                        {apStats.offline > 0 && (
                          <tr className="border-b hover:bg-teal-500/5 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {new Date().toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-sm">Access Points Offline</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {apStats.offline} APs
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs text-[color:var(--status-error)] bg-[color:var(--status-error-bg)]">
                                Requires Action
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">
                              AI detected {apStats.offline} access point(s) are offline. Check
                              network connectivity, PoE power delivery, or hardware status.
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() =>
                                  setSelectedNetworkEvent({
                                    id: 'ap-offline',
                                    time: new Date().toLocaleTimeString(),
                                    type: 'infrastructure',
                                    description: 'Access Points Offline',
                                    affectedCount: apStats.offline,
                                    aiExplanation: `${apStats.offline} access point(s) are currently offline. This may impact wireless coverage for clients in affected areas. Check cable connections, PoE power budget, and AP hardware status.`,
                                    severity: 'high',
                                    status: 'requires-action',
                                  })
                                }
                                className="p-2 hover:bg-[color:var(--status-info-bg)] rounded-lg transition-colors text-[color:var(--status-info)]"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )}
                        {alertCounts.critical > 0 && (
                          <tr className="border-b hover:bg-teal-500/5 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {new Date().toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-sm">Critical Alerts Active</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {alertCounts.critical} alerts
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs text-[color:var(--status-error)] bg-[color:var(--status-error-bg)]">
                                Critical
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">
                              Multiple critical alerts require immediate attention to prevent
                              service degradation.
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() =>
                                  setSelectedNetworkEvent({
                                    id: 'critical-alerts',
                                    time: new Date().toLocaleTimeString(),
                                    type: 'infrastructure',
                                    description: 'Critical Alerts Active',
                                    affectedCount: alertCounts.critical,
                                    aiExplanation: `There are ${alertCounts.critical} critical alerts that require immediate attention. These may indicate hardware failures, configuration issues, or security concerns.`,
                                    severity: 'high',
                                    status: 'requires-action',
                                  })
                                }
                                className="p-2 hover:bg-[color:var(--status-info-bg)] rounded-lg transition-colors text-[color:var(--status-info)]"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )}
                        {clientStats.total > clientStats.authenticated && (
                          <tr className="border-b hover:bg-teal-500/5 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {new Date().toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-sm">Unauthenticated Clients</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {clientStats.total - clientStats.authenticated} clients
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs text-[color:var(--status-warning)] bg-[color:var(--status-warning-bg)]">
                                Monitoring
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">
                              Some clients are connected but not fully authenticated. This may
                              indicate captive portal users or authentication issues.
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() =>
                                  setSelectedNetworkEvent({
                                    id: 'unauth-clients',
                                    time: new Date().toLocaleTimeString(),
                                    type: 'group',
                                    description: 'Unauthenticated Clients',
                                    affectedCount: clientStats.total - clientStats.authenticated,
                                    aiExplanation: `${clientStats.total - clientStats.authenticated} client(s) are connected but not authenticated. This could be normal for guest networks with captive portals, or may indicate authentication server issues.`,
                                    severity: 'medium',
                                    status: 'monitoring',
                                  })
                                }
                                className="p-2 hover:bg-[color:var(--status-info-bg)] rounded-lg transition-colors text-[color:var(--status-info)]"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )}
                        {apStats.offline === 0 &&
                          alertCounts.critical === 0 &&
                          clientStats.total === clientStats.authenticated && (
                            <tr className="border-b">
                              <td
                                colSpan={6}
                                className="px-4 py-8 text-center text-sm text-muted-foreground"
                              >
                                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-[color:var(--status-success)] opacity-50" />
                                No issues requiring attention
                              </td>
                            </tr>
                          )}
                      </>
                    ) : (
                      <>
                        <tr className="border-b hover:bg-teal-500/5 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {new Date().toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm">Access Points Online</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {apStats.online} APs
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs text-[color:var(--status-success)] bg-[color:var(--status-success-bg)]">
                              Stable
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">
                            All {apStats.online} access points are operational with normal
                            performance metrics.
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectorTab('access-point')}
                              className="p-2 hover:bg-[color:var(--status-info-bg)] rounded-lg transition-colors text-[color:var(--status-info)]"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        <tr className="border-b hover:bg-teal-500/5 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {new Date().toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm">Authenticated Clients</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {clientStats.authenticated} clients
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs text-[color:var(--status-success)] bg-[color:var(--status-success-bg)]">
                              Stable
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">
                            All authenticated clients have stable connections with good signal
                            quality.
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectorTab('client')}
                              className="p-2 hover:bg-[color:var(--status-info-bg)] rounded-lg transition-colors text-[color:var(--status-info)]"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        <tr className="border-b hover:bg-teal-500/5 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {new Date().toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-sm">Network Throughput Normal</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {formatBitsPerSecond(
                              clientStats.throughputUpload + clientStats.throughputDownload
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs text-[color:var(--status-success)] bg-[color:var(--status-success-bg)]">
                              Optimal
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground max-w-md">
                            Network throughput is within normal parameters with no congestion
                            detected.
                          </td>
                          <td className="px-4 py-3">
                            <button className="p-2 hover:bg-[color:var(--status-info-bg)] rounded-lg transition-colors text-[color:var(--status-info)]">
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Selected Event Detail View */
          <div className="space-y-4">
            {/* Event Context Header */}
            <div className="bg-[color:var(--status-info-bg)] border border-[color:var(--status-info)]/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-1">Root Cause Analysis</h3>
                  <p className="text-sm text-[color:var(--status-info)]">
                    {selectedNetworkEvent.description}
                  </p>
                </div>
                <div className="text-sm text-[color:var(--status-info)]">
                  Event Time: {selectedNetworkEvent.time}
                </div>
              </div>
            </div>

            {/* Event Details */}
            <div className="border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-1 h-full rounded-full min-h-[80px] ${
                    selectedNetworkEvent.severity === 'high'
                      ? 'bg-red-600'
                      : selectedNetworkEvent.severity === 'medium'
                        ? 'bg-amber-500'
                        : 'bg-teal-600'
                  }`}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-sm px-2 py-1 text-white rounded ${
                        selectedNetworkEvent.severity === 'high'
                          ? 'bg-red-600'
                          : selectedNetworkEvent.severity === 'medium'
                            ? 'bg-amber-500'
                            : 'bg-teal-600'
                      }`}
                    >
                      {selectedNetworkEvent.type === 'infrastructure'
                        ? 'Infrastructure Issue'
                        : selectedNetworkEvent.type === 'group'
                          ? 'Client Group Issue'
                          : 'Single Client Issue'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {selectedNetworkEvent.time}
                    </span>
                  </div>
                  <h4 className="font-medium mb-2">{selectedNetworkEvent.description}</h4>
                  <p className="text-muted-foreground mb-4">{selectedNetworkEvent.aiExplanation}</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <span className="text-sm text-muted-foreground">Affected</span>
                      <p className="font-medium">{selectedNetworkEvent.affectedCount} devices</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Severity</span>
                      <p className="font-medium capitalize">{selectedNetworkEvent.severity}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Status</span>
                      <p className="font-medium capitalize">
                        {selectedNetworkEvent.status.replace('-', ' ')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t">
                    <h5 className="text-sm font-medium mb-2">Recommended Actions:</h5>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {selectedNetworkEvent.type === 'infrastructure' && (
                        <>
                          <li>Check physical network connections and cable integrity</li>
                          <li>Verify PoE power budget and power source unit status</li>
                          <li>Review switch port configuration and status</li>
                          <li>Check for firmware updates or known issues</li>
                        </>
                      )}
                      {selectedNetworkEvent.type === 'group' && (
                        <>
                          <li>Review authentication server logs and status</li>
                          <li>Check RADIUS/LDAP connectivity</li>
                          <li>Verify client configuration and credentials</li>
                          <li>Monitor for pattern in affected clients</li>
                        </>
                      )}
                      {selectedNetworkEvent.type === 'single' && (
                        <>
                          <li>Check client device compatibility</li>
                          <li>Review client roaming history</li>
                          <li>Verify signal strength and interference</li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3">
              <Button variant="outline" size="sm" onClick={() => setSelectedNetworkEvent(null)}>
                <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                Back to Events
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectorTab('access-point')}>
                View Access Points
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectorTab('client')}>
                View Clients
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const DetailPanel = memo(DetailPanelImpl);
