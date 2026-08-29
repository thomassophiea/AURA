/**
 * SentinelInfraTab — Infrastructure health monitoring tab powered by the Sentinel engine.
 * Shows check cards, controls (Run Now, schedule), and an alert timeline.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
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
  Globe,
  Lock,
  Layers,
  RadioTower,
  Webhook,
  Check,
  Undo2,
  Sparkles,
} from 'lucide-react';
import { launchCortexDiagnosis } from '../../lib/cortexLauncher';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { useRealtimePolling } from '../../hooks/useRealtimePolling';
import {
  getStatus,
  getAlerts,
  getEvidence,
  getAllEvidence,
  getTrends,
  triggerPoll,
  configure,
  stop,
  clearAlerts,
  acknowledgeAlert,
  unacknowledgeAlert,
  getWebhook,
  setWebhook,
  testWebhook,
  getAnalytics,
} from '../../services/sentinelService';
import type { SentinelAnalytics } from '../../services/sentinelService';
import { useAuraSession } from '../../hooks/useAuraSession';
import type {
  SentinelStatus,
  SentinelAlert,
  SentinelCheckStatus,
  CheckEvidence,
  TrendEntry,
} from '../../services/sentinelService';
import { MicroSparkline } from '../ui/MicroSparkline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Download } from 'lucide-react';
import { exportToCSV, exportToJSON } from '../../utils/exportUtils';
import { printSentinelReport } from '../../utils/exportUtils';
import { toast } from 'sonner';

// ── Check card config ──

const CHECK_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  vlan_trunk: {
    label: 'Missing VLAN',
    icon: Network,
    description: 'Validates VLAN presence on AP uplink trunks',
  },
  dhcp_reachability: {
    label: 'DHCP Reachability',
    icon: Server,
    description: 'Validates local DHCP pools and relay server reachability',
  },
  radius_reachability: {
    label: 'RADIUS Reachability',
    icon: Shield,
    description: 'Tests RADIUS server reachability',
  },
  client_dhcp_failure: {
    label: 'Client DHCP Failure',
    icon: Users,
    description: 'Monitors per-SSID DHCP failure rates',
  },
  dns_reachability: {
    label: 'DNS Reachability',
    icon: Globe,
    description: 'Verifies DNS servers advertised by local DHCP scopes',
  },
  cert_expiry: {
    label: 'Certificate Expiry',
    icon: Lock,
    description: 'Tracks the controller TLS certificate validity window',
  },
  firmware_consistency: {
    label: 'Firmware Consistency',
    icon: Layers,
    description: 'Flags hardware types running mixed AP firmware versions',
  },
  ap_status: {
    label: 'AP Status',
    icon: RadioTower,
    description: 'Watches AP operational state and reported troubles',
  },
};

/** Results older than this are re-polled automatically when the tab opens. */
const STALE_POLL_MS = 10 * 60 * 1000;

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

/**
 * The engine's `status` says whether the check *ran* ('ok' = ran cleanly), not
 * what it *found*. A card announcing "OK" beside "3 critical" reads as a
 * contradiction, so the badge blends run status with the findings: a check that
 * ran cleanly but found critical/warning alerts is labeled by its worst finding.
 */
function checkStatusBadge(
  status: SentinelCheckStatus['status'],
  findings?: { critical: number; warning: number }
) {
  if (status === 'ok' && findings && findings.critical > 0) {
    return (
      <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]">
        Critical
      </Badge>
    );
  }
  if (status === 'ok' && findings && findings.warning > 0) {
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[10px]"
      >
        Warning
      </Badge>
    );
  }
  switch (status) {
    case 'ok':
      return (
        <Badge
          variant="outline"
          className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]"
        >
          OK
        </Badge>
      );
    case 'error':
      return (
        <Badge
          variant="outline"
          className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]"
        >
          Error
        </Badge>
      );
    case 'running':
      return (
        <Badge
          variant="outline"
          className="bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px]"
        >
          Running
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground text-[10px]">
          Idle
        </Badge>
      );
  }
}

/**
 * The alert's target, as a link into the AP detail panel when the alert names
 * an access point, or plain text otherwise.
 */
function AlertTarget({ alert }: { alert: SentinelAlert }) {
  const apSerial = alert.context?.apSerial as string | undefined;
  if (!apSerial) return <span>{alert.target}</span>;
  return (
    <button
      className="underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
      title="Open access point details"
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent('aura:show-ap-detail', {
            detail: { serial: apSerial, name: alert.target },
          })
        );
      }}
    >
      {alert.target}
    </button>
  );
}

