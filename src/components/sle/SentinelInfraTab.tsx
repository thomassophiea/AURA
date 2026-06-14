/**
 * SentinelInfraTab — Infrastructure health monitoring tab powered by the Sentinel engine.
 * Shows check cards, controls (Run Now, schedule), and an alert timeline.
 */

import { useState, useCallback } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Network,
  Server,
  Shield,
  Users,
  RefreshCw,
  Play,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Clock,
  Trash2,
} from 'lucide-react';
import { useRealtimePolling } from '../../hooks/useRealtimePolling';
import {
  getStatus,
  getAlerts,
  triggerPoll,
  configure,
  stop,
  clearAlerts,
} from '../../services/sentinelService';
import type {
  SentinelStatus,
  SentinelAlert,
  SentinelCheckStatus,
} from '../../services/sentinelService';
import { toast } from 'sonner';

// ── Check card config ──

const CHECK_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  vlan_trunk: { label: 'VLAN Trunk', icon: Network, description: 'Validates trunk VLAN presence on APs' },
  dhcp_reachability: { label: 'DHCP Reachability', icon: Server, description: 'Tests DHCP server reachability' },
  radius_reachability: { label: 'RADIUS Reachability', icon: Shield, description: 'Tests RADIUS server reachability' },
  client_dhcp_failure: { label: 'Client DHCP Failure', icon: Users, description: 'Monitors per-SSID DHCP failure rates' },
};

const SCHEDULE_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '60000', label: '1 min' },
  { value: '120000', label: '2 min' },
  { value: '300000', label: '5 min' },
  { value: '600000', label: '10 min' },
  { value: '1800000', label: '30 min' },
];

// ── Severity helpers ──

function severityIcon(severity: string) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="h-4 w-4 text-[color:var(--status-error)]" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-[color:var(--status-warning)]" />;
    default:
      return <Info className="h-4 w-4 text-[color:var(--status-info,#3b82f6)]" />;
  }
}

function severityBadgeClass(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/15 text-red-500 border-red-500/30';
    case 'warning':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    default:
      return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
  }
}

function checkStatusBadge(status: SentinelCheckStatus['status']) {
  switch (status) {
    case 'ok':
      return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">OK</Badge>;
    case 'error':
      return <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]">Error</Badge>;
    case 'running':
      return <Badge variant="outline" className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px]">Running</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground text-[10px]">Idle</Badge>;
  }
}

// ── Callbacks for the badge poller (exposed to parent) ──

export interface SentinelBadgeData {
  alertCount: number;
  maxSeverity: 'ok' | 'warning' | 'critical';
}

// ── Component ──

interface SentinelInfraTabProps {
  onBadgeUpdate?: (data: SentinelBadgeData) => void;
}

