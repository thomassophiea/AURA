/**
 * AIInsightsBranch — bird's-eye AI Insights overview, shown when
 * selectorTab === 'ai-insights' on the main dashboard.
 *
 * Renders the Observatory instrument panel KPI grid (channels CH-01..04),
 * peer benchmarking, best practices, insight cards, recent events,
 * health overview, the optional detail panel, audit logs, and the
 * drill-down footer hint.
 */

import { memo, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { AlertTriangle, Activity, Wifi, Users, Gauge } from 'lucide-react';
import { formatBitsPerSecond, formatCount } from '../../lib/units';
import { MetricCard } from '../ui/MetricCard';
import type { RangedNetworkStats } from '../../lib/rangedNetworkStats';
import type { ResolvedTimeRange } from '../../lib/timeRange';
import { DriftStrip } from './DriftStrip';
import { InsightCardsGrid } from './InsightCardsGrid';
import { OrgSiteHealthOverview } from './OrgSiteHealthOverview';
import { SitesAttentionWidget } from './SitesAttentionWidget';
import type {
  AccessPoint as ApInventoryItem,
  Station as StationInventoryItem,
} from '../../hooks/useDashboardData';
import { DetailPanel } from './DetailPanel';
import { BestPracticesWidget } from '../BestPracticesWidget';
import { AuditLogsWidget } from '../AuditLogsWidget';
import type { SelectorTab } from '../UnifiedFilterBar';

interface APStats {
  total: number;
  online: number;
  offline: number;
  primary: number;
  backup: number;
  standby: number;
  lowPower: number;
  normalPower: number;
  models: Record<string, number>;
  avgChannelUtil: number;
}

interface ClientStats {
  total: number;
  authenticated: number;
  throughputUpload: number;
  throughputDownload: number;
  avgRfqi: number;
}

interface AlertCounts {
  critical: number;
  warning: number;
  info: number;
}

interface BandBucket {
  band: string;
  count: number;
  color: string;
}

interface SnrBucket {
  category: string;
  count: number;
  color: string;
}

interface RfqiPoint {
  timestamp: number;
  healthy: number;
  needsAttention: number;
  rfqi: number;
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PoorService = any;

interface AIInsightsBranchProps {
  apStats: APStats;
  clientStats: ClientStats;
  alertCounts: AlertCounts;
  poorServices: PoorService[];
  lastUpdate: Date | null;
  siteScope: string;
  rfqiData: RfqiPoint[];
  avgRssi: number;
  avgSnr: number;
  bandDistribution: BandBucket[];
  snrDistribution: SnrBucket[];
  aiInsightsDetailPanel: boolean;
  aiActiveHealthTab: 'needsAttention' | 'healthy';
  setAiActiveHealthTab: (t: 'needsAttention' | 'healthy') => void;
  selectedNetworkEvent: NetworkEvent | null;
  setSelectedNetworkEvent: (e: NetworkEvent | null) => void;
  onCloseDetailPanel: () => void;
  setSelectorTab: (t: SelectorTab) => void;
  /** Counts computed over the selected window; falls back to the live snapshot. */
  rangedStats: RangedNetworkStats;
  /** The selected window, for labelling what the tiles are measuring. */
  timeRange: ResolvedTimeRange;
  /** Raw inventories for the per-site health widget (already fetched by the page). */
  accessPoints?: ApInventoryItem[];
  stations?: StationInventoryItem[];
}

function AIInsightsBranchComponent({
  apStats,
  clientStats,
  alertCounts,
  poorServices,
  lastUpdate,
  siteScope,
  rfqiData,
  avgRssi,
  avgSnr,
  bandDistribution,
  snrDistribution,
  aiInsightsDetailPanel,
  aiActiveHealthTab,
  setAiActiveHealthTab,
  selectedNetworkEvent,
  setSelectedNetworkEvent,
  onCloseDetailPanel,
  setSelectorTab,
  rangedStats,
  timeRange,
  accessPoints = [],
  stations = [],
}: AIInsightsBranchProps) {
  const formatBps = formatBitsPerSecond;

  /**
   * Which basis each tile is on.
   *
   * These tiles used to read from the live controller snapshot only, so they
   * showed identical numbers for every time selection — the control appeared
   * inert. They now prefer the window figures derived from stored history, and
   * fall back to the snapshot when nothing was stored for the window.
   *
   * The distinction is labelled rather than hidden: a mean over seven days and
   * an instantaneous reading are different quantities, and a tile that silently
   * switched between them would be worse than one that never moved.
   */
  const useWindow = rangedStats.available;
  const windowLabel = timeRange.label.toLowerCase();

  const apTotal = useWindow && rangedStats.apTotal !== null ? rangedStats.apTotal : apStats.total;
  const apOnline =
    useWindow && rangedStats.apOnline !== null ? rangedStats.apOnline : apStats.online;
  const clientTotal =
    useWindow && rangedStats.clientTotal !== null ? rangedStats.clientTotal : clientStats.total;
  const clientAuth =
    useWindow && rangedStats.clientAuthenticated !== null
      ? rangedStats.clientAuthenticated
      : clientStats.authenticated;
  const tpUp =
    useWindow && rangedStats.throughputUpload !== null
      ? rangedStats.throughputUpload
      : clientStats.throughputUpload;
  const tpDown =
    useWindow && rangedStats.throughputDownload !== null
      ? rangedStats.throughputDownload
      : clientStats.throughputDownload;

  /** Eyebrow suffix telling the operator what they are reading. */
  const basisFor = (fromWindow: boolean) => (fromWindow ? `avg · ${windowLabel}` : 'now');

  const goAccessPoint = useCallback(() => setSelectorTab('access-point'), [setSelectorTab]);
  const goClient = useCallback(() => setSelectorTab('client'), [setSelectorTab]);

  const apOffline = Math.max(0, apTotal - apOnline);
  const totalAlerts = alertCounts.critical + alertCounts.warning;

  return (
    <div className="space-y-4">
      {/* Drift Detection Strip — Wave 4A */}
      <DriftStrip />

      {/* Headline KPIs. The basis suffix ("avg · last 24 hours" vs "now") is
          deliberate: a mean over a window and an instantaneous reading are
          different quantities, and a tile that silently switched between them
          would be worse than one that never moved. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Access points"
          value={formatCount(apTotal)}
          icon={Wifi}
          tone={apOffline > 0 ? 'warning' : 'default'}
          subtitle={`${apOnline} online · ${apOffline} offline · ${basisFor(
            useWindow && rangedStats.apTotal !== null
          )}`}
          onClick={goAccessPoint}
          aria-label="View Access Points details"
        />
        <MetricCard
          title="Clients"
          value={formatCount(clientTotal)}
          icon={Users}
          subtitle={
            useWindow && rangedStats.clientPeak !== null
              ? `${clientAuth} authenticated · peak ${rangedStats.clientPeak} · ${basisFor(true)}`
              : `${clientAuth} authenticated · ${Math.max(0, clientTotal - clientAuth)} pending · ${basisFor(
                  useWindow && rangedStats.clientTotal !== null
                )}`
          }
          onClick={goClient}
          aria-label="View Connected Clients details"
        />
        <MetricCard
          title="Throughput"
          value={formatBps(tpUp + tpDown)}
          icon={Activity}
          subtitle={`Up ${formatBps(tpUp)} · Down ${formatBps(tpDown)} · ${basisFor(
            useWindow && rangedStats.throughputUpload !== null
          )}`}
        />
        <MetricCard
          title="Active alerts"
          value={formatCount(totalAlerts)}
          icon={AlertTriangle}
          tone={
            alertCounts.critical > 0 ? 'critical' : alertCounts.warning > 0 ? 'warning' : 'default'
          }
          toneValue={alertCounts.critical > 0}
          subtitle={
            totalAlerts > 0
              ? `${alertCounts.critical} critical · ${alertCounts.warning} warning · now`
              : 'No active alerts · now'
          }
        />
      </div>

      <SitesAttentionWidget accessPoints={accessPoints} stations={stations} />

      <BestPracticesWidget />

      <InsightCardsGrid
        apStats={apStats}
        clientStats={clientStats}
        alertCounts={alertCounts}
        poorServices={poorServices}
        lastUpdate={lastUpdate}
      />

      <OrgSiteHealthOverview
        siteScope={siteScope}
        rfqiData={rfqiData}
        avgRssi={avgRssi}
        avgSnr={avgSnr}
        totalClients={clientStats.total}
        bandDistribution={bandDistribution}
        snrDistribution={snrDistribution}
      />

      {aiInsightsDetailPanel && (
        <DetailPanel
          aiActiveHealthTab={aiActiveHealthTab}
          setAiActiveHealthTab={setAiActiveHealthTab}
          selectedNetworkEvent={selectedNetworkEvent}
          setSelectedNetworkEvent={setSelectedNetworkEvent}
          onClose={onCloseDetailPanel}
          apStats={apStats}
          clientStats={clientStats}
          alertCounts={alertCounts}
          setSelectorTab={setSelectorTab}
          lastUpdate={lastUpdate}
        />
      )}

      <AuditLogsWidget />

      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-4">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <Gauge className="h-4 w-4" />
              <span>
                Pick a <strong>Site</strong> to scope this page, or select an{' '}
                <strong>Access Point</strong> or <strong>Client</strong> above to drill into
                specific details
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const AIInsightsBranch = memo(AIInsightsBranchComponent);
