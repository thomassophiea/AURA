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
import { formatBitsPerSecond } from '../../lib/units';
import type { RangedNetworkStats } from '../../lib/rangedNetworkStats';
import type { ResolvedTimeRange } from '../../lib/timeRange';
import { DriftStrip } from './DriftStrip';
import { InsightCardsGrid } from './InsightCardsGrid';
import { RecentEventsSummary } from './RecentEventsSummary';
import { OrgSiteHealthOverview } from './OrgSiteHealthOverview';
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

  const onKpiKeyDown = (handler: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };

  const totalTp = formatBps(tpUp + tpDown);
  const [tpNum, ...tpUnit] = totalTp.split(' ');

  return (
    <div className="space-y-4">
      {/* Drift Detection Strip — Wave 4A */}
      <DriftStrip />

      {/* Observatory Instrument Panels — see .aura-kpi in index.css */}
      <div className="aura-kpi-grid">
        <div
          className="aura-kpi"
          onClick={goAccessPoint}
          onKeyDown={onKpiKeyDown(goAccessPoint)}
          role="button"
          tabIndex={0}
          aria-label="View Access Points details"
        >
          <div className="aura-kpi-eyebrow">
            <span>
              <span className="aura-kpi-eyebrow-channel">CH-01</span> · Access Points
              <span className="aura-kpi-eyebrow-basis">
                {basisFor(useWindow && rangedStats.apTotal !== null)}
              </span>
            </span>
            <Wifi className="aura-kpi-icon" />
          </div>
          <div className="aura-kpi-figure">
            {apTotal}
            <span className="aura-kpi-figure-unit">AP</span>
          </div>
          <div className="aura-kpi-foot">
            <span className="aura-kpi-foot-good">
              <span className="aura-kpi-foot-mark">●</span>
              {apOnline} online
            </span>
            <span>{Math.max(0, apTotal - apOnline)} offline</span>
          </div>
          <span className="aura-kpi-corner-br" aria-hidden="true" />
        </div>

        <div
          className="aura-kpi"
          onClick={goClient}
          onKeyDown={onKpiKeyDown(goClient)}
          role="button"
          tabIndex={0}
          aria-label="View Connected Clients details"
        >
          <div className="aura-kpi-eyebrow">
            <span>
              <span className="aura-kpi-eyebrow-channel">CH-02</span> · Clients
              <span className="aura-kpi-eyebrow-basis">
                {basisFor(useWindow && rangedStats.clientTotal !== null)}
              </span>
            </span>
            <Users className="aura-kpi-icon" />
          </div>
          <div className="aura-kpi-figure">
            {clientTotal}
            <span className="aura-kpi-figure-unit">CLNT</span>
          </div>
          <div className="aura-kpi-foot">
            <span className="aura-kpi-foot-good">
              <span className="aura-kpi-foot-mark">●</span>
              {clientAuth} authenticated
            </span>
            {/* Peak is the figure an operator actually plans capacity against;
                a mean alone hides the busiest moment of the window. */}
            {useWindow && rangedStats.clientPeak !== null ? (
              <span>peak {rangedStats.clientPeak}</span>
            ) : (
              <span>{Math.max(0, clientTotal - clientAuth)} pending</span>
            )}
          </div>
          <span className="aura-kpi-corner-br" aria-hidden="true" />
        </div>

        <div className="aura-kpi" tabIndex={-1}>
          <div className="aura-kpi-eyebrow">
            <span>
              <span className="aura-kpi-eyebrow-channel">CH-03</span> · Throughput
              <span className="aura-kpi-eyebrow-basis">
                {basisFor(useWindow && rangedStats.throughputUpload !== null)}
              </span>
            </span>
            <Activity className="aura-kpi-icon" />
          </div>
          <div className="aura-kpi-figure">
            {tpNum}
            <span className="aura-kpi-figure-unit">{tpUnit.join(' ')}</span>
          </div>
          <div className="aura-kpi-foot">
            <span>↑ {formatBps(tpUp)}</span>
            <span>↓ {formatBps(tpDown)}</span>
          </div>
          <span className="aura-kpi-corner-br" aria-hidden="true" />
        </div>

        <div className="aura-kpi" tabIndex={-1}>
          <div className="aura-kpi-eyebrow">
            <span>
              <span className="aura-kpi-eyebrow-channel">CH-04</span> · Alerts
              {/* Alarms are not persisted, so this tile is always current state
                  and must not imply otherwise. */}
              <span className="aura-kpi-eyebrow-basis">now</span>
            </span>
            <AlertTriangle className="aura-kpi-icon" />
          </div>
          <div className="aura-kpi-figure">
            {alertCounts.critical + alertCounts.warning}
            <span className="aura-kpi-figure-unit">EVT</span>
          </div>
          <div className="aura-kpi-foot">
            <span className="aura-kpi-foot-bad">
              <span className="aura-kpi-foot-mark">●</span>
              {alertCounts.critical} critical
            </span>
            {alertCounts.warning > 0 && (
              <span className="aura-kpi-foot-warn">
                <span className="aura-kpi-foot-mark">●</span>
                {alertCounts.warning} warning
              </span>
            )}
          </div>
          <span className="aura-kpi-corner-br" aria-hidden="true" />
        </div>
      </div>

      {/* Best Practice Evaluation */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">Best Practice Evaluation</h3>
          <p className="text-sm text-muted-foreground">
            Network configuration and optimization recommendations
          </p>
        </div>
        <BestPracticesWidget />
      </div>

      <InsightCardsGrid
        apStats={apStats}
        clientStats={clientStats}
        alertCounts={alertCounts}
        poorServices={poorServices}
        lastUpdate={lastUpdate}
      />

      <RecentEventsSummary
        offlineApCount={apStats.offline}
        criticalCount={alertCounts.critical}
        warningCount={alertCounts.warning}
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

      <div className="space-y-4">
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">Audit Logs</h3>
          <p className="text-sm text-muted-foreground">
            Recent configuration and operational changes
          </p>
        </div>
        <AuditLogsWidget />
      </div>

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
