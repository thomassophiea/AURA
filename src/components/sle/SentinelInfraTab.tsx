/**
 * SentinelInfraTab — Infrastructure health monitoring tab powered by the Sentinel engine.
 * Shows check cards, controls (Run Now, schedule), and an alert timeline.
 */

import { useState, useCallback, useEffect } from 'react';
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
  ChevronDown,
  ChevronUp,
  FileSearch,
} from 'lucide-react';
import { useRealtimePolling } from '../../hooks/useRealtimePolling';
import {
  getStatus,
  getAlerts,
  getEvidence,
  triggerPoll,
  configure,
  stop,
  clearAlerts,
} from '../../services/sentinelService';
import type {
  SentinelStatus,
  SentinelAlert,
  SentinelCheckStatus,
  CheckEvidence,
} from '../../services/sentinelService';
import { toast } from 'sonner';

// ── Check card config ──

const CHECK_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  vlan_trunk: { label: 'Missing VLAN', icon: Network, description: 'Validates VLAN presence on AP uplink trunks' },
  dhcp_reachability: { label: 'DHCP Reachability', icon: Server, description: 'Tests DHCP server reachability' },
  radius_reachability: { label: 'RADIUS Reachability', icon: Shield, description: 'Tests RADIUS server reachability' },
  client_dhcp_failure: { label: 'Client DHCP Failure', icon: Users, description: 'Monitors per-SSID DHCP failure rates' },
};

const SCHEDULE_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '3600000', label: 'Hourly' },
  { value: '43200000', label: '12 hours' },
  { value: '86400000', label: '24 hours' },
  { value: '604800000', label: '7 days' },
  { value: '2592000000', label: '30 days' },
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

// ── Evidence renderers per check type ──

function EvidencePanel({ checkId, evidence }: { checkId: string; evidence: CheckEvidence }) {
  return (
    <div className="mt-3 border-t border-border/30 pt-3 space-y-2 text-xs animate-in slide-in-from-top-1 duration-200">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <FileSearch className="h-3.5 w-3.5" />
        <span className="font-medium">Evidence</span>
        <span className="ml-auto text-[10px]">
          {new Date(evidence.collectedAt).toLocaleString()}
        </span>
      </div>

      <div className="text-[11px] text-foreground/80 bg-muted/30 rounded px-2.5 py-1.5">
        {evidence.summary}
      </div>

      {checkId === 'dhcp_reachability' && <DhcpEvidence evidence={evidence} />}
      {checkId === 'radius_reachability' && <RadiusEvidence evidence={evidence} />}
      {checkId === 'client_dhcp_failure' && <ClientDhcpEvidence evidence={evidence} />}
      {checkId === 'vlan_trunk' && <VlanTrunkEvidence evidence={evidence} />}
    </div>
  );
}

