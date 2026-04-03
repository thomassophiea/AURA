/**
 * Report Center — Hamina-Style Customizable Reporting
 *
 * Orchestrator component that wires together:
 * - useReportConfig for config state (pages, widgets, persistence)
 * - ReportSidebar for page navigation with drag-to-reorder
 * - ReportHeader for config selection, duration, actions
 * - ReportWidgetRenderer for rendering widgets from config
 * - ReportEditorDialog for editing pages and widgets
 * - ReportShareDialog for sharing/import/export
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { ScrollArea } from './ui/scroll-area';
import { cn } from './ui/utils';
import { apiService } from '../services/api';
import { fetchWidgetData } from '../services/widgetService';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { useReportConfig } from '../hooks/useReportConfig';
import { getWidgetKeysForConfig } from '../config/defaultReportConfig';
import { ReportWidgetRenderer, type ReportMetrics } from './report/ReportWidgetRenderer';
import { ReportSidebar } from './report/ReportSidebar';
import { ReportHeader } from './report/ReportHeader';
import { ReportEditorDialog } from './report/ReportEditorDialog';
import { ReportShareDialog } from './report/ReportShareDialog';
import { toast } from 'sonner';
import { formatBitsPerSecond, formatBytes } from '../lib/units';

export function ReportCenter() {
  const { filters } = useGlobalFilters();
  const rc = useReportConfig();

  const [duration, setDuration] = useState(rc.activeConfig.duration || '24H');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  // Derive needed widget keys from active config
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
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-6 w-48" />
        </div>
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

  return (
    <div className="flex gap-0 -m-4 sm:-m-6 h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <ReportSidebar
        pages={rc.activeConfig.pages}
        activePageId={currentPage?.id || null}
        onSelectPage={rc.setActivePage}
        onAddPage={() => rc.addPage('New Page', 'Custom report page')}
        onRemovePage={rc.removePage}
        onReorderPages={rc.reorderPages}
        onToggleVisibility={(pageId) => {
          const page = rc.activeConfig.pages.find(p => p.id === pageId);
          if (page) rc.updatePage(pageId, { visible: page.visible === false ? true : false } as any);
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        isEditing={isEditing}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ReportHeader
          configs={rc.configs}
          activeConfig={rc.activeConfig}
          activePage={currentPage}
          duration={duration}
          lastUpdated={lastUpdated}
          refreshing={refreshing}
          isEditing={isEditing}
          siteLabel={siteId || 'All Sites'}
          onSelectConfig={rc.setActiveConfig}
          onDurationChange={setDuration}
          onRefresh={() => loadAllData(true)}
          onExport={handleExport}
          onPrint={() => window.print()}
          onShare={() => setIsShareOpen(true)}
          onToggleEdit={() => {
            if (isEditing) {
              setIsEditing(false);
              setIsEditorOpen(false);
            } else {
              setIsEditing(true);
              setIsEditorOpen(true);
            }
          }}
          onDuplicate={() => rc.duplicateConfig(rc.activeConfig.id)}
          onDelete={() => rc.deleteConfig(rc.activeConfig.id)}
          onReset={rc.resetToDefault}
          onCreateNew={() => rc.createConfig('New Report')}
        />

        {/* Page Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 sm:p-6">
            {currentPage ? (
              <div className="space-y-4">
                {/* Render widgets in a responsive grid based on gridSpan */}
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
              <span>AURA Network Report &middot; {rc.activeConfig.name} &middot; {currentPage?.title || ''} &middot; {new Date().toLocaleDateString()}</span>
              <span>Extreme Networks &middot; Powered by Platform ONE</span>
            </div>
          </div>
        </ScrollArea>
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
        shareURL={rc.getShareURL()}
        configJSON={rc.exportActiveConfig()}
        configName={rc.activeConfig.name}
        onImport={handleImport}
      />
    </div>
  );
}