/** Ask AURA Cortex to diagnose an alert; explains how to enable it when absent. */
function handleDiagnose(alert: SentinelAlert) {
  const label = CHECK_CONFIG[alert.checkName]?.label ?? alert.checkName;
  const launched = launchCortexDiagnosis(
    `Diagnose this network alert and recommend remediation steps: "${alert.message}". ` +
      `Severity: ${alert.severity}. Source check: ${label}. Target: ${alert.target}. ` +
      `Seen ${alert.occurrences} time(s).`
  );
  if (!launched) {
    toast.info('Enable Dev mode with the Network Assistant to diagnose alerts with AURA Cortex.');
  }
}

/**
 * A bare time like "3:36 PM" is misleading once the result is a day old —
 * include the date whenever the timestamp is not from today.
 */
function formatPollTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString()
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "3m 20s" / "1h 4m" — for MTTA/MTTR figures. */
function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ── Callbacks for the badge poller (exposed to parent) ──

export interface SentinelBadgeData {
  alertCount: number;
  maxSeverity: 'ok' | 'warning' | 'critical';
}

// ── Component ──

interface SentinelInfraTabProps {
  onBadgeUpdate?: (data: SentinelBadgeData) => void;
  siteId?: string;
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
      {checkId === 'dns_reachability' && <DnsEvidence evidence={evidence} />}
      {checkId === 'cert_expiry' && <CertEvidence evidence={evidence} />}
      {checkId === 'firmware_consistency' && <FirmwareEvidence evidence={evidence} />}
      {checkId === 'ap_status' && <ApStatusEvidence evidence={evidence} />}
    </div>
  );
}