function DhcpEvidence({ evidence }: { evidence: CheckEvidence }) {
  const results = (evidence.pingResults ?? []) as Array<{ host: string; vlanNames: string[]; reachable: boolean }>;
  if (!results.length) return null;
  return (
    <div className="rounded border border-border/30 overflow-hidden">
      <table className="w-full text-[11px]">
        <thead><tr className="bg-muted/40 text-muted-foreground">
          <th className="text-left px-2.5 py-1.5 font-medium">DHCP Server</th>
          <th className="text-left px-2.5 py-1.5 font-medium">VLANs</th>
          <th className="text-center px-2.5 py-1.5 font-medium">Reachable</th>
        </tr></thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.host} className="border-t border-border/20">
              <td className="px-2.5 py-1.5 font-mono">{r.host}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{r.vlanNames.join(', ')}</td>
              <td className="px-2.5 py-1.5 text-center">
                {r.reachable
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                  : <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RadiusEvidence({ evidence }: { evidence: CheckEvidence }) {
  const results = (evidence.probeResults ?? evidence.connectResults ?? []) as Array<{ host: string; port: number; policyNames: string[]; role?: string; reachable: boolean }>;
  const policiesFound = (evidence.policiesFound ?? []) as Array<{ name: string; authServers: number; acctServers: number }>;
  const skipped = (evidence.skippedLoopback ?? 0) as number;
  return (
    <div className="space-y-2">
      {/* Policies scanned */}
      {policiesFound.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            AAA Policies ({policiesFound.length})
          </div>
          <table className="w-full text-[11px]">
            <thead><tr className="bg-muted/20 text-muted-foreground">
              <th className="text-left px-2.5 py-1 font-medium">Policy</th>
              <th className="text-center px-2.5 py-1 font-medium">Auth Servers</th>
              <th className="text-center px-2.5 py-1 font-medium">Acct Servers</th>
            </tr></thead>
            <tbody>
              {policiesFound.map((p) => (
                <tr key={p.name} className="border-t border-border/20">
                  <td className="px-2.5 py-1 font-mono">{p.name}</td>
                  <td className="px-2.5 py-1 text-center">{p.authServers}</td>
                  <td className="px-2.5 py-1 text-center">{p.acctServers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reachability results */}
      {results.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left px-2.5 py-1.5 font-medium">Server</th>
              <th className="text-left px-2.5 py-1.5 font-medium">Role</th>
              <th className="text-left px-2.5 py-1.5 font-medium">Policy</th>
              <th className="text-center px-2.5 py-1.5 font-medium">Reachable</th>
            </tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.host}:${r.port}`} className="border-t border-border/20">
                  <td className="px-2.5 py-1.5 font-mono">{r.host}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{r.role ?? 'Authentication'}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{r.policyNames.join(', ')}</td>
                  <td className="px-2.5 py-1.5 text-center">
                    {r.reachable
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                      : <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {skipped > 0 && (
        <div className="text-[10px] text-muted-foreground/70">
          {skipped} loopback server{skipped > 1 ? 's' : ''} excluded from verification.
        </div>
      )}
    </div>
  );
}

function ClientDhcpEvidence({ evidence }: { evidence: CheckEvidence }) {
  const breakdown = (evidence.ssidBreakdown ?? []) as Array<{ ssid: string; total: number; noIp: number; rate: number; status: string }>;
  const thresholds = evidence.thresholds as { warning: string; critical: string } | undefined;
  if (!breakdown.length) return null;
  return (
    <div className="space-y-1.5">
      {thresholds && (
        <div className="text-[10px] text-muted-foreground">
          Thresholds: warning {'>='} {thresholds.warning}, critical {'>='} {thresholds.critical}
        </div>
      )}
      <div className="rounded border border-border/30 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead><tr className="bg-muted/40 text-muted-foreground">
            <th className="text-left px-2.5 py-1.5 font-medium">SSID</th>
            <th className="text-center px-2.5 py-1.5 font-medium">Clients</th>
            <th className="text-center px-2.5 py-1.5 font-medium">No IP</th>
            <th className="text-center px-2.5 py-1.5 font-medium">Rate</th>
            <th className="text-center px-2.5 py-1.5 font-medium">Status</th>
          </tr></thead>
          <tbody>
            {breakdown.map((r) => (
              <tr key={r.ssid} className="border-t border-border/20">
                <td className="px-2.5 py-1.5 font-mono">{r.ssid}</td>
                <td className="px-2.5 py-1.5 text-center">{r.total}</td>
                <td className="px-2.5 py-1.5 text-center">{r.noIp}</td>
                <td className="px-2.5 py-1.5 text-center">{r.rate}%</td>
                <td className="px-2.5 py-1.5 text-center">
                  {r.status === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />}
                  {r.status === 'warning' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline" />}
                  {r.status === 'critical' && <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />}
                  {r.status === 'skipped' && <span className="text-muted-foreground">-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VlanTrunkEvidence({ evidence }: { evidence: CheckEvidence }) {
  const wlans = (evidence.wlansChecked ?? []) as Array<{ ssid: string; vlanId: number; topologyName: string }>;
  const topos = (evidence.topologiesFound ?? []) as Array<{ id: string; name: string; vlanid: number }>;
  const svcs = (evidence.servicesFound ?? []) as Array<{ name: string; defaultTopology: string | null }>;
  const lldp = (evidence.lldpResults ?? []) as Array<{ apSerial: string; apName?: string; neighborCount: number }>;
  return (
    <div className="space-y-2">
      {/* Services -> Topology mapping */}
      {svcs.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            Services ({svcs.length}) &rarr; Topology Mapping
          </div>
          <table className="w-full text-[11px]">
            <thead><tr className="bg-muted/20 text-muted-foreground">
              <th className="text-left px-2.5 py-1 font-medium">WLAN</th>
              <th className="text-left px-2.5 py-1 font-medium">Topology Ref</th>
              <th className="text-center px-2.5 py-1 font-medium">Resolved</th>
            </tr></thead>
            <tbody>
              {svcs.map((s) => {
                const matched = wlans.find((w) => w.ssid === s.name);
                return (
                  <tr key={s.name} className="border-t border-border/20">
                    <td className="px-2.5 py-1 font-mono">{s.name}</td>
                    <td className="px-2.5 py-1 text-muted-foreground font-mono text-[10px] truncate max-w-[180px]">
                      {s.defaultTopology ?? <span className="italic text-amber-500">none</span>}
                    </td>
                    <td className="px-2.5 py-1 text-center">
                      {matched
                        ? <span className="text-emerald-500">VLAN {matched.vlanId}</span>
                        : <span className="text-amber-500">--</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Topologies */}
      {topos.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            Topologies ({topos.length})
          </div>
          <table className="w-full text-[11px]">
            <thead><tr className="bg-muted/20 text-muted-foreground">
              <th className="text-left px-2.5 py-1 font-medium">Name</th>
              <th className="text-center px-2.5 py-1 font-medium">VLAN ID</th>
              <th className="text-left px-2.5 py-1 font-medium">UUID</th>
            </tr></thead>
            <tbody>
              {topos.map((t) => (
                <tr key={t.id} className="border-t border-border/20">
                  <td className="px-2.5 py-1 font-mono">{t.name}</td>
                  <td className="px-2.5 py-1 text-center">{t.vlanid}</td>
                  <td className="px-2.5 py-1 text-muted-foreground font-mono text-[10px] truncate max-w-[180px]">{t.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LLDP results */}
      {lldp.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            AP LLDP Results ({lldp.length} of {(evidence.totalAps as number) ?? 0})
          </div>
          <table className="w-full text-[11px]">
            <thead><tr className="bg-muted/20 text-muted-foreground">
              <th className="text-left px-2.5 py-1 font-medium">Access Point</th>
              <th className="text-center px-2.5 py-1 font-medium">LLDP Neighbors</th>
            </tr></thead>
            <tbody>
              {lldp.map((l) => (
                <tr key={l.apSerial} className="border-t border-border/20">
                  <td className="px-2.5 py-1 font-mono">{l.apName ?? l.apSerial}</td>
                  <td className="px-2.5 py-1 text-center">
                    {l.neighborCount > 0
                      ? <span className="text-emerald-500">{l.neighborCount}</span>
                      : <span className="text-muted-foreground">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Component ──

export function SentinelInfraTab({ onBadgeUpdate }: SentinelInfraTabProps) {
  const [pollRunning, setPollRunning] = useState(false);
  const [schedule, setSchedule] = useState('0');
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [evidenceData, setEvidenceData] = useState<Record<string, CheckEvidence>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<string | null>(null);

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
  useEffect(() => {
    if (onBadgeUpdate && status) {
      const maxSeverity = alerts.some((a) => a.severity === 'critical')
        ? 'critical'
        : alerts.some((a) => a.severity === 'warning')
          ? 'warning'
          : 'ok';
      onBadgeUpdate({ alertCount: status.activeAlerts, maxSeverity });
    }
  }, [status, alerts, onBadgeUpdate]);

  // ── Handlers ──

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

  const handleCardClick = async (checkId: string) => {
    if (expandedCheck === checkId) {
      setExpandedCheck(null);
      return;
    }
    setExpandedCheck(checkId);
    // Fetch evidence if not already cached
    if (!evidenceData[checkId]) {
      setEvidenceLoading(checkId);
      try {
        const { evidence } = await getEvidence(checkId);
        if (evidence) {
          setEvidenceData((prev) => ({ ...prev, [checkId]: evidence }));
        }
      } catch {
        // silently fail — card will show "no evidence"
      } finally {
        setEvidenceLoading(null);
      }
    }
  };

  // Refresh evidence cache after a poll completes
  const handleRunNowWithEvidence = async () => {
    setPollRunning(true);
    try {
      const result = await triggerPoll();
      if ('error' in result.results && result.results.error === 'auth_expired') {
        toast.error('Sentinel: controller auth expired. Re-login required.');
      } else {
        toast.success('Sentinel poll complete');
        // Clear cached evidence so next click fetches fresh data
        setEvidenceData({});
      }
    } catch (err) {
      toast.error(`Sentinel poll failed: ${(err as Error).message}`);
    } finally {
      setPollRunning(false);
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

  // Count alerts per check (separate actionable from informational)
  const alertsByCheck: Record<string, { total: number; critical: number; warning: number; info: number }> = {};
  for (const alert of alerts) {
    if (!alertsByCheck[alert.checkName]) {
      alertsByCheck[alert.checkName] = { total: 0, critical: 0, warning: 0, info: 0 };
    }
    alertsByCheck[alert.checkName].total++;
    if (alert.severity === 'critical') alertsByCheck[alert.checkName].critical++;
    if (alert.severity === 'warning') alertsByCheck[alert.checkName].warning++;
    if (alert.severity === 'info') alertsByCheck[alert.checkName].info++;
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunNowWithEvidence}
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
          const checkAlertData = alertsByCheck[checkId];
          const isExpanded = expandedCheck === checkId;
          const hasRun = checkStatus?.status === 'ok' || checkStatus?.status === 'error';

          return (
            <div
              key={checkId}
              className={`rounded-lg border bg-card p-4 space-y-3 transition-colors ${
                isExpanded ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border/50'
              } ${hasRun ? 'cursor-pointer hover:border-primary/30' : ''}`}
              onClick={hasRun ? () => handleCardClick(checkId) : undefined}
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
                <div className="flex items-center gap-1.5">
                  {checkStatus && checkStatusBadge(checkStatus.status)}
                  {hasRun && (
                    isExpanded
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {checkAlertData ? (
                  <>
                    {checkAlertData.critical > 0 && (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertCircle className="h-3 w-3" />
                        {checkAlertData.critical} critical
                      </span>
                    )}
                    {checkAlertData.warning > 0 && (
                      <span className="flex items-center gap-1 text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        {checkAlertData.warning} warning
                      </span>
                    )}
                    {checkAlertData.info > 0 && checkAlertData.critical === 0 && checkAlertData.warning === 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Info className="h-3 w-3" />
                        {checkAlertData.info} note{checkAlertData.info > 1 ? 's' : ''}
                      </span>
                    )}
                    {checkAlertData.critical === 0 && checkAlertData.warning === 0 && checkAlertData.info === 0 && (
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

              {/* Evidence panel */}
              {isExpanded && evidenceLoading === checkId && (
                <div className="mt-3 border-t border-border/30 pt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Loading evidence...
                </div>
              )}
              {isExpanded && evidenceData[checkId] && (
                <EvidencePanel checkId={checkId} evidence={evidenceData[checkId]} />
              )}
              {isExpanded && !evidenceLoading && !evidenceData[checkId] && (
                <div className="mt-3 border-t border-border/30 pt-3 text-xs text-muted-foreground">
                  No evidence available. Run a poll first.
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

      {sortedAlerts.length > 0 && (() => {
        const actionable = sortedAlerts.filter((a) => a.severity !== 'info');
        const informational = sortedAlerts.filter((a) => a.severity === 'info');
        return (
          <div className="space-y-3">
            {actionable.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Alerts</h4>
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {actionable.map((alert) => (
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
                          <span>{new Date(alert.lastSeenAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {informational.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Informational ({informational.length})
                </h4>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {informational.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-2 rounded-md border border-border/20 bg-muted/20 px-2.5 py-1.5"
                    >
                      <div className="mt-0.5 shrink-0">{severityIcon(alert.severity)}</div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="text-[12px] leading-tight text-muted-foreground">{alert.message}</div>
                        <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground/70">
                          <span>{alert.target}</span>
                          {alert.occurrences > 1 && (
                            <span className="font-medium">{alert.occurrences}x</span>
                          )}
                          <span>{new Date(alert.lastSeenAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {!loading && sortedAlerts.length === 0 && status?.lastPollAt && (
        <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mb-2 opacity-40" />
          <div className="text-sm font-medium">Infrastructure Healthy</div>
          <div className="text-xs">No findings. All checks passed.</div>
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
