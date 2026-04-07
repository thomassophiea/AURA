/**
 * Shared Report Viewer
 *
 * Standalone read-only report viewer for shared links.
 * Renders from embedded data snapshot — NO LOGIN REQUIRED.
 * Shows the report exactly as it was when the link was created.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  FileText, Wifi, Users, Activity, BarChart3, Radio, AppWindow, MapPin,
  Shield, Printer, Clock, Settings, Info,
} from 'lucide-react';
import { cn } from './ui/utils';
import { parseSharePayload } from '../services/reportConfigPersistence';
import { ReportWidgetRenderer, type ReportMetrics } from './report/ReportWidgetRenderer';
import type { ReportConfig } from '../types/reportConfig';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Wifi, Users, Activity, BarChart3, Radio, AppWindow, MapPin, Shield, Settings,
};

interface SharedReportViewerProps {
  payload: string;
}

export function SharedReportViewer({ payload }: SharedReportViewerProps) {
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // Parse config + snapshot from URL payload
  const parsed = useMemo(() => {
    try {
      return parseSharePayload(payload);
    } catch {
      return null;
    }
  }, [payload]);

  // ── Error state ──
  if (!parsed || !parsed.config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Invalid Interactive Report</h1>
          <p className="text-sm text-muted-foreground">This Extreme Interactive Report link is malformed or expired.</p>
        </div>
      </div>
    );
  }

  const { config, snapshot } = parsed;

  // Build metrics from snapshot or empty defaults
  const metrics: ReportMetrics = snapshot?.metrics || {
    totalAps: 0, onlineAps: 0, offlineAps: 0,
    totalClients: 0, authenticated: 0,
    totalUpload: 0, totalDownload: 0, totalThroughput: 0,
    bands: {}, rssiRanges: { excellent: 0, good: 0, fair: 0, poor: 0 },
    avgRssi: 0, apModels: [], ssidDist: [],
    totalSites: 0, totalServices: 0,
    bpGood: 0, bpWarn: 0, bpError: 0, bpScore: 100, bpTotal: 0,
    bestPractices: [],
  };

  const widgetData: Record<string, any> = snapshot?.widgetData || {};

  // Active page
  const effectivePageId = activePageId || config.pages[0]?.id;
  const currentPage = config.pages.find(p => p.id === effectivePageId) || config.pages[0];
  const visiblePages = config.pages.filter(p => p.visible !== false);

  const generatedAt = snapshot?.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleString()
    : 'Unknown';

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
            <p className="text-[10px] text-muted-foreground">Extreme Interactive Report &middot; Platform ONE</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Clock className="h-3 w-3" />
            Snapshot: {generatedAt}
          </Badge>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Page Tabs ── */}
      <div className="border-b border-border/30 px-6 bg-card/30 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-0.5">
          {visiblePages.map(page => {
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

      {/* ── Snapshot Notice ── */}
      {!snapshot && (
        <div className="mx-6 mt-4 flex items-center gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-400">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>This is a legacy share link without embedded data. Widgets may show "No data available".</span>
        </div>
      )}

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
          <span>Extreme Interactive Report &middot; {config.name} &middot; {currentPage?.title || ''} &middot; {generatedAt}</span>
          <span>Extreme Report Studio &middot; Powered by Platform ONE</span>
        </div>
      </div>
    </div>
  );
}
