/**
 * Extreme Report Studio
 *
 * Uses horizontal page tabs (not a left sidebar) to avoid doubling up
 * with the main app sidebar. Pages are navigated via a scrollable tab strip.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { ScrollArea } from './ui/scroll-area';
import {
  FileText, Wifi, Users, Activity, BarChart3, Radio, AppWindow, MapPin,
  Shield, RefreshCw, Download, Printer, Share2, Pencil, Check, Plus,
  Copy, Trash2, RotateCcw, Clock, ChevronLeft, ChevronRight, Settings,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { cn } from './ui/utils';
import { apiService } from '../services/api';
import { fetchWidgetData } from '../services/widgetService';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { useReportConfig } from '../hooks/useReportConfig';
import { getWidgetKeysForConfig } from '../config/defaultReportConfig';
import { ReportWidgetRenderer, type ReportMetrics } from './report/ReportWidgetRenderer';
import { ReportEditorDialog } from './report/ReportEditorDialog';
import { ReportShareDialog } from './report/ReportShareDialog';
import { toast } from 'sonner';
import { formatBitsPerSecond, formatBytes } from '../lib/units';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Wifi, Users, Activity, BarChart3, Radio, AppWindow, MapPin, Shield, Settings,
};

const DURATION_OPTIONS = [
  { value: '3H', label: '3H' },
  { value: '24H', label: '24H' },
  { value: '7D', label: '7D' },
  { value: '30D', label: '30D' },
];

export function ReportCenter() {
  const { filters } = useGlobalFilters();
  const rc = useReportConfig();

  const [duration, setDuration] = useState(rc.activeConfig.duration || '24H');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Raw data
  const [apData, setApData] = useState<any[]>([]);
  const [stationData, setStationData] = useState<any[]>([]);
  const [siteData, setSiteData] = useState<any[]>([]);
  const [serviceData, setServiceData] = useState<any[]>([]);
  const [widgetData, setWidgetData] = useState<Record<string, any>>({});
  const [bestPractices, setBestPractices] = useState<any[]>([]);

  const siteId = filters.site !== 'all' ? filters.site : undefined;
  const widgetKeysNeeded = useMemo(() => getWidgetKeysForConfig(rc.activeConfig), [rc.activeConfig]);

  // ── Data Loading ──
  const loadAllData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [aps, stations, sites, services, widgets, bpResp] = await Promise.allSettled([
        apiService.getAccessPointsBySite(siteId),
        apiService.getAllStations(),
        apiService.getSites(),
        apiService.getServices(),
        widgetKeysNeeded.length > 0
          ? fetchWidgetData({ siteId, duration, widgets: widgetKeysNeeded })
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
      if (isRefresh) toast.success('Report data refreshed');
    } catch (error) {
      console.error('[ReportCenter] Failed to load data:', error);
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [siteId, duration, widgetKeysNeeded]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  // ── Computed Metrics ──
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
        if (mbps > 1200) bands['6 GHz']++;
        else if (mbps > 150) bands['5 GHz']++;
        else bands['2.4 GHz']++;
      }

      const rssi = s.rssi || s.rss || 0;
      if (rssi < 0) {
        rssiSum += rssi; rssiCount++;
        if (rssi >= -50) rssiRanges.excellent++;
        else if (rssi >= -60) rssiRanges.good++;
        else if (rssi >= -70) rssiRanges.fair++;
        else rssiRanges.poor++;
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

  // ── Handlers ──
  const handleExport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      config: rc.activeConfig.name,
      duration, site: siteId || 'All Sites',
      metrics: {
        accessPoints: { total: metrics.totalAps, online: metrics.onlineAps },
        clients: { total: metrics.totalClients, authenticated: metrics.authenticated },
        throughput: { upload: metrics.totalUpload, download: metrics.totalDownload },
        bestPractices: { score: metrics.bpScore },
      },
      widgetData,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aura-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  const handleImport = (json: string): boolean => {
    const config = rc.importConfig(json);
    return config !== null;
  };

  // ── Loading State ──
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full rounded" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card><CardContent className="pt-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  const currentPage = rc.activePage;
  const visiblePages = rc.activeConfig.pages.filter(p => p.visible !== false);

  return (
    <div className="space-y-0">
      {/* ── Toolbar Row: Config selector + actions ── */}
      <div className="flex items-center justify-between gap-2 mb-3 print:hidden">
        <div className="flex items-center gap-2">
          <Select value={rc.activeConfig.id} onValueChange={rc.setActiveConfig}>
            <SelectTrigger size="sm" className="w-[180px] text-xs bg-transparent border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rc.configs.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <span>{c.name}</span>
                    {c.isDefault && <Badge variant="secondary" className="text-[9px]">Default</Badge>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Edit toggle */}
          <Button
            variant={isEditing ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              if (isEditing) { setIsEditing(false); setIsEditorOpen(false); }
              else { setIsEditing(true); setIsEditorOpen(true); }
            }}
            className="text-xs h-7"
          >
            {isEditing ? <><Check className="h-3 w-3 mr-1" />Done</> : <><Pencil className="h-3 w-3 mr-1" />Edit</>}
          </Button>

          {isEditing && (
            <>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => rc.createConfig('New Report')}>
                <Plus className="h-3 w-3 mr-1" />New
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => rc.duplicateConfig(rc.activeConfig.id)}>
                <Copy className="h-3 w-3 mr-1" />Duplicate
              </Button>
              {!rc.activeConfig.isDefault && (
                <Button variant="ghost" size="sm" className="text-xs h-7 text-red-400" onClick={() => rc.deleteConfig(rc.activeConfig.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}

          {!isEditing && (
            <>
              {/* Duration */}
              <div className="flex items-center border border-border/50 rounded-md overflow-hidden h-7">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setDuration(opt.value)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-medium transition-colors',
                      duration === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => loadAllData(true)} disabled={refreshing}>
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsShareOpen(true)}>
                <Share2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Page Tab Strip ── */}
      <div className="flex items-center gap-1 border-b border-border/50 mb-4 overflow-x-auto scrollbar-none print:hidden">
        {visiblePages.map(page => {
          const IconComp = ICON_MAP[page.icon || ''] || FileText;
          const isActive = currentPage?.id === page.id;
          return (
            <button
              key={page.id}
              onClick={() => rc.setActivePage(page.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-card-foreground hover:border-border'
              )}
            >
              <IconComp className="h-3.5 w-3.5" />
              {page.title}
            </button>
          );
        })}

        {isEditing && (
          <button
            onClick={() => rc.addPage('New Page', 'Custom report page')}
            className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-card-foreground border-b-2 border-transparent whitespace-nowrap flex-shrink-0"
          >
            <Plus className="h-3 w-3" />
            Add Page
          </button>
        )}
      </div>

      {/* ── Page Content ── */}
      {currentPage ? (
        <div className="space-y-4">
          {/* Page description */}
          {currentPage.description && (
            <p className="text-xs text-muted-foreground">{currentPage.description}</p>
          )}

          {/* Widget grid */}
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
                <ReportWidgetRenderer
                  widget={widget}
                  widgetData={widgetData}
                  metrics={metrics}
                />
              </div>
            ))}
          </div>

          {currentPage.widgets.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">This page has no widgets.</p>
              <p className="text-xs mt-1">Click Edit to add widgets from the catalog.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No pages in this report.</p>
          <p className="text-xs mt-1">Click Edit to add pages.</p>
        </div>
      )}

      {/* Report Footer */}
      <div className="mt-8 pt-4 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground print:mt-12">
        <span>Extreme Report Studio &middot; {rc.activeConfig.name} &middot; {currentPage?.title || ''} &middot; {new Date().toLocaleDateString()}</span>
        <span>Extreme Networks &middot; Powered by Platform ONE</span>
      </div>

      {/* Editor Dialog */}
      <ReportEditorDialog
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        page={currentPage}
        onUpdatePage={rc.updatePage}
        onAddWidget={rc.addWidget}
        onRemoveWidget={rc.removeWidget}
        onReorderWidgets={rc.reorderWidgets}
        onUpdateWidget={rc.updateWidget}
      />

      {/* Share Dialog */}
      <ReportShareDialog
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        shareURL={rc.getShareURL({
          metrics,
          widgetData,
          generatedAt: new Date().toISOString(),
        })}
        configJSON={rc.exportActiveConfig()}
        configName={rc.activeConfig.name}
        onImport={handleImport}
      />
    </div>
  );
}
