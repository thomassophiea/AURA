/**
 * NetworkDashboardView — the multi-section dashboard body shown when the
 * user selects Site / AP / Client / Switch in the UnifiedFilterBar without
 * drilling into a specific entity. Composes all the previously-extracted
 * dashboard sections plus the standalone widgets.
 */

import { memo } from 'react';
import { apiService } from '../../services/api';
import { OperationalContextSummary } from '../OperationalContextSummary';
import { CoreActivitySection } from './CoreActivitySection';
import { PerformanceSection } from './PerformanceSection';
import { TopClientsSection } from './TopClientsSection';
import { ServicesHealthSection } from './ServicesHealthSection';
import { RecentAlertsSection } from './RecentAlertsSection';
import { BestPracticesWidget } from '../BestPracticesWidget';
import { VenueStatisticsWidget } from '../VenueStatisticsWidget';
import { ConfigurationProfilesWidget } from '../ConfigurationProfilesWidget';
import { AuditLogsWidget } from '../AuditLogsWidget';
import { OSOneWidget } from '../OSOneWidget';
import type { DashboardSection } from '../../config/personaDashboardConfig';
import type { SelectorTab } from '../UnifiedFilterBar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

interface NetworkDashboardViewProps {
  showSection: (section: DashboardSection) => boolean;
  selectorTab: SelectorTab;
  selectedEntityId: string | null;
  selectedEntityName: string | null;
  apStats: AnyRecord;
  clientStats: AnyRecord;
  alertCounts: AnyRecord;
  throughputTrend: Array<{ time: string; upload: number; download: number; total: number }>;
  performanceMetrics: AnyRecord;
  radarData: AnyRecord;
  clientDistribution: Array<{ service: string; count: number; percentage: number }>;
  colors: string[];
  onServiceClick: (serviceName: string) => void;
  topClients: AnyRecord[];
  stations: AnyRecord[];
  isTopClientsCollapsed: boolean;
  onToggleTopClientsCollapsed: () => void;
  vendorLookupsInProgress: boolean;
  setSelectedClient: (c: AnyRecord) => void;
  setIsClientDialogOpen: (b: boolean) => void;
  poorServices: AnyRecord[];
  notifications: AnyRecord[];
  activeSiteId: string | null;
  venueDuration: string;
}

function NetworkDashboardViewComponent({
  showSection,
  selectorTab,
  selectedEntityId,
  selectedEntityName,
  apStats,
  clientStats,
  alertCounts,
  throughputTrend,
  performanceMetrics,
  radarData,
  clientDistribution,
  colors,
  onServiceClick,
  topClients,
  stations,
  isTopClientsCollapsed,
  onToggleTopClientsCollapsed,
  vendorLookupsInProgress,
  setSelectedClient,
  setIsClientDialogOpen,
  poorServices,
  notifications,
  activeSiteId,
  venueDuration,
}: NetworkDashboardViewProps) {
  return (
    <>
      {/* SECTION 1: OPERATIONAL CONTEXT SUMMARY */}
      {showSection('operational-context') && (
        <div className="space-y-4">
          <div className="border-b pb-2">
            <h3 className="text-lg font-semibold">
              {selectedEntityId && selectorTab === 'site'
                ? `Site Overview: ${selectedEntityName}`
                : 'Network Overview'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedEntityId && selectorTab === 'site'
                ? 'Site-specific context and performance metrics'
                : 'Intelligent context-aware network insights'}
            </p>
          </div>
          <OperationalContextSummary />
        </div>
      )}

      {/* SECTION 2: CORE OPERATIONAL ACTIVITY */}
      {showSection('core-activity') && (
        <CoreActivitySection
          apStats={apStats}
          clientStats={clientStats}
          alertCounts={alertCounts}
          throughputTrend={throughputTrend}
        />
      )}

      {/* SECTION 3: PERFORMANCE AND QUALITY */}
      {showSection('performance') && (
        <PerformanceSection
          performanceMetrics={performanceMetrics}
          radarData={radarData}
          apStats={apStats}
          clientStats={clientStats}
          clientDistribution={clientDistribution}
          colors={colors}
          onServiceClick={onServiceClick}
        />
      )}

      {/* SECTION 4: BEST PRACTICE EVALUATION */}
      {showSection('best-practices') && (
        <div className="space-y-4">
          <div className="border-b pb-2">
            <h3 className="text-lg font-semibold">Best Practice Evaluation</h3>
            <p className="text-sm text-muted-foreground">
              Network configuration and optimization recommendations
            </p>
          </div>
          <BestPracticesWidget />
        </div>
      )}

      {showSection('top-clients') && topClients.length > 0 && (
        <TopClientsSection
          topClients={topClients}
          collapsed={isTopClientsCollapsed}
          onToggleCollapse={onToggleTopClientsCollapsed}
          vendorLookupsInProgress={vendorLookupsInProgress}
          onClientClick={async (client: AnyRecord) => {
            try {
              const stationDetails = await apiService.fetchStationDetails(client.mac);
              const fullStation = stations.find((s) => s.macAddress === client.mac);
              setSelectedClient({ ...fullStation, ...stationDetails, ...client });
              setIsClientDialogOpen(true);
            } catch (error) {
              console.error('[Dashboard] Failed to fetch client details:', error);
              const fullStation = stations.find((s) => s.macAddress === client.mac);
              setSelectedClient(fullStation || client);
              setIsClientDialogOpen(true);
            }
          }}
        />
      )}

      {showSection('services-health') && poorServices.length > 0 && (
        <ServicesHealthSection poorServices={poorServices} />
      )}

      {showSection('alerts') && notifications.length > 0 && (
        <RecentAlertsSection notifications={notifications} />
      )}

      {showSection('venue-stats') && activeSiteId && (
        <VenueStatisticsWidget siteId={activeSiteId} duration={venueDuration} />
      )}

      {(showSection('config-profiles') || showSection('audit-logs')) && (
        <div className="grid gap-4 md:grid-cols-2">
          {showSection('config-profiles') && <ConfigurationProfilesWidget />}
          {showSection('audit-logs') && <AuditLogsWidget />}
        </div>
      )}

      {showSection('os-one') && <OSOneWidget compact={true} />}
    </>
  );
}

export const NetworkDashboardView = memo(NetworkDashboardViewComponent);
