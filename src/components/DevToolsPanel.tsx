import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Resizable } from 're-resizable';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  X, Trash2, ChevronDown, ChevronUp, Clock, Activity,
  CheckCircle, XCircle, AlertCircle, Loader2, Copy, Download,
  GripHorizontal, Database, Gauge, Zap, Terminal, Settings,
  RefreshCw, Key, Globe, Cpu, HardDrive, Timer, Wifi,
  Users, BarChart3, Eye, EyeOff, Layers, Braces, Play,
  RotateCcw, Clipboard, Search, Filter, TrendingUp,
  AlertTriangle, Hash, Server, Shield, Flame
} from 'lucide-react';
import { cn } from './ui/utils';
import { apiService } from '../services/api';
import { usePersonaContext } from '../contexts/PersonaContext';
import { PERSONA_MAP } from '../config/personaDefinitions';
import { PERSONA_DASHBOARD_CONFIG } from '../config/personaDashboardConfig';
import type { ApiCallLog } from '../types/api';

export type { ApiCallLog };

interface DevToolsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiLogs: ApiCallLog[];
  onClearLogs: () => void;
  onHeightChange?: (height: number) => void;
}

// ── Utility: format bytes
function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ── Utility: uptime string
function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function DevToolsPanel({ isOpen, onClose, apiLogs, onClearLogs, onHeightChange }: DevToolsPanelProps) {
  const [activeTab, setActiveTab] = useState('api');
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [panelHeight, setPanelHeight] = useState(420);
  const [apiFilter, setApiFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionStart = useRef(Date.now());

  const { activePersona } = usePersonaContext();

  useEffect(() => {
    if (autoScroll && scrollRef.current && activeTab === 'api') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [apiLogs, autoScroll, activeTab]);

  useEffect(() => {
    onHeightChange?.(isOpen ? panelHeight : 0);
  }, [panelHeight, isOpen, onHeightChange]);

  // ── Performance Stats (computed from logs)
  const perfStats = useMemo(() => {
    const completed = apiLogs.filter(l => !l.isPending && l.duration !== undefined);
    const failed = apiLogs.filter(l => l.error || (l.status && l.status >= 400));
    const pending = apiLogs.filter(l => l.isPending);

    const durations = completed.map(l => l.duration!).filter(d => d > 0);
    const avgLatency = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const maxLatency = durations.length > 0 ? Math.max(...durations) : 0;
    const minLatency = durations.length > 0 ? Math.min(...durations) : 0;
    const p95 = durations.length > 0
      ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] ?? maxLatency
      : 0;

    // Requests per minute
    const timeRange = apiLogs.length > 1
      ? (apiLogs[apiLogs.length - 1].timestamp.getTime() - apiLogs[0].timestamp.getTime()) / 60000
      : 1;
    const rpm = timeRange > 0 ? Math.round(apiLogs.length / timeRange) : 0;

    // Endpoint frequency
    const endpointMap = new Map<string, { count: number; totalDuration: number; errors: number }>();
    apiLogs.forEach(l => {
      const key = `${l.method} ${l.endpoint}`;
      const existing = endpointMap.get(key) || { count: 0, totalDuration: 0, errors: 0 };
      existing.count++;
      if (l.duration) existing.totalDuration += l.duration;
      if (l.error || (l.status && l.status >= 400)) existing.errors++;
      endpointMap.set(key, existing);
    });
    const topEndpoints = Array.from(endpointMap.entries())
      .map(([key, v]) => ({ endpoint: key, ...v, avgDuration: Math.round(v.totalDuration / v.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Status distribution
    const statusDist: Record<string, number> = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    apiLogs.forEach(l => {
      if (l.status) {
        const bucket = `${Math.floor(l.status / 100)}xx`;
        if (statusDist[bucket] !== undefined) statusDist[bucket]++;
      }
    });

    // Method distribution
    const methodDist: Record<string, number> = {};
    apiLogs.forEach(l => {
      methodDist[l.method] = (methodDist[l.method] || 0) + 1;
    });

    // Latency distribution for sparkline
    const recentDurations = completed.slice(-30).map(l => ({
      time: l.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      duration: l.duration!,
    }));

    return {
      total: apiLogs.length, completed: completed.length, failed: failed.length, pending: pending.length,
      avgLatency, maxLatency, minLatency, p95, rpm,
      errorRate: apiLogs.length > 0 ? ((failed.length / apiLogs.length) * 100).toFixed(1) : '0.0',
      topEndpoints, statusDist, methodDist, recentDurations,
    };
  }, [apiLogs]);

  // ── Filtered API logs
  const filteredLogs = useMemo(() => {
    let logs = apiLogs;
    if (apiFilter) {
      const q = apiFilter.toLowerCase();
      logs = logs.filter(l => l.endpoint.toLowerCase().includes(q) || l.method.toLowerCase().includes(q));
    }
    if (methodFilter) {
      logs = logs.filter(l => l.method === methodFilter);
    }
    if (statusFilter) {
      if (statusFilter === 'error') logs = logs.filter(l => l.error || (l.status && l.status >= 400));
      else if (statusFilter === 'pending') logs = logs.filter(l => l.isPending);
      else if (statusFilter === 'success') logs = logs.filter(l => l.status && l.status >= 200 && l.status < 300);
    }
    return logs;
  }, [apiLogs, apiFilter, methodFilter, statusFilter]);

  // ── State inspector data
  const stateData = useMemo(() => {
    const ls: Record<string, string> = {};
    const keys = ['theme', 'aura-dev-persona', 'dashboard_layout', 'admin_role', 'user_email',
      'access_token', 'refresh_token', 'networkAssistantEnabled', 'sle_collection_state'];
    keys.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) {
        // Mask tokens
        if (k.includes('token')) {
          ls[k] = v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-4)} (${v.length} chars)` : '***';
        } else if (k === 'dashboard_layout') {
          try {
            const parsed = JSON.parse(v);
            ls[k] = `${Array.isArray(parsed) ? parsed.length : '?'} widgets configured`;
          } catch { ls[k] = v.slice(0, 60) + '...'; }
        } else {
          ls[k] = v.length > 80 ? v.slice(0, 77) + '...' : v;
        }
      }
    });
    return ls;
  }, [activeTab]); // Re-compute when tab switches

  if (!isOpen) return null;

  const getStatusColor = (status?: number) => {
    if (!status) return 'text-muted-foreground';
    if (status >= 200 && status < 300) return 'text-[color:var(--status-success)]';
    if (status >= 400 && status < 500) return 'text-[color:var(--status-warning)]';
    if (status >= 500) return 'text-[color:var(--status-error)]';
    return 'text-muted-foreground';
  };

  const getStatusIcon = (log: ApiCallLog) => {
    if (log.isPending) return <Loader2 className="h-4 w-4 animate-spin text-[color:var(--status-info)]" />;
    if (log.error) return <XCircle className="h-4 w-4 text-[color:var(--status-error)]" />;
    if (log.status && log.status >= 200 && log.status < 300) return <CheckCircle className="h-4 w-4 text-[color:var(--status-success)]" />;
    if (log.status && log.status >= 400) return <AlertCircle className="h-4 w-4 text-[color:var(--status-warning)]" />;
    return <Activity className="h-4 w-4 text-muted-foreground" />;
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'POST': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'PUT': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'PATCH': return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'DELETE': return 'bg-red-500/15 text-red-400 border-red-500/30';
      default: return 'bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30';
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) +
      '.' + date.getMilliseconds().toString().padStart(3, '0');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(apiLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura-api-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Quick Actions
  const quickActions = [
    { label: 'Copy Auth Token', icon: Key, action: () => { const t = localStorage.getItem('access_token'); if (t) { copyToClipboard(t); } }, color: 'text-amber-400' },
    { label: 'Copy Base URL', icon: Globe, action: () => { copyToClipboard(apiService.getBaseUrl()); }, color: 'text-blue-400' },
    { label: 'Export API Logs', icon: Download, action: exportLogs, color: 'text-emerald-400' },
    { label: 'Clear API Logs', icon: Trash2, action: () => { onClearLogs(); }, color: 'text-red-400' },
    { label: 'Clear LocalStorage Layout', icon: RotateCcw, action: () => { localStorage.removeItem('dashboard_layout'); window.location.reload(); }, color: 'text-orange-400' },
    { label: 'Copy Session Info', icon: Clipboard, action: () => {
      const info = {
        baseUrl: apiService.getBaseUrl(),
        email: localStorage.getItem('user_email'),
        role: localStorage.getItem('admin_role'),
        theme: localStorage.getItem('theme'),
        persona: localStorage.getItem('aura-dev-persona'),
        sessionUptime: fmtUptime(Date.now() - sessionStart.current),
        apiCalls: apiLogs.length,
      };
      copyToClipboard(JSON.stringify(info, null, 2));
    }, color: 'text-violet-400' },
    { label: 'Force Refresh All Data', icon: RefreshCw, action: () => { window.dispatchEvent(new CustomEvent('aura-force-refresh')); }, color: 'text-cyan-400' },
    { label: 'Open API in New Tab', icon: Play, action: () => { window.open(apiService.getBaseUrl(), '_blank', 'noopener'); }, color: 'text-pink-400' },
  ];

  const personaDef = PERSONA_MAP.get(activePersona);
  const personaDashConfig = PERSONA_DASHBOARD_CONFIG[activePersona];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-primary/20 bg-background/95 backdrop-blur-xl shadow-2xl shadow-primary/5">
      <Resizable
        size={{ width: '100%', height: panelHeight }}
        minHeight={200}
        maxHeight={window.innerHeight - 100}
        enable={{ top: true, right: false, bottom: false, left: false, topRight: false, bottomRight: false, bottomLeft: false, topLeft: false }}
        onResizeStop={(e, direction, ref, d) => setPanelHeight(panelHeight + d.height)}
        handleStyles={{ top: { height: '8px', top: '-4px', cursor: 'ns-resize', zIndex: 10 } }}
        handleComponent={{
          top: (
            <div className="absolute top-0 left-0 right-0 h-2 flex items-center justify-center group hover:bg-primary/10 transition-colors cursor-ns-resize">
              <div className="bg-primary/30 group-hover:bg-primary/60 rounded-full h-1 w-20 transition-colors" />
            </div>
          ),
        }}
      >
        <div className="h-full flex flex-col border-t border-primary/10">
          {/* ── Header Bar ── */}
          <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50 bg-card/80 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <Terminal className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-card-foreground tracking-wide">AURA DevTools</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary/70">
                v2.0
              </Badge>
              {apiLogs.some(l => l.isPending) && (
                <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  {apiLogs.filter(l => l.isPending).length} in-flight
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground font-mono">
                {perfStats.total} calls &middot; {perfStats.avgLatency}ms avg &middot; {perfStats.errorRate}% err
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} title="Close DevTools">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ── Tab Navigation ── */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-border/30 bg-card/40 px-4 flex-shrink-0">
              <TabsList className="bg-transparent h-8 gap-0 p-0">
                <TabsTrigger value="api" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-8 px-3">
                  <Activity className="h-3 w-3 mr-1.5" />
                  Network
                  <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">{filteredLogs.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="perf" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-8 px-3">
                  <Gauge className="h-3 w-3 mr-1.5" />
                  Performance
                </TabsTrigger>
                <TabsTrigger value="state" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-8 px-3">
                  <Database className="h-3 w-3 mr-1.5" />
                  State
                </TabsTrigger>
                <TabsTrigger value="actions" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-8 px-3">
                  <Zap className="h-3 w-3 mr-1.5" />
                  Actions
                </TabsTrigger>
                <TabsTrigger value="system" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-8 px-3">
                  <Cpu className="h-3 w-3 mr-1.5" />
                  System
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ═══════════════════════════════════════
                TAB 1: NETWORK / API MONITOR
                ═══════════════════════════════════════ */}
            <TabsContent value="api" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
              {/* Filter bar */}
              <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/30 bg-card/20 flex-shrink-0">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter endpoints..."
                  value={apiFilter}
                  onChange={e => setApiFilter(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-card-foreground placeholder:text-muted-foreground outline-none font-mono"
                />
                {/* Method filters */}
                {['GET', 'POST', 'PUT', 'DELETE'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMethodFilter(methodFilter === m ? null : m)}
                    className={cn(
                      'text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors',
                      methodFilter === m
                        ? getMethodColor(m)
                        : 'border-border/30 text-muted-foreground hover:text-card-foreground'
                    )}
                  >
                    {m}
                  </button>
                ))}
                {/* Status filters */}
                <button
                  onClick={() => setStatusFilter(statusFilter === 'error' ? null : 'error')}
                  className={cn('text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                    statusFilter === 'error' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'border-border/30 text-muted-foreground'
                  )}
                >
                  ERR
                </button>
                <button
                  onClick={() => setStatusFilter(statusFilter === 'pending' ? null : 'pending')}
                  className={cn('text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                    statusFilter === 'pending' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'border-border/30 text-muted-foreground'
                  )}
                >
                  PEND
                </button>
                <div className="border-l border-border/30 h-4 mx-1" />
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setAutoScroll(!autoScroll)}>
                  {autoScroll ? 'Auto ●' : 'Auto ○'}
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={exportLogs} disabled={apiLogs.length === 0}>
                  <Download className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClearLogs} disabled={apiLogs.length === 0}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Log entries */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto bg-card/30 font-mono text-xs">
                {filteredLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">{apiLogs.length === 0 ? 'No API calls yet' : 'No matching calls'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {filteredLogs.map(log => (
                      <div key={log.id} className="hover:bg-primary/5 transition-colors">
                        <div
                          className="flex items-center gap-2 px-4 py-1.5 cursor-pointer"
                          onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                        >
                          <div className="flex-shrink-0">{getStatusIcon(log)}</div>
                          <span className="flex-shrink-0 text-muted-foreground/70 w-[85px] text-[10px]">{formatTimestamp(log.timestamp)}</span>
                          <Badge variant="outline" className={cn('flex-shrink-0 w-14 justify-center border text-[10px] py-0', getMethodColor(log.method))}>
                            {log.method}
                          </Badge>
                          <span className="flex-1 text-card-foreground truncate text-[11px]">{log.endpoint}</span>
                          {log.status && <span className={cn('flex-shrink-0 w-8 text-right text-[10px]', getStatusColor(log.status))}>{log.status}</span>}
                          {log.duration !== undefined && (
                            <span className={cn('flex-shrink-0 w-14 text-right text-[10px]', log.duration > 2000 ? 'text-red-400' : log.duration > 500 ? 'text-amber-400' : 'text-muted-foreground')}>
                              {log.duration}ms
                            </span>
                          )}
                          <span className="flex-shrink-0 w-4">
                            {expandedLog === log.id ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                          </span>
                        </div>

                        {expandedLog === log.id && (
                          <div className="px-4 pb-3 space-y-2 bg-background/60">
                            {log.requestBody && (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Request</span>
                                  <Button variant="ghost" size="sm" className="h-5 px-1.5" onClick={e => { e.stopPropagation(); copyToClipboard(JSON.stringify(log.requestBody, null, 2)); }}>
                                    <Copy className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                                <pre className="bg-background border border-border/50 rounded p-2 overflow-x-auto text-[10px] max-h-32">{JSON.stringify(log.requestBody, null, 2)}</pre>
                              </div>
                            )}
                            {log.responseBody && (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Response</span>
                                  <Button variant="ghost" size="sm" className="h-5 px-1.5" onClick={e => { e.stopPropagation(); copyToClipboard(JSON.stringify(log.responseBody, null, 2)); }}>
                                    <Copy className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                                <pre className="bg-background border border-border/50 rounded p-2 overflow-x-auto text-[10px] max-h-48">{JSON.stringify(log.responseBody, null, 2)}</pre>
                              </div>
                            )}
                            {log.error && (
                              <div>
                                <span className="text-[10px] text-red-400 uppercase tracking-wider">Error</span>
                                <pre className="bg-red-500/10 border border-red-500/20 rounded p-2 overflow-x-auto text-[10px] text-red-400 mt-1">{log.error}</pre>
                              </div>
                            )}
                            <div className="flex gap-4 text-[10px] text-muted-foreground/60 pt-1 border-t border-border/20">
                              <span>ID: {log.id}</span>
                              <span>{log.timestamp.toISOString()}</span>
                              {log.duration !== undefined && <span>{log.duration}ms</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═══════════════════════════════════════
                TAB 2: PERFORMANCE
                ═══════════════════════════════════════ */}
            <TabsContent value="perf" className="flex-1 overflow-y-auto mt-0 data-[state=inactive]:hidden">
              <div className="p-4 space-y-4">
                {/* Top metrics row */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Total Calls', value: perfStats.total, icon: Hash, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { label: 'Avg Latency', value: `${perfStats.avgLatency}ms`, icon: Timer, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'P95 Latency', value: `${perfStats.p95}ms`, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { label: 'Error Rate', value: `${perfStats.errorRate}%`, icon: AlertTriangle, color: perfStats.failed > 0 ? 'text-red-400' : 'text-emerald-400', bg: perfStats.failed > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10' },
                    { label: 'Requests/min', value: perfStats.rpm, icon: Gauge, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                    { label: 'In Flight', value: perfStats.pending, icon: Loader2, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                  ].map(m => (
                    <div key={m.label} className={cn('rounded-lg border border-border/30 p-3', m.bg)}>
                      <div className="flex items-center gap-2 mb-1">
                        <m.icon className={cn('h-3.5 w-3.5', m.color)} />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</span>
                      </div>
                      <div className={cn('text-lg font-bold font-mono', m.color)}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {/* Status & Method Distribution */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border/30 p-3">
                    <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                      Status Distribution
                    </h4>
                    <div className="space-y-1.5">
                      {Object.entries(perfStats.statusDist).map(([bucket, count]) => (
                        <div key={bucket} className="flex items-center gap-2">
                          <span className={cn('text-[10px] font-mono w-8', bucket === '2xx' ? 'text-emerald-400' : bucket === '4xx' ? 'text-amber-400' : bucket === '5xx' ? 'text-red-400' : 'text-muted-foreground')}>{bucket}</span>
                          <div className="flex-1 h-1.5 bg-border/20 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', bucket === '2xx' ? 'bg-emerald-500' : bucket === '4xx' ? 'bg-amber-500' : bucket === '5xx' ? 'bg-red-500' : 'bg-muted-foreground')}
                              style={{ width: perfStats.total > 0 ? `${(count / perfStats.total) * 100}%` : '0%' }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/30 p-3">
                    <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <Braces className="h-3.5 w-3.5 text-primary" />
                      Method Distribution
                    </h4>
                    <div className="space-y-1.5">
                      {Object.entries(perfStats.methodDist).sort((a, b) => b[1] - a[1]).map(([method, count]) => (
                        <div key={method} className="flex items-center gap-2">
                          <Badge variant="outline" className={cn('text-[9px] w-14 justify-center border py-0', getMethodColor(method))}>{method}</Badge>
                          <div className="flex-1 h-1.5 bg-border/20 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary/50" style={{ width: perfStats.total > 0 ? `${(count / perfStats.total) * 100}%` : '0%' }} />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top Endpoints Table */}
                <div className="rounded-lg border border-border/30 p-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5 text-orange-400" />
                    Hottest Endpoints
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] font-mono">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border/20">
                          <th className="text-left py-1 pr-4">Endpoint</th>
                          <th className="text-right py-1 px-2">Calls</th>
                          <th className="text-right py-1 px-2">Avg (ms)</th>
                          <th className="text-right py-1 px-2">Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perfStats.topEndpoints.map((ep, i) => (
                          <tr key={i} className="border-b border-border/10 hover:bg-primary/5">
                            <td className="py-1 pr-4 text-card-foreground truncate max-w-xs">{ep.endpoint}</td>
                            <td className="text-right py-1 px-2 text-muted-foreground">{ep.count}</td>
                            <td className={cn('text-right py-1 px-2', ep.avgDuration > 1000 ? 'text-red-400' : ep.avgDuration > 300 ? 'text-amber-400' : 'text-emerald-400')}>{ep.avgDuration}</td>
                            <td className={cn('text-right py-1 px-2', ep.errors > 0 ? 'text-red-400' : 'text-muted-foreground')}>{ep.errors}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Latency Sparkline */}
                {perfStats.recentDurations.length > 0 && (
                  <div className="rounded-lg border border-border/30 p-3">
                    <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-primary" />
                      Recent Latency ({perfStats.recentDurations.length} requests)
                    </h4>
                    <div className="flex items-end gap-[2px] h-16">
                      {perfStats.recentDurations.map((d, i) => {
                        const maxH = Math.max(...perfStats.recentDurations.map(x => x.duration), 1);
                        const pct = (d.duration / maxH) * 100;
                        return (
                          <div
                            key={i}
                            className={cn(
                              'flex-1 rounded-t transition-all',
                              d.duration > 2000 ? 'bg-red-500' : d.duration > 500 ? 'bg-amber-500' : 'bg-emerald-500',
                            )}
                            style={{ height: `${Math.max(pct, 3)}%` }}
                            title={`${d.time}: ${d.duration}ms`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-1">
                      <span>{perfStats.recentDurations[0]?.time}</span>
                      <span>{perfStats.recentDurations[perfStats.recentDurations.length - 1]?.time}</span>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ═══════════════════════════════════════
                TAB 3: STATE INSPECTOR
                ═══════════════════════════════════════ */}
            <TabsContent value="state" className="flex-1 overflow-y-auto mt-0 data-[state=inactive]:hidden">
              <div className="p-4 space-y-4">
                {/* Active Persona */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    Active Persona
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">ID:</span>
                      <span className="ml-2 font-mono text-primary">{activePersona}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Label:</span>
                      <span className="ml-2 font-medium">{personaDef?.label}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Group:</span>
                      <span className="ml-2">{personaDef?.group}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Dashboard:</span>
                      <span className="ml-2">
                        <Badge className={cn('text-[9px] border', personaDashConfig?.accentClass)}>
                          {personaDashConfig?.dashboardLabel}
                        </Badge>
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Allowed Pages:</span>
                      <span className="ml-2 font-mono text-[10px]">{personaDef?.allowedPages.length ?? '∞'} pages</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Dashboard Sections:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {personaDashConfig?.sections.map(s => (
                          <Badge key={s} variant="outline" className="text-[9px] py-0">{s}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* LocalStorage */}
                <div className="rounded-lg border border-border/30 p-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-amber-400" />
                    LocalStorage
                  </h4>
                  <div className="space-y-1">
                    {Object.entries(stateData).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-[10px] font-mono py-0.5 border-b border-border/10 last:border-0">
                        <span className="text-amber-400 flex-shrink-0 w-44">{key}</span>
                        <span className="text-card-foreground break-all">{value}</span>
                        <Button variant="ghost" size="sm" className="h-4 w-4 p-0 flex-shrink-0 ml-auto" onClick={() => copyToClipboard(localStorage.getItem(key) || '')}>
                          <Copy className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Global Filters State */}
                <div className="rounded-lg border border-border/30 p-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-violet-400" />
                    Runtime State
                  </h4>
                  <div className="space-y-1 text-[10px] font-mono">
                    <div className="flex gap-2 py-0.5 border-b border-border/10">
                      <span className="text-violet-400 w-44">window.location</span>
                      <span className="text-card-foreground">{window.location.href}</span>
                    </div>
                    <div className="flex gap-2 py-0.5 border-b border-border/10">
                      <span className="text-violet-400 w-44">navigator.onLine</span>
                      <span className={navigator.onLine ? 'text-emerald-400' : 'text-red-400'}>{String(navigator.onLine)}</span>
                    </div>
                    <div className="flex gap-2 py-0.5 border-b border-border/10">
                      <span className="text-violet-400 w-44">document.visibilityState</span>
                      <span className="text-card-foreground">{document.visibilityState}</span>
                    </div>
                    <div className="flex gap-2 py-0.5 border-b border-border/10">
                      <span className="text-violet-400 w-44">session.uptime</span>
                      <span className="text-card-foreground">{fmtUptime(Date.now() - sessionStart.current)}</span>
                    </div>
                    <div className="flex gap-2 py-0.5">
                      <span className="text-violet-400 w-44">memory (if available)</span>
                      <span className="text-card-foreground">
                        {(performance as any).memory
                          ? `${fmtBytes((performance as any).memory.usedJSHeapSize)} / ${fmtBytes((performance as any).memory.jsHeapSizeLimit)}`
                          : 'N/A (non-Chrome)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ═══════════════════════════════════════
                TAB 4: QUICK ACTIONS
                ═══════════════════════════════════════ */}
            <TabsContent value="actions" className="flex-1 overflow-y-auto mt-0 data-[state=inactive]:hidden">
              <div className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {quickActions.map(qa => (
                    <button
                      key={qa.label}
                      onClick={qa.action}
                      className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border/30 bg-card/30 hover:bg-primary/10 hover:border-primary/30 transition-all duration-200 group"
                    >
                      <div className={cn('p-2 rounded-lg bg-background/50 group-hover:scale-110 transition-transform', qa.color)}>
                        <qa.icon className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] text-muted-foreground group-hover:text-card-foreground text-center transition-colors">{qa.label}</span>
                    </button>
                  ))}
                </div>

                {/* Keyboard shortcuts reference */}
                <div className="mt-6 rounded-lg border border-border/30 p-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-primary" />
                    Useful Information
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="flex items-center justify-between p-1.5 rounded bg-background/30">
                      <span className="text-muted-foreground">API Base URL</span>
                      <code className="text-primary font-mono">{apiService.getBaseUrl()}</code>
                    </div>
                    <div className="flex items-center justify-between p-1.5 rounded bg-background/30">
                      <span className="text-muted-foreground">User Email</span>
                      <code className="text-primary font-mono">{localStorage.getItem('user_email') || 'N/A'}</code>
                    </div>
                    <div className="flex items-center justify-between p-1.5 rounded bg-background/30">
                      <span className="text-muted-foreground">Admin Role</span>
                      <code className="text-primary font-mono">{localStorage.getItem('admin_role') || 'N/A'}</code>
                    </div>
                    <div className="flex items-center justify-between p-1.5 rounded bg-background/30">
                      <span className="text-muted-foreground">Theme</span>
                      <code className="text-primary font-mono">{localStorage.getItem('theme') || 'ep1'}</code>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ═══════════════════════════════════════
                TAB 5: SYSTEM INFO
                ═══════════════════════════════════════ */}
            <TabsContent value="system" className="flex-1 overflow-y-auto mt-0 data-[state=inactive]:hidden">
              <div className="p-4 space-y-4">
                {/* Environment */}
                <div className="rounded-lg border border-border/30 p-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-blue-400" />
                    Environment
                  </h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[10px] font-mono">
                    {[
                      ['Platform', navigator.platform],
                      ['User Agent', navigator.userAgent.slice(0, 80) + '...'],
                      ['Language', navigator.language],
                      ['Cookies Enabled', String(navigator.cookieEnabled)],
                      ['Online', String(navigator.onLine)],
                      ['Screen', `${screen.width}×${screen.height} @ ${devicePixelRatio}x`],
                      ['Viewport', `${window.innerWidth}×${window.innerHeight}`],
                      ['Color Depth', `${screen.colorDepth}-bit`],
                      ['Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone],
                      ['Cores (logical)', String(navigator.hardwareConcurrency || 'N/A')],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2 py-0.5 border-b border-border/10">
                        <span className="text-blue-400 w-32 flex-shrink-0">{k}</span>
                        <span className="text-card-foreground break-all">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Performance */}
                <div className="rounded-lg border border-border/30 p-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5 text-emerald-400" />
                    Page Performance
                  </h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[10px] font-mono">
                    {(() => {
                      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
                      const paint = performance.getEntriesByType('paint');
                      const fcp = paint.find(e => e.name === 'first-contentful-paint');
                      const entries: [string, string][] = [];
                      if (nav) {
                        entries.push(['DNS Lookup', `${Math.round(nav.domainLookupEnd - nav.domainLookupStart)}ms`]);
                        entries.push(['TCP Connect', `${Math.round(nav.connectEnd - nav.connectStart)}ms`]);
                        entries.push(['DOM Interactive', `${Math.round(nav.domInteractive)}ms`]);
                        entries.push(['DOM Complete', `${Math.round(nav.domComplete)}ms`]);
                        entries.push(['Load Event', `${Math.round(nav.loadEventEnd)}ms`]);
                        entries.push(['Transfer Size', fmtBytes(nav.transferSize)]);
                      }
                      if (fcp) entries.push(['First Contentful Paint', `${Math.round(fcp.startTime)}ms`]);
                      entries.push(['Session Duration', fmtUptime(Date.now() - sessionStart.current)]);
                      entries.push(['Total API Calls', String(apiLogs.length)]);
                      return entries.map(([k, v]) => (
                        <div key={k} className="flex gap-2 py-0.5 border-b border-border/10">
                          <span className="text-emerald-400 w-40 flex-shrink-0">{k}</span>
                          <span className="text-card-foreground">{v}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Active Persona Access Matrix */}
                <div className="rounded-lg border border-border/30 p-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-violet-400" />
                    Persona Access Matrix
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {personaDef?.allowedPages.map(page => (
                      <Badge key={page} variant="outline" className="text-[9px] py-0 font-mono">{page}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </Resizable>
    </div>
  );
}