function DnsEvidence({ evidence }: { evidence: CheckEvidence }) {
  const results = (evidence.reachabilityResults ?? []) as Array<{
    server: string;
    usedBy: string;
    reachable: boolean;
  }>;
  if (!results.length) return null;
  return (
    <div className="rounded border border-border/30 overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        DNS Server Reachability
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/20 text-muted-foreground">
            <th className="text-left px-2.5 py-1.5 font-medium">Server</th>
            <th className="text-left px-2.5 py-1.5 font-medium">Advertised On</th>
            <th className="text-center px-2.5 py-1.5 font-medium">Reachable</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.server} className="border-t border-border/20">
              <td className="px-2.5 py-1.5 font-mono">{r.server}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{r.usedBy}</td>
              <td className="px-2.5 py-1.5 text-center">
                {r.reachable ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CertEvidence({ evidence }: { evidence: CheckEvidence }) {
  const cert = evidence.certificate as
    | {
        host: string;
        subject: string;
        issuer: string;
        selfSigned: boolean;
        validFrom: string | null;
        validTo: string;
        daysLeft: number;
      }
    | undefined;
  if (!cert) return null;
  const rows: Array<[string, React.ReactNode]> = [
    ['Endpoint', <span key="h" className="font-mono">{cert.host}</span>],
    ['Subject', cert.subject],
    ['Issuer', cert.selfSigned ? `${cert.issuer} (self-signed)` : cert.issuer],
    ['Valid from', cert.validFrom ? new Date(cert.validFrom).toLocaleDateString() : '—'],
    ['Expires', new Date(cert.validTo).toLocaleDateString()],
    [
      'Days remaining',
      <span
        key="d"
        className={
          cert.daysLeft < 7 ? 'text-red-500' : cert.daysLeft < 30 ? 'text-amber-500' : 'text-emerald-500'
        }
      >
        {cert.daysLeft}
      </span>,
    ],
  ];
  return (
    <div className="rounded border border-border/30 overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        Controller Certificate
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-border/20 first:border-t-0">
              <td className="px-2.5 py-1.5 text-muted-foreground w-32">{label}</td>
              <td className="px-2.5 py-1.5">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FirmwareEvidence({ evidence }: { evidence: CheckEvidence }) {
  const distribution = (evidence.distribution ?? []) as Array<{
    hardwareType: string;
    version: string;
    apCount: number;
    aps: string;
  }>;
  if (!distribution.length) return null;
  return (
    <div className="rounded border border-border/30 overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        Firmware Distribution
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/20 text-muted-foreground">
            <th className="text-left px-2.5 py-1.5 font-medium">Hardware</th>
            <th className="text-left px-2.5 py-1.5 font-medium">Version</th>
            <th className="text-center px-2.5 py-1.5 font-medium">APs</th>
            <th className="text-left px-2.5 py-1.5 font-medium">Access Points</th>
          </tr>
        </thead>
        <tbody>
          {distribution.map((d) => (
            <tr key={`${d.hardwareType}:${d.version}`} className="border-t border-border/20">
              <td className="px-2.5 py-1.5">{d.hardwareType}</td>
              <td className="px-2.5 py-1.5 font-mono text-[10px]">{d.version}</td>
              <td className="px-2.5 py-1.5 text-center">{d.apCount}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{d.aps}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApStatusEvidence({ evidence }: { evidence: CheckEvidence }) {
  const statuses = (evidence.apStatuses ?? []) as Array<{
    accessPoint: string;
    status: string;
    troubles: string;
  }>;
  if (!statuses.length) return null;
  return (
    <div className="rounded border border-border/30 overflow-hidden">
      <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        Access Point Status ({statuses.length})
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/20 text-muted-foreground">
            <th className="text-left px-2.5 py-1.5 font-medium">Access Point</th>
            <th className="text-left px-2.5 py-1.5 font-medium">Status</th>
            <th className="text-left px-2.5 py-1.5 font-medium">Troubles</th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((s) => (
            <tr key={s.accessPoint} className="border-t border-border/20">
              <td className="px-2.5 py-1.5">{s.accessPoint}</td>
              <td className="px-2.5 py-1.5">
                {s.status === 'InService' ? (
                  <span className="text-emerald-500">In service</span>
                ) : (
                  <span className="text-red-500">{s.status}</span>
                )}
              </td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{s.troubles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DhcpEvidence({ evidence }: { evidence: CheckEvidence }) {
  const networks = (evidence.networks ?? []) as Array<{
    name: string;
    vlanId: number;
    dhcpMode: string;
  }>;
  const localServers = (evidence.localServers ?? []) as Array<{
    label: string;
    vlanId: number;
    pool: string | null;
    gateway: string | null;
    gatewayReachable: boolean | null;
    hasPool: boolean;
    issues: string[];
  }>;
  const relayResults = (evidence.reachabilityResults ?? []) as Array<{
    server: string;
    usedBy: string;
    reachable: boolean;
  }>;
  return (
    <div className="space-y-2">
      {/* Local DHCP Server pools */}
      {localServers.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            Local DHCP Servers ({localServers.length})
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground">
                <th className="text-left px-2.5 py-1.5 font-medium">Network</th>
                <th className="text-left px-2.5 py-1.5 font-medium">IP Pool</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Gateway</th>
                <th className="text-center px-2.5 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {localServers.map((r) => (
                <tr key={r.vlanId} className="border-t border-border/20">
                  <td className="px-2.5 py-1.5">{r.label}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[10px]">
                    {r.pool ?? <span className="text-amber-500">Not set</span>}
                  </td>
                  <td className="px-2.5 py-1.5 font-mono text-[10px]">
                    {r.gateway ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    {r.issues.length === 0 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                    ) : r.issues.some((i) => i.includes('gateway')) && r.hasPool ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Relay server reachability */}
      {relayResults.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            Relay Server Reachability
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground">
                <th className="text-left px-2.5 py-1.5 font-medium">Server</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Used By</th>
                <th className="text-center px-2.5 py-1.5 font-medium">Reachable</th>
              </tr>
            </thead>
            <tbody>
              {relayResults.map((r) => (
                <tr key={r.server} className="border-t border-border/20">
                  <td className="px-2.5 py-1.5 font-mono">{r.server}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{r.usedBy}</td>
                  <td className="px-2.5 py-1.5 text-center">
                    {r.reachable ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Network DHCP mode summary */}
      {networks.length > 0 && localServers.length === 0 && relayResults.length === 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            Networks ({networks.length})
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground">
                <th className="text-left px-2.5 py-1 font-medium">Network</th>
                <th className="text-center px-2.5 py-1 font-medium">VLAN</th>
                <th className="text-left px-2.5 py-1 font-medium">DHCP Mode</th>
              </tr>
            </thead>
            <tbody>
              {networks.map((n) => (
                <tr key={n.name} className="border-t border-border/20">
                  <td className="px-2.5 py-1">{n.name}</td>
                  <td className="px-2.5 py-1 text-center">{n.vlanId}</td>
                  <td className="px-2.5 py-1 text-muted-foreground">{n.dhcpMode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RadiusEvidence({ evidence }: { evidence: CheckEvidence }) {
  const policies = (evidence.policies ?? []) as Array<{
    name: string;
    authServers: number;
    acctServers: number;
    usedByWlans: string;
  }>;
  const results = (evidence.reachabilityResults ?? []) as Array<{
    server: string;
    port: number;
    role: string;
    policy: string;
    reachable: boolean;
  }>;
  const skipped = (evidence.skippedLoopback ?? 0) as number;
  return (
    <div className="space-y-2">
      {/* Policies with WLAN assignments */}
      {policies.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            AAA Policies ({policies.length})
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground">
                <th className="text-left px-2.5 py-1 font-medium">Policy</th>
                <th className="text-center px-2.5 py-1 font-medium">Auth Servers</th>
                <th className="text-center px-2.5 py-1 font-medium">Acct Servers</th>
                <th className="text-left px-2.5 py-1 font-medium">Used By</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.name} className="border-t border-border/20">
                  <td className="px-2.5 py-1">{p.name}</td>
                  <td className="px-2.5 py-1 text-center">{p.authServers}</td>
                  <td className="px-2.5 py-1 text-center">{p.acctServers}</td>
                  <td className="px-2.5 py-1 text-muted-foreground">{p.usedByWlans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reachability results */}
      {results.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            Server Reachability
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground">
                <th className="text-left px-2.5 py-1.5 font-medium">Server</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Role</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Policy</th>
                <th className="text-center px-2.5 py-1.5 font-medium">Reachable</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.server}:${r.port}`} className="border-t border-border/20">
                  <td className="px-2.5 py-1.5 font-mono">{r.server}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{r.role}</td>
                  <td className="px-2.5 py-1.5 text-muted-foreground">{r.policy}</td>
                  <td className="px-2.5 py-1.5 text-center">
                    {r.reachable ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />
                    )}
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
  const breakdown = (evidence.ssidBreakdown ?? []) as Array<{
    ssid: string;
    total: number;
    noIp: number;
    rate: number;
    status: string;
  }>;
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
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left px-2.5 py-1.5 font-medium">SSID</th>
              <th className="text-center px-2.5 py-1.5 font-medium">Clients</th>
              <th className="text-center px-2.5 py-1.5 font-medium">No IP</th>
              <th className="text-center px-2.5 py-1.5 font-medium">Rate</th>
              <th className="text-center px-2.5 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((r) => (
              <tr key={r.ssid} className="border-t border-border/20">
                <td className="px-2.5 py-1.5 font-mono">{r.ssid}</td>
                <td className="px-2.5 py-1.5 text-center">{r.total}</td>
                <td className="px-2.5 py-1.5 text-center">{r.noIp}</td>
                <td className="px-2.5 py-1.5 text-center">{r.rate}%</td>
                <td className="px-2.5 py-1.5 text-center">
                  {r.status === 'ok' && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                  )}
                  {r.status === 'warning' && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline" />
                  )}
                  {r.status === 'critical' && (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 inline" />
                  )}
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
  const mappings = (evidence.wlanMappings ?? []) as Array<{
    wlan: string;
    network: string | null;
    vlanId: number | null;
  }>;
  const networks = (evidence.networks ?? []) as Array<{
    name: string;
    vlanId: number;
    dhcpMode: string;
  }>;
  const lldp = (evidence.lldpResults ?? []) as Array<{ accessPoint: string; neighbors: number }>;
  return (
    <div className="space-y-2">
      {/* WLAN -> Network -> VLAN mapping */}
      {mappings.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            WLAN Assignments ({mappings.length})
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground">
                <th className="text-left px-2.5 py-1 font-medium">WLAN</th>
                <th className="text-left px-2.5 py-1 font-medium">Network</th>
                <th className="text-center px-2.5 py-1 font-medium">VLAN</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.wlan} className="border-t border-border/20">
                  <td className="px-2.5 py-1">{m.wlan}</td>
                  <td className="px-2.5 py-1 text-muted-foreground">
                    {m.network ?? <span className="italic text-amber-500">Not assigned</span>}
                  </td>
                  <td className="px-2.5 py-1 text-center">
                    {m.vlanId != null ? (
                      <span className="text-emerald-500">{m.vlanId}</span>
                    ) : (
                      <span className="text-amber-500">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Networks */}
      {networks.length > 0 && (
        <div className="rounded border border-border/30 overflow-hidden">
          <div className="bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            Networks ({networks.length})
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground">
                <th className="text-left px-2.5 py-1 font-medium">Network</th>
                <th className="text-center px-2.5 py-1 font-medium">VLAN</th>
                <th className="text-left px-2.5 py-1 font-medium">DHCP Mode</th>
              </tr>
            </thead>
            <tbody>
              {networks.map((n) => (
                <tr key={n.name} className="border-t border-border/20">
                  <td className="px-2.5 py-1">{n.name}</td>
                  <td className="px-2.5 py-1 text-center">{n.vlanId}</td>
                  <td className="px-2.5 py-1 text-muted-foreground">{n.dhcpMode}</td>
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
            Access Points Scanned ({lldp.length} of {(evidence.totalAps as number) ?? 0})
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/20 text-muted-foreground">
                <th className="text-left px-2.5 py-1 font-medium">Access Point</th>
                <th className="text-center px-2.5 py-1 font-medium">Uplink Neighbors</th>
              </tr>
            </thead>
            <tbody>
              {lldp.map((l) => (
                <tr key={l.accessPoint} className="border-t border-border/20">
                  <td className="px-2.5 py-1">{l.accessPoint}</td>
                  <td className="px-2.5 py-1 text-center">
                    {l.neighbors > 0 ? (
                      <span className="text-emerald-500">{l.neighbors}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
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

// ── Webhook settings ──

function SentinelWebhookButton({ configured, disabled }: { configured: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [minSeverity, setMinSeverity] = useState<'warning' | 'critical'>('warning');
  const [busy, setBusy] = useState(false);

  const handleOpen = async (next: boolean) => {
    setOpen(next);
    if (next) {
      try {
        const { url: current, minSeverity: currentMin } = await getWebhook();
        setUrl(current ?? '');
        if (currentMin === 'critical' || currentMin === 'warning') setMinSeverity(currentMin);
      } catch {
        // Leave the field as typed; saving will surface any real problem.
      }
    }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const trimmed = url.trim();
      await setWebhook(trimmed || null, minSeverity);
      toast.success(trimmed ? 'Alert webhook saved' : 'Alert webhook removed');
      setOpen(false);
    } catch (err) {
      toast.error(`Webhook not saved: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      // Test what is typed, not what was last saved.
      await setWebhook(url.trim() || null, minSeverity);
      const result = await testWebhook();
      if (result.ok) toast.success(`Webhook responded ${result.status}`);
      else toast.error(`Webhook test failed: ${result.error ?? result.status}`);
    } catch (err) {
      toast.error(`Webhook test failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => handleOpen(true)}
        title="Route new critical/warning alerts to a webhook"
      >
        <Webhook
          className={`mr-1.5 h-3.5 w-3.5 ${configured ? 'text-emerald-500' : ''}`}
        />
        Notify
      </Button>
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              Alert Webhook
            </DialogTitle>
            <DialogDescription>
              New or reopened critical and warning alerts are POSTed as JSON to this URL — one
              request per poll cycle. Works with Slack/Teams relays, PagerDuty events, or any
              HTTP receiver. Leave empty to disable.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.example.com/aura-alerts"
            aria-label="Webhook URL"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Route</span>
            <Select
              value={minSeverity}
              onValueChange={(v) => setMinSeverity(v as 'warning' | 'critical')}
            >
              <SelectTrigger className="h-8 text-xs w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warning">Critical and warning alerts</SelectItem>
                <SelectItem value="critical">Critical alerts only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={handleTest} disabled={busy || !url.trim()}>
              Send test event
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Component ──

function SentinelExportButton({
  disabled,
  status,
  alerts,
}: {
  disabled: boolean;
  status: SentinelStatus | null;
  alerts: SentinelAlert[];
}) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'csv' | 'json' | 'print') => {
    setExporting(true);
    try {
      const { evidence } = await getAllEvidence();
      const snapshot = {
        checks: status?.checks ?? {},
        alerts,
        evidence: evidence ?? {},
        exportedAt: new Date().toISOString(),
      };

      if (format === 'csv') {
        const rows = Object.entries(snapshot.checks).map(([name, c]) => ({
          check: name,
          label: CHECK_CONFIG[name]?.label ?? name,
          status: c.status,
          lastRunAt: c.lastRunAt ?? '',
          alertCount: c.alertCount ?? 0,
        }));
        exportToCSV(
          rows,
          [
            { key: 'check', label: 'Check ID' },
            { key: 'label', label: 'Check Name' },
            { key: 'status', label: 'Status' },
            { key: 'lastRunAt', label: 'Last Run' },
            { key: 'alertCount', label: 'Alerts' },
          ],
          'sentinel-report'
        );
      } else if (format === 'json') {
        exportToJSON([snapshot], 'sentinel-report');
      } else {
        printSentinelReport(snapshot);
      }
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || exporting}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('json')}>Export JSON</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('print')}>Print Report</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SentinelInfraTab({ onBadgeUpdate, siteId }: SentinelInfraTabProps) {
  // Viewer-role sessions get a read-only board; server-side RBAC enforces the
  // same rule, this just keeps the UI honest about it.
  const { canOperate } = useAuraSession();
  const [analytics, setAnalytics] = useState<SentinelAnalytics | null>(null);
  const [pollRunning, setPollRunning] = useState(false);
  const [schedule, setSchedule] = useState('0');
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const [evidenceData, setEvidenceData] = useState<Record<string, CheckEvidence>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<string | null>(null);

  // Fetch status + alerts + trends together
  const fetcher = useCallback(async () => {
    const [statusData, alertsData, trendsData] = await Promise.all([
      getStatus(),
      getAlerts(),
      getTrends(),
    ]);
    return { status: statusData, alerts: alertsData.alerts, trends: trendsData.trends };
  }, []);

  const { data, loading, refresh } = useRealtimePolling<{
    status: SentinelStatus;
    alerts: SentinelAlert[];
    trends: Record<string, TrendEntry[]>;
  }>(fetcher, {
    key: 'sentinel-status',
    activeInterval: 10_000,
    idleInterval: 30_000,
  });

  const status = data?.status ?? null;
  const alerts = useMemo(() => data?.alerts ?? [], [data?.alerts]);
  const trends = data?.trends ?? {};

  // Push badge data to parent whenever data changes. Only actionable alerts
  // (critical/warning) that nobody has acknowledged count toward the tab
  // badge — informational notes and acknowledged alerts are not alarms.
  useEffect(() => {
    if (onBadgeUpdate && status) {
      const actionable = alerts.filter((a) => a.severity !== 'info' && !a.acknowledgedAt);
      const maxSeverity = actionable.some((a) => a.severity === 'critical')
        ? 'critical'
        : actionable.length > 0
          ? 'warning'
          : 'ok';
      onBadgeUpdate({ alertCount: actionable.length, maxSeverity });
    }
  }, [status, alerts, onBadgeUpdate]);

  // Reflect the engine's actual schedule. The engine is a server-side singleton,
  // so a schedule set in another session, before a reload, or restored from
  // Postgres after a redeploy (reported via intervalMs even while it waits for
  // fresh auth) must show here rather than the dropdown silently claiming "Off".
  useEffect(() => {
    if (!status) return;
    if (!status.intervalMs) {
      setSchedule('0');
      return;
    }
    const match = SCHEDULE_OPTIONS.find((o) => o.value === String(status.intervalMs));
    if (match) setSchedule(match.value);
  }, [status]);

  // Alert analytics from the persisted 90-day history. Loaded once per mount;
  // a fresh poll changes it too slowly to justify re-fetching every cycle.
  useEffect(() => {
    let cancelled = false;
    getAnalytics(30)
      .then((a) => {
        if (!cancelled) setAnalytics(a);
      })
      .catch(() => {
        // No persistence — the strip simply doesn't render.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-run one poll when the tab opens with no results, or with results old
  // enough to mislead. The engine is idle until something triggers it, so
  // without this the cards sit on "Not Started / No data" (or on an hours-old
  // answer) until the user clicks Run Now. We never fight a configured
  // schedule (status.polling) and never repeat within a mount.
  const autoPolledRef = useRef(false);
  useEffect(() => {
    if (autoPolledRef.current || !status) return;
    if (status.polling || pollRunning) return;
    const lastPollAge = status.lastPollAt
      ? Date.now() - new Date(status.lastPollAt).getTime()
      : Infinity;
    if (lastPollAge < STALE_POLL_MS) return;
    autoPolledRef.current = true;
    setPollRunning(true);
    triggerPoll(siteId)
      .then(() => refresh()) // pull the fresh results now, not on the next cycle
      .catch(() => {
        // A transient failure just leaves the board empty; the manual Run Now
        // path surfaces errors if the user retries.
      })
      .finally(() => setPollRunning(false));
  }, [status, siteId, pollRunning, refresh]);

  // ── Handlers ──

  const handleScheduleChange = async (value: string) => {
    setSchedule(value);
    try {
      if (value === '0') {
        await stop();
        toast.info('Operational Insights polling stopped');
      } else {
        await configure({ intervalMs: parseInt(value, 10), siteId });
        toast.success(
          `Operational Insights polling set to ${SCHEDULE_OPTIONS.find((o) => o.value === value)?.label}`
        );
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
      const result = await triggerPoll(siteId);
      if ('error' in result.results && result.results.error === 'auth_expired') {
        toast.error('Operational Insights: controller auth expired. Re-login required.');
      } else {
        toast.success('Operational Insights poll complete');
        // Clear cached evidence so next click fetches fresh data
        setEvidenceData({});
        // Surface the new results immediately rather than on the next cycle.
        await refresh();
      }
    } catch (err) {
      toast.error(`Operational Insights poll failed: ${(err as Error).message}`);
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

  const handleAcknowledge = async (id: string, acked: boolean) => {
    try {
      if (acked) {
        await unacknowledgeAlert(id);
      } else {
        await acknowledgeAlert(id);
      }
      await refresh();
    } catch (err) {
      toast.error(`Failed to update alert: ${(err as Error).message}`);
    }
  };

  // Sort alerts: critical first, then warning, then info; within a severity,
  // unacknowledged before acknowledged, then newest first.
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const sa = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
    const sb = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
    if (sa !== sb) return sa - sb;
    const aa = a.acknowledgedAt ? 1 : 0;
    const ab = b.acknowledgedAt ? 1 : 0;
    if (aa !== ab) return aa - ab;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });

  // Count alerts per check. Acknowledged alerts stop counting toward the
  // critical/warning numbers (they are being handled) but stay visible as a
  // separate acknowledged count.
  const alertsByCheck: Record<
    string,
    { total: number; critical: number; warning: number; info: number; acked: number }
  > = {};
  for (const alert of alerts) {
    if (!alertsByCheck[alert.checkName]) {
      alertsByCheck[alert.checkName] = { total: 0, critical: 0, warning: 0, info: 0, acked: 0 };
    }
    const bucket = alertsByCheck[alert.checkName];
    bucket.total++;
    if (alert.acknowledgedAt && alert.severity !== 'info') {
      bucket.acked++;
      continue;
    }
    if (alert.severity === 'critical') bucket.critical++;
    if (alert.severity === 'warning') bucket.warning++;
    if (alert.severity === 'info') bucket.info++;
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
            disabled={pollRunning || !canOperate}
          >
            {pollRunning ? (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            Run Now
          </Button>

          <Select value={schedule} onValueChange={handleScheduleChange} disabled={!canOperate}>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAlerts}
              disabled={!canOperate}
              className="text-muted-foreground"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          )}

          <SentinelExportButton disabled={!status?.lastPollAt} status={status} alerts={alerts} />

          <SentinelWebhookButton configured={!!status?.webhookConfigured} disabled={!canOperate} />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {status?.polling && (
            <Badge
              variant="outline"
              className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]"
            >
              Polling
            </Badge>
          )}
          {status?.authExpired && (
            <Badge
              variant="outline"
              className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]"
            >
              Auth Expired
            </Badge>
          )}
          {status?.lastPollAt && <span>Last poll: {formatPollTimestamp(status.lastPollAt)}</span>}
        </div>
      </div>

      {/* Alert analytics — the persisted history turned into the numbers an
          ops team reports on. Renders only when history is available. */}
      {analytics && analytics.total > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Last {analytics.windowDays} days:</span>
          <Badge variant="outline" className="text-[11px]">
            {analytics.total} alerts ({analytics.bySeverity.critical ?? 0} critical)
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            MTTA {formatDuration(analytics.mttaSeconds)}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            MTTR {formatDuration(analytics.mttrSeconds)}
          </Badge>
          {analytics.noisiestChecks[0] && (
            <span className="text-muted-foreground">
              noisiest: {CHECK_CONFIG[analytics.noisiestChecks[0].check_name]?.label ??
                analytics.noisiestChecks[0].check_name}{' '}
              ({analytics.noisiestChecks[0].count})
            </span>
          )}
        </div>
      )}

      {/* Check cards grid — items-start so expanding one card's evidence does
          not stretch its row neighbor into dead space. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {Object.entries(CHECK_CONFIG).map(([checkId, config]) => {
          const Icon = config.icon;
          const checkStatus = status?.checks?.[checkId];
          const checkAlertData = alertsByCheck[checkId];
          const isExpanded = expandedCheck === checkId;
          const hasRun = checkStatus?.status === 'ok' || checkStatus?.status === 'error';

          return (
            <div
              key={checkId}
              role={hasRun ? 'button' : undefined}
              tabIndex={hasRun ? 0 : undefined}
              aria-expanded={hasRun ? isExpanded : undefined}
              aria-label={hasRun ? `${config.label} — show evidence` : undefined}
              className={`rounded-lg border bg-card p-4 space-y-3 transition-colors ${
                isExpanded ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border/50'
              } ${
                hasRun
                  ? 'cursor-pointer hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  : ''
              }`}
              onClick={hasRun ? () => handleCardClick(checkId) : undefined}
              onKeyDown={
                hasRun
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleCardClick(checkId);
                      }
                    }
                  : undefined
              }
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
                  {checkStatus && checkStatusBadge(checkStatus.status, checkAlertData)}
                  {hasRun &&
                    (isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ))}
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
                    {checkAlertData.info > 0 &&
                      checkAlertData.critical === 0 &&
                      checkAlertData.warning === 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Info className="h-3 w-3" />
                          {checkAlertData.info} note{checkAlertData.info > 1 ? 's' : ''}
                        </span>
                      )}
                    {checkAlertData.acked > 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Check className="h-3 w-3" />
                        {checkAlertData.acked} acknowledged
                      </span>
                    )}
                    {checkAlertData.critical === 0 &&
                      checkAlertData.warning === 0 &&
                      checkAlertData.info === 0 &&
                      checkAlertData.acked === 0 && (
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
                    {formatPollTimestamp(checkStatus.lastRunAt)}
                  </span>
                )}
                {trends[checkId] && trends[checkId].length >= 2 && (
                  <MicroSparkline
                    data={trends[checkId].map((e) => e.alertCount)}
                    width={48}
                    height={16}
                    stroke={
                      checkAlertData?.critical
                        ? '#ef4444'
                        : checkAlertData?.warning
                          ? '#f59e0b'
                          : '#10b981'
                    }
                    ariaLabel={`${config.label} alert trend`}
                  />
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
          Loading Operational Insights data...
        </div>
      )}

      {sortedAlerts.length > 0 &&
        (() => {
          const actionable = sortedAlerts.filter((a) => a.severity !== 'info');
          const informational = sortedAlerts.filter((a) => a.severity === 'info');
          return (
            <div className="space-y-3">
              {actionable.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Alerts</h4>
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                    {actionable.map((alert) => {
                      const acked = !!alert.acknowledgedAt;
                      return (
                        <div
                          key={alert.id}
                          className={`flex items-start gap-2.5 rounded-lg border border-border/40 bg-card/50 px-3 py-2 ${
                            acked ? 'opacity-55' : ''
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">{severityIcon(alert.severity)}</div>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="text-sm leading-tight">{alert.message}</div>
                            <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                              <Badge
                                variant="outline"
                                className={`${severityBadgeClass(alert.severity)} text-[10px] px-1.5 py-0`}
                              >
                                {alert.severity}
                              </Badge>
                              {acked && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 text-muted-foreground"
                                >
                                  acknowledged
                                </Badge>
                              )}
                              <AlertTarget alert={alert} />
                              {alert.occurrences > 1 && (
                                <span className="font-medium">{alert.occurrences}x</span>
                              )}
                              <span>{formatPollTimestamp(alert.lastSeenAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground"
                              title="Diagnose with AURA Cortex"
                              onClick={() => handleDiagnose(alert)}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground"
                              disabled={!canOperate}
                              title={acked ? 'Reopen this alert' : 'Acknowledge — being handled'}
                              onClick={() => handleAcknowledge(alert.id, acked)}
                            >
                              {acked ? (
                                <Undo2 className="h-3.5 w-3.5" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              <span className="ml-1 text-[11px]">{acked ? 'Reopen' : 'Ack'}</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
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
                          <div className="text-[12px] leading-tight text-muted-foreground">
                            {alert.message}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground/70">
                            <AlertTarget alert={alert} />
                            {alert.occurrences > 1 && (
                              <span className="font-medium">{alert.occurrences}x</span>
                            )}
                            <span>{formatPollTimestamp(alert.lastSeenAt)}</span>
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
          <div className="text-sm font-medium">Not Started</div>
          <div className="text-xs">
            Click &quot;Run Now&quot; to run infrastructure checks or set a schedule.
          </div>
        </div>
      )}
    </div>
  );
}