export function SentinelInfraTab({ onBadgeUpdate }: SentinelInfraTabProps) {
  const [pollRunning, setPollRunning] = useState(false);
  const [schedule, setSchedule] = useState('0');

  // Fetch status + alerts together
  const fetcher = useCallback(async () => {
    const [statusData, alertsData] = await Promise.all([getStatus(), getAlerts()]);
    return { status: statusData, alerts: alertsData.alerts };
  }, []);

  const { data, loading } = useRealtimePolling<{
    status: SentinelStatus;
    alerts: SentinelAlert[];
  }>(fetcher, {
    key: 'sentinel-status',
    activeInterval: 10_000,
    idleInterval: 30_000,
  });

  const status = data?.status ?? null;
  const alerts = data?.alerts ?? [];

  // Push badge data to parent whenever data changes
  if (onBadgeUpdate && status) {
    const maxSeverity = alerts.some((a) => a.severity === 'critical')
      ? 'critical'
      : alerts.some((a) => a.severity === 'warning')
        ? 'warning'
        : 'ok';
    onBadgeUpdate({ alertCount: status.activeAlerts, maxSeverity });
  }

  // ── Handlers ──

  const handleRunNow = async () => {
    setPollRunning(true);
    try {
      const result = await triggerPoll();
      if ('error' in result.results && result.results.error === 'auth_expired') {
        toast.error('Sentinel: controller auth expired. Re-login required.');
      } else {
        toast.success('Sentinel poll complete');
      }
    } catch (err) {
      toast.error(`Sentinel poll failed: ${(err as Error).message}`);
    } finally {
      setPollRunning(false);
    }
  };

  const handleScheduleChange = async (value: string) => {
    setSchedule(value);
    try {
      if (value === '0') {
        await stop();
        toast.info('Sentinel polling stopped');
      } else {
        await configure({ intervalMs: parseInt(value, 10) });
        toast.success(`Sentinel polling set to ${SCHEDULE_OPTIONS.find((o) => o.value === value)?.label}`);
      }
    } catch (err) {
      toast.error(`Failed to update schedule: ${(err as Error).message}`);
    }
  };

  const handleClearAlerts = async () => {
    try {
      await clearAlerts();
      toast.success('All alerts cleared');
    } catch (err) {
      toast.error(`Failed to clear alerts: ${(err as Error).message}`);
    }
  };

  // Sort alerts: critical first, then warning, then info; within same severity, newest first
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const sa = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
    const sb = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
    if (sa !== sb) return sa - sb;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  // Count alerts per check
  const alertsByCheck: Record<string, { total: number; critical: number; warning: number }> = {};
  for (const alert of alerts) {
    if (!alertsByCheck[alert.checkName]) {
      alertsByCheck[alert.checkName] = { total: 0, critical: 0, warning: 0 };
    }
    alertsByCheck[alert.checkName].total++;
    if (alert.severity === 'critical') alertsByCheck[alert.checkName].critical++;
    if (alert.severity === 'warning') alertsByCheck[alert.checkName].warning++;
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunNow}
            disabled={pollRunning}
          >
            {pollRunning ? (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            Run Now
          </Button>

          <Select value={schedule} onValueChange={handleScheduleChange}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEDULE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {alerts.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearAlerts} className="text-muted-foreground">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {status?.polling && (
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">
              Polling
            </Badge>
          )}
          {status?.authExpired && (
            <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]">
              Auth Expired
            </Badge>
          )}
          {status?.lastPollAt && (
            <span>
              Last poll: {new Date(status.lastPollAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Check cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(CHECK_CONFIG).map(([checkId, config]) => {
          const Icon = config.icon;
          const checkStatus = status?.checks?.[checkId];
          const checkAlerts = alertsByCheck[checkId];

          return (
            <div
              key={checkId}
              className="rounded-lg border border-border/50 bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-muted/50">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{config.label}</div>
                    <div className="text-[11px] text-muted-foreground">{config.description}</div>
                  </div>
                </div>
                {checkStatus && checkStatusBadge(checkStatus.status)}
              </div>

              <div className="flex items-center gap-3 text-xs">
                {checkAlerts ? (
                  <>
                    {checkAlerts.critical > 0 && (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertCircle className="h-3 w-3" />
                        {checkAlerts.critical} critical
                      </span>
                    )}
                    {checkAlerts.warning > 0 && (
                      <span className="flex items-center gap-1 text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        {checkAlerts.warning} warning
                      </span>
                    )}
                    {checkAlerts.total === 0 && (
                      <span className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" />
                        All clear
                      </span>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" />
                    {checkStatus?.status === 'ok' ? 'All clear' : 'No data'}
                  </span>
                )}

                {checkStatus?.lastRunAt && (
                  <span className="text-muted-foreground ml-auto">
                    {new Date(checkStatus.lastRunAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {checkStatus?.error && (
                <div className="text-[11px] text-red-400 bg-red-500/10 rounded px-2 py-1 truncate">
                  {checkStatus.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Alert timeline */}
      {loading && !data && (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          Loading Sentinel data...
        </div>
      )}

      {sortedAlerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Active Alerts</h4>
          <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
            {sortedAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-card/50 px-3 py-2"
              >
                <div className="mt-0.5 shrink-0">{severityIcon(alert.severity)}</div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="text-sm leading-tight">{alert.message}</div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                    <Badge variant="outline" className={`${severityBadgeClass(alert.severity)} text-[10px] px-1.5 py-0`}>
                      {alert.severity}
                    </Badge>
                    <span>{alert.target}</span>
                    {alert.occurrences > 1 && (
                      <span className="font-medium">{alert.occurrences}x</span>
                    )}
                    <span>
                      {new Date(alert.lastSeenAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && sortedAlerts.length === 0 && status?.lastPollAt && (
        <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mb-2 opacity-40" />
          <div className="text-sm font-medium">Infrastructure Healthy</div>
          <div className="text-xs">No active alerts. All checks passed.</div>
        </div>
      )}

      {!loading && !status?.lastPollAt && (
        <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
          <Shield className="h-10 w-10 mb-2 opacity-40" />
          <div className="text-sm font-medium">Sentinel Not Started</div>
          <div className="text-xs">Click &quot;Run Now&quot; to run infrastructure checks or set a schedule.</div>
        </div>
      )}
    </div>
  );
}
