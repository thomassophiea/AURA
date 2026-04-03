/**
 * Shared Report Viewer
 *
 * Standalone read-only report viewer for shared links.
 * Renders outside the main app shell — no sidebar, no nav, just the report.
 * Has its own login gate with a minimal branded header.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import {
  FileText, Wifi, Users, Activity, BarChart3, Radio, AppWindow, MapPin,
  Shield, RefreshCw, Download, Printer, Clock, ExternalLink, Settings,
} from 'lucide-react';
import { cn } from './ui/utils';
import { apiService } from '../services/api';
import { fetchWidgetData } from '../services/widgetService';
import { parseSharePayload } from '../services/reportConfigPersistence';
import { getWidgetKeysForConfig } from '../config/defaultReportConfig';
import { ReportWidgetRenderer, type ReportMetrics } from './report/ReportWidgetRenderer';
import { LoginForm } from './LoginForm';
import { toast } from 'sonner';
import { Toaster } from './ui/sonner';
import { formatBitsPerSecond, formatBytes } from '../lib/units';
import type { ReportConfig, ReportPageConfig } from '../types/reportConfig';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Wifi, Users, Activity, BarChart3, Radio, AppWindow, MapPin, Shield, Settings,
};

interface SharedReportViewerProps {
  payload: string;
}

export function SharedReportViewer({ payload }: SharedReportViewerProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [parseError, setParseError] = useState(false);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [apData, setApData] = useState<any[]>([]);
  const [stationData, setStationData] = useState<any[]>([]);
  const [siteData, setSiteData] = useState<any[]>([]);
  const [serviceData, setServiceData] = useState<any[]>([]);
  const [widgetData, setWidgetData] = useState<Record<string, any>>({});
  const [bestPractices, setBestPractices] = useState<any[]>([]);

  // Parse config from URL payload
  useEffect(() => {
    try {
      const parsed = parseSharePayload(payload);
      if (parsed) {
        setConfig(parsed);
        if (parsed.pages.length > 0) setActivePageId(parsed.pages[0].id);
      } else {
        setParseError(true);
      }
    } catch {
      setParseError(true);
    }
  }, [payload]);

  // Check existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      apiService.validateSession().then(valid => {
        if (valid) setIsAuthenticated(true);
      }).catch(() => {});
    }
  }, []);

  const widgetKeysNeeded = useMemo(() => config ? getWidgetKeysForConfig(config) : [], [config]);
  const duration = config?.duration || '24H';

  // Data loading
  const loadAllData = useCallback(async (isRefresh = false) => {
    if (!config) return;
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [aps, stations, sites, services, widgets, bpResp] = await Promise.allSettled([
        apiService.getAccessPointsBySite(undefined),
        apiService.getAllStations(),
        apiService.getSites(),
        apiService.getServices(),
        widgetKeysNeeded.length > 0
          ? fetchWidgetData({ duration, widgets: widgetKeysNeeded })
          : Promise.resolve({}),
        apiService.makeAuthenticatedRequest('/v1/bestpractices/evaluate', { method: 'GET' }, 10000),
      ]);

      if (aps.status === 'fulfilled') setApData(aps.value || []);
      if (stations.status === 'fulfilled') setStationData(stations.value || []);
      if (sites.status === 'fulfilled') setSiteData(sites.value || []);
      if (services.status === 'fulfilled') setServiceData(services.value || []);
      if (widgets.status === 'fulfilled') setWidgetData(widgets.value || {});

      if (bpResp.status === 'fulfilled') {
        try {
          const resp = bpResp.value;
          if (resp.ok) {
            const data = await resp.json();
            setBestPractices(data?.conditions || []);
          }
        } catch { /* ignore */ }
      }

      setLastUpdated(new Date());
      if (isRefresh) toast.success('Report refreshed');
    } catch {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [config, duration, widgetKeysNeeded]);

  useEffect(() => {
    if (isAuthenticated && config) loadAllData();
  }, [isAuthenticated, config, loadAllData]);

  // Computed metrics (same as ReportCenter)
  const metrics: ReportMetrics = useMemo(() => {
    const totalAps = apData.length;
    const onlineAps = apData.filter((a: any) => {
      const s = (a.status || a.connectionState || '').toLowerCase();
      return s === 'connected' || s === 'online' || s === 'active';
    }).length;
    const totalClients = stationData.length;
    const authenticated = stationData.filter((s: any) =>
      s.authenticated === undefined || s.authenticated === true || s.authenticated === 1
    ).length;
    let totalUpload = 0, totalDownload = 0;
    const bands: Record<string, number> = { '2.4 GHz': 0, '5 GHz': 0, '6 GHz': 0 };
    const rssiRanges = { excellent: 0, good: 0, fair: 0, poor: 0 };
    let rssiSum = 0, rssiCount = 0;
    const ssidMap = new Map<string, number>();
    stationData.forEach((s: any) => {
      const tx = s.transmittedRate || s.txRate || 0;
      const rx = s.receivedRate || s.rxRate || 0;
      totalUpload += tx > 1000 ? tx : tx * 1_000_000;
      totalDownload += rx > 1000 ? rx : rx * 1_000_000;
      const band = s.band || s.frequencyBand || '';
      const rate = Math.max(tx, rx);
      if (band.includes('6')) bands['6 GHz']++;
      else if (band.includes('5')) bands['5 GHz']++;
      else if (band.includes('2')) bands['2.4 GHz']++;
      else if (rate > 0) {
        const mbps = rate > 1000 ? rate / 1_000_000 : rate;
        if (mbps > 1200) bands['6 GHz']++; else if (mbps > 150) bands['5 GHz']++; else bands['2.4 GHz']++;
      }
      const rssi = s.rssi || s.rss || 0;
      if (rssi < 0) {
        rssiSum += rssi; rssiCount++;
        if (rssi >= -50) rssiRanges.excellent++; else if (rssi >= -60) rssiRanges.good++;
        else if (rssi >= -70) rssiRanges.fair++; else rssiRanges.poor++;
      }
      const name = s.ssid || s.serviceName || 'Unknown';
      ssidMap.set(name, (ssidMap.get(name) || 0) + 1);
    });
    const modelMap = new Map<string, number>();
    apData.forEach((a: any) => {
      const model = a.model || a.hardwareType || a.platformName || 'Unknown';
      modelMap.set(model, (modelMap.get(model) || 0) + 1);
    });
    const bpGood = bestPractices.filter((b: any) => b.status === 'Good').length;
    const bpWarn = bestPractices.filter((b: any) => b.status === 'Warning').length;
    const bpError = bestPractices.filter((b: any) => b.status === 'Error').length;
    return {
      totalAps, onlineAps, offlineAps: totalAps - onlineAps,
      totalClients, authenticated,
      totalUpload, totalDownload, totalThroughput: totalUpload + totalDownload,
      bands, rssiRanges, avgRssi: rssiCount > 0 ? Math.round(rssiSum / rssiCount) : 0,
      apModels: Array.from(modelMap.entries()).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count),
      ssidDist: Array.from(ssidMap.entries()).map(([name, count]) => ({ name, count, pct: totalClients > 0 ? (count / totalClients) * 100 : 0 })).sort((a, b) => b.count - a.count),
      totalSites: siteData.length, totalServices: serviceData.length,
      bpGood, bpWarn, bpError,
      bpScore: bestPractices.length > 0 ? Math.round((bpGood / bestPractices.length) * 100) : 100,
      bpTotal: bestPractices.length,
      bestPractices,
    };
  }, [apData, stationData, siteData, serviceData, bestPractices]);

  // ── Error state ──
  if (parseError || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Invalid Report Link</h1>
          <p className="text-sm text-muted-foreground">This report link is malformed or expired.</p>
        </div>
      </div>
    );
  }

  // ── Login gate ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* Branded header */}
        <div className="border-b border-border/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">{config.name}</h1>
              <p className="text-[10px] text-muted-foreground">Shared Network Report &middot; Extreme Networks</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {config.pages.length} pages
          </Badge>
        </div>

        {/* Login form centered */}
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 56px)' }}>
          <div className="w-full max-w-md">
            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground">Sign in to view this report</p>
            </div>
            <LoginForm
              onLoginSuccess={() => setIsAuthenticated(true)}
              theme="ep1"
              onThemeToggle={() => {}}
            />
          </div>
        </div>
        <Toaster />
      </div>
    );
  }

  // ── Active page ──
  const currentPage = config.pages.find(p => p.id === activePageId) || config.pages[0];

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-10 w-full rounded" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Branded Header ── */}
      <div className="border-b border-border/50 px-6 py-2 flex items-center justify-between bg-card/50 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 bg-primary rounded-md flex items-center justify-center">
            <FileText className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">{config.name}</h1>
            <p className="text-[10px] text-muted-foreground">Extreme Networks &middot; Platform ONE</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => loadAllData(true)} disabled={refreshing}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Page Tabs ── */}
      <div className="border-b border-border/30 px-6 bg-card/30 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-0.5">
          {config.pages.filter(p => p.visible !== false).map(page => {
            const IconComp = ICON_MAP[page.icon || ''] || FileText;
            const isActive = currentPage?.id === page.id;
            return (
              <button
                key={page.id}
                onClick={() => setActivePageId(page.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0',
                  isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-card-foreground'
                )}
              >
                <IconComp className="h-3.5 w-3.5" />
                {page.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Page Content ── */}
      <div className="max-w-6xl mx-auto p-6">
        {currentPage && (
          <div className="space-y-4">
            {currentPage.description && (
              <p className="text-xs text-muted-foreground">{currentPage.description}</p>
            )}
            <div className="grid grid-cols-4 gap-4">
              {currentPage.widgets.map(widget => (
                <div
                  key={widget.id}
                  className={cn('col-span-4', {
                    'col-span-4 md:col-span-1': (widget.gridSpan || 1) === 1,
                    'col-span-4 md:col-span-2': widget.gridSpan === 2,
                    'col-span-4 md:col-span-3': widget.gridSpan === 3,
                    'col-span-4': widget.gridSpan === 4,
                  })}
                >
                  <ReportWidgetRenderer widget={widget} widgetData={widgetData} metrics={metrics} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>AURA Network Report &middot; {config.name} &middot; {currentPage?.title || ''} &middot; {new Date().toLocaleDateString()}</span>
          <span>Extreme Networks &middot; Powered by Platform ONE</span>
        </div>
      </div>

      <Toaster />
    </div>
  );
}
