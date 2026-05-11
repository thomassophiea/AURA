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
import { Badge } from '../ui/badge';
import { AlertTriangle, Activity, Wifi, Users, Brain } from 'lucide-react';
import { formatBitsPerSecond } from '../../lib/units';
import { DriftStrip } from './DriftStrip';
import { InsightCardsGrid } from './InsightCardsGrid';
import { RecentEventsSummary } from './RecentEventsSummary';
import { OrgSiteHealthOverview } from './OrgSiteHealthOverview';
import { DetailPanel } from './DetailPanel';
import { BestPracticesWidget } from '../BestPracticesWidget';
import { AuditLogsWidget } from '../AuditLogsWidget';
import { PeerBenchmarking } from '../PeerBenchmarking';
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
}: AIInsightsBranchProps) {
  const formatBps = formatBitsPerSecond;

  const goAccessPoint = useCallback(() => setSelectorTab('access-point'), [setSelectorTab]);
  const goClient = useCallback(() => setSelectorTab('client'), [setSelectorTab]);

  const onKpiKeyDown = (handler: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };

  const totalTp = formatBps(clientStats.throughputUpload + clientStats.throughputDownload);
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
            </span>
            <Wifi className="aura-kpi-icon" />
          </div>
          <div className="aura-kpi-figure">
            {apStats.total}
            <span className="aura-kpi-figure-unit">AP</span>
          </div>
          <div className="aura-kpi-foot">
            <span className="aura-kpi-foot-good">
              <span className="aura-kpi-foot-mark">●</span>
              {apStats.online} online
            </span>
            <span>{apStats.total - apStats.online} offline</span>
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
            </span>
            <Users className="aura-kpi-icon" />
          </div>
          <div className="aura-kpi-figure">
            {clientStats.total}
            <span className="aura-kpi-figure-unit">CLNT</span>
          </div>
          <div className="aura-kpi-foot">
            <span className="aura-kpi-foot-good">
              <span className="aura-kpi-foot-mark">●</span>
              {clientStats.authenticated} authenticated
            </span>
            <span>{Math.max(0, clientStats.total - clientStats.authenticated)} pending</span>
          </div>
          <span className="aura-kpi-corner-br" aria-hidden="true" />
        </div>

        <div className="aura-kpi" tabIndex={-1}>
          <div className="aura-kpi-eyebrow">
            <span>
              <span className="aura-kpi-eyebrow-channel">CH-03</span> · Throughput
            </span>
            <Activity className="aura-kpi-icon" />
          </div>
          <div className="aura-kpi-figure">
            {tpNum}
            <span className="aura-kpi-figure-unit">{tpUnit.join(' ')}</span>
          </div>
          <div className="aura-kpi-foot">
            <span>↑ {formatBps(clientStats.throughputUpload)}</span>
            <span>↓ {formatBps(clientStats.throughputDownload)}</span>
          </div>
          <span className="aura-kpi-corner-br" aria-hidden="true" />
        </div>

        <div className="aura-kpi" tabIndex={-1}>
          <div className="aura-kpi-eyebrow">
            <span>
              <span className="aura-kpi-eyebrow-channel">CH-04</span> · Alerts
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

      {/* Peer Benchmarking */}
      <PeerBenchmarking />

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
              <Brain className="h-4 w-4" />
              <span>
                Select <strong>Site</strong>, <strong>AP</strong>, <strong>Switch</strong>{' '}
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 h-4 border-[color:var(--status-warning)]/50 text-[color:var(--status-warning)]"
                >
                  Beta
                </Badge>
                , or <strong>Client</strong> above to drill into specific details
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const AIInsightsBranch = memo(AIInsightsBranchComponent);
