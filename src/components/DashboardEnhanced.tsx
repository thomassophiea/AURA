import { useState, useEffect, memo, useCallback } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { EntityDetailView } from './dashboard/EntityDetailView';
import { DashboardHero } from './dashboard/DashboardHero';
import { AIInsightsBranch } from './dashboard/AIInsightsBranch';
import { ClientDetailDialog } from './dashboard/ClientDetailDialog';
import { ServiceClientsDialog } from './dashboard/ServiceClientsDialog';
import { NetworkDashboardView } from './dashboard/NetworkDashboardView';
import { UnifiedFilterBar, SelectorTab } from './UnifiedFilterBar';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { useOperationalContext } from '../hooks/useOperationalContext';
import { TimelineCursorControls } from './TimelineCursorControls';
import { usePersonaContext } from '../contexts/PersonaContext';
import {
  isSectionVisible,
  PERSONA_DASHBOARD_CONFIG,
  type DashboardSection,
} from '../config/personaDashboardConfig';
import { useDashboardData, type Station } from '../hooks/useDashboardData';

function DashboardEnhancedComponent() {
  const { filters, updateFilter } = useGlobalFilters();
  const { ctx: operationalCtx, setMode: setOperationalMode } = useOperationalContext();
  const { activePersona } = usePersonaContext();
  const personaConfig = PERSONA_DASHBOARD_CONFIG[activePersona];
  const showSection = useCallback(
    (section: DashboardSection) => isSectionVisible(activePersona, section),
    [activePersona]
  );

  const {
    loading,
    refreshing,
    lastUpdate,
    accessPoints,
    apStats,
    stations,
    clientStats,
    throughputTrend,
    topClients,
    clientDistribution,
    vendorLookupsInProgress,
    serviceIdToNameMap,
    poorServices,
    notifications,
    alertCounts,
    sites,
    rfqiData,
    bandDistribution,
    snrDistribution,
    avgSnr,
    avgRssi,
    activeSiteId,
    reload,
  } = useDashboardData();

  // UI-only dialog state
  const [selectedClient, setSelectedClient] = useState<Station | null>(null);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [isServiceClientsDialogOpen, setIsServiceClientsDialogOpen] = useState(false);
  const [isTopClientsCollapsed, setIsTopClientsCollapsed] = useState(true);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [selectorTab, setSelectorTab] = useState<SelectorTab>('ai-insights');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null);
  const [aiInsightsDetailPanel, setAiInsightsDetailPanel] = useState(true);
  const [aiActiveHealthTab, setAiActiveHealthTab] = useState<'needsAttention' | 'healthy'>(
    'healthy'
  );
  const [selectedNetworkEvent, setSelectedNetworkEvent] = useState<{
    id: string;
    time: string;
    type: 'single' | 'group' | 'infrastructure';
    description: string;
    affectedCount: number;
    aiExplanation: string;
    severity: 'low' | 'medium' | 'high';
    status: 'resolved' | 'in-progress' | 'monitoring' | 'stable' | 'requires-action';
    entityNames?: string[];
  } | null>(null);

  // Sync operational context siteId → global filters
  useEffect(() => {
    if (operationalCtx.mode === 'SITE' && operationalCtx.siteId) {
      if (filters.site !== operationalCtx.siteId) {
        updateFilter('site', operationalCtx.siteId);
      }
    }
  }, [operationalCtx.siteId, operationalCtx.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync operational context → selectorTab/selectedEntityId
  useEffect(() => {
    if (operationalCtx.mode === 'AI_INSIGHTS') {
      setSelectorTab('ai-insights');
      setSelectedEntityId(null);
      setSelectedEntityName(null);
      return;
    }
    if (operationalCtx.mode === 'SITE') {
      setSelectorTab('site');
      setSelectedEntityId(operationalCtx.siteId);
      const site = sites.find((s) => s.id === operationalCtx.siteId);
      setSelectedEntityName(site?.name || site?.siteName || operationalCtx.siteId);
      return;
    }
    if (operationalCtx.mode === 'AP') {
      setSelectorTab('access-point');
      setSelectedEntityId(operationalCtx.apId);
      const ap = accessPoints.find((a) => a.serialNumber === operationalCtx.apId);
      setSelectedEntityName(
        ap?.displayName || ap?.hostname || ap?.serialNumber || operationalCtx.apId
      );
      return;
    }
    if (operationalCtx.mode === 'CLIENT') {
      setSelectorTab('client');
      setSelectedEntityId(operationalCtx.clientId);
      const st = stations.find((s) => s.macAddress === operationalCtx.clientId);
      setSelectedEntityName(st?.hostName || operationalCtx.clientId);
      return;
    }
  }, [
    operationalCtx.mode,
    operationalCtx.siteId,
    operationalCtx.apId,
    operationalCtx.clientId,
    accessPoints,
    stations,
    sites,
  ]);

  // Always start at AI Insights on fresh page load
  useEffect(() => {
    setOperationalMode('AI_INSIGHTS');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getServiceNameForStation = (station: Station): string => {
    let serviceName =
      station.ssid ||
      station.essid ||
      station.serviceName ||
      station.network ||
      station.networkName ||
      station.profileName;
    if (!serviceName && station.serviceId) {
      serviceName = serviceIdToNameMap.get(station.serviceId) || undefined;
    }
    if (!serviceName && station.serviceId) {
      serviceName = station.serviceId.length > 20 ? 'Unknown Service' : station.serviceId;
    }
    return serviceName || 'Unknown';
  };

  const handleServiceClick = (serviceName: string) => {
    setSelectedService(serviceName);
    setIsServiceClientsDialogOpen(true);
  };

  const getClientsForService = () => {
    if (!selectedService) return [];
    return stations.filter((station) => getServiceNameForStation(station) === selectedService);
  };

  const COLORS = ['#BB86FC', '#03DAC5', '#CF6679', '#3700B3', '#018786', '#B00020'];

  const calculatePerformanceMetrics = () => {
    if (stations.length === 0) return null;
    const stationsWithRssi = stations.filter((s) => Number.isFinite(s.rssi) && s.rssi !== 0);
    const computedAvgRssi =
      stationsWithRssi.length > 0
        ? stationsWithRssi.reduce((sum, s) => sum + (s.rssi as number), 0) / stationsWithRssi.length
        : NaN;
    const stationsWithSnr = stations.filter((s) => Number.isFinite(s.snr) && (s.snr as number) > 0);
    const computedAvgSnr =
      stationsWithSnr.length > 0
        ? stationsWithSnr.reduce((sum, s) => sum + (s.snr as number), 0) / stationsWithSnr.length
        : NaN;
    return {
      avgRssi: computedAvgRssi,
      avgSnr: computedAvgSnr,
      authenticatedRate: (clientStats.authenticated / Math.max(clientStats.total, 1)) * 100,
      apUptime: apStats.total > 0 ? (apStats.online / apStats.total) * 100 : 100,
      channelUtil: apStats.avgChannelUtil,
      rfqi: clientStats.avgRfqi,
      totalThroughputMbps:
        (clientStats.throughputUpload + clientStats.throughputDownload) / 1_000_000,
    };
  };

  const performanceMetrics = calculatePerformanceMetrics();

  const radarData = performanceMetrics
    ? [
        {
          metric: 'Reliability',
          value: Math.round(performanceMetrics.authenticatedRate) || 0,
          fullMark: 100,
        },
        {
          metric: 'AP Uptime',
          value: Math.round(performanceMetrics.apUptime) || 0,
          fullMark: 100,
        },
        {
          metric: 'Signal (SNR)',
          value: Math.min(100, Math.round((performanceMetrics.avgSnr / 50) * 100)) || 0,
          fullMark: 100,
        },
        {
          metric: 'Signal (RSSI)',
          value: Math.max(0, Math.min(100, Math.round((performanceMetrics.avgRssi + 100) * 1.25))),
          fullMark: 100,
        },
        {
          metric: 'RF Quality',
          value: Math.round(performanceMetrics.rfqi) || 0,
          fullMark: 100,
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardHero
        activePersona={activePersona}
        personaConfig={personaConfig}
        lastUpdate={lastUpdate}
        refreshing={refreshing}
        onRefresh={() => reload(true)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <UnifiedFilterBar
          searchPlaceholder="Search widgets, metrics..."
          searchValue={dashboardSearch}
          onSearchChange={setDashboardSearch}
          defaultContextTab="site"
          showEnvironment={true}
          showTimeRange={true}
        />
        <TimelineCursorControls />
      </div>

      {selectorTab === 'ai-insights' && (
        <AIInsightsBranch
          apStats={apStats}
          clientStats={clientStats}
          alertCounts={alertCounts}
          poorServices={poorServices}
          lastUpdate={lastUpdate}
          siteScope={filters.site}
          rfqiData={rfqiData}
          avgRssi={avgRssi}
          avgSnr={avgSnr}
          bandDistribution={bandDistribution}
          snrDistribution={snrDistribution}
          aiInsightsDetailPanel={aiInsightsDetailPanel}
          aiActiveHealthTab={aiActiveHealthTab}
          setAiActiveHealthTab={setAiActiveHealthTab}
          selectedNetworkEvent={selectedNetworkEvent}
          setSelectedNetworkEvent={setSelectedNetworkEvent}
          onCloseDetailPanel={() => setAiInsightsDetailPanel(false)}
          setSelectorTab={setSelectorTab}
        />
      )}

      {selectorTab === 'access-point' && selectedEntityId && (
        <EntityDetailView
          kind="access-point"
          entityId={selectedEntityId}
          entityName={selectedEntityName}
          onBack={() => {
            setOperationalMode('AI_INSIGHTS');
            setSelectedEntityId(null);
            setSelectedEntityName(null);
          }}
        />
      )}

      {selectorTab === 'client' && selectedEntityId && (
        <EntityDetailView
          kind="client"
          entityId={selectedEntityId}
          entityName={selectedEntityName}
          onBack={() => {
            setOperationalMode('AI_INSIGHTS');
            setSelectedEntityId(null);
            setSelectedEntityName(null);
          }}
        />
      )}

      {selectorTab === 'switch' && selectedEntityId && (
        <EntityDetailView
          kind="switch"
          entityId={selectedEntityId}
          entityName={selectedEntityName}
          onBack={() => {
            setOperationalMode('AI_INSIGHTS');
            setSelectedEntityId(null);
            setSelectedEntityName(null);
          }}
        />
      )}

      {(selectorTab === 'site' ||
        (selectorTab === 'access-point' && !selectedEntityId) ||
        (selectorTab === 'client' && !selectedEntityId) ||
        (selectorTab === 'switch' && !selectedEntityId)) && (
        <NetworkDashboardView
          showSection={showSection}
          selectorTab={selectorTab}
          selectedEntityId={selectedEntityId}
          selectedEntityName={selectedEntityName}
          apStats={apStats}
          clientStats={clientStats}
          alertCounts={alertCounts}
          throughputTrend={throughputTrend}
          performanceMetrics={performanceMetrics}
          radarData={radarData}
          clientDistribution={clientDistribution}
          colors={COLORS}
          onServiceClick={handleServiceClick}
          topClients={topClients}
          stations={stations}
          isTopClientsCollapsed={isTopClientsCollapsed}
          onToggleTopClientsCollapsed={() => setIsTopClientsCollapsed(!isTopClientsCollapsed)}
          vendorLookupsInProgress={vendorLookupsInProgress}
          setSelectedClient={setSelectedClient}
          setIsClientDialogOpen={setIsClientDialogOpen}
          poorServices={poorServices}
          notifications={notifications}
          activeSiteId={activeSiteId ?? null}
          venueDuration={
            filters.timeRange === '15m'
              ? '15M'
              : filters.timeRange === '1h'
                ? '1H'
                : filters.timeRange === '7d'
                  ? '7D'
                  : filters.timeRange === '30d'
                    ? '30D'
                    : '24H'
          }
        />
      )}

      <ClientDetailDialog
        isOpen={isClientDialogOpen}
        onClose={() => setIsClientDialogOpen(false)}
        selectedClient={selectedClient}
      />

      <ServiceClientsDialog
        isOpen={isServiceClientsDialogOpen}
        onClose={() => setIsServiceClientsDialogOpen(false)}
        selectedService={selectedService}
        clients={getClientsForService()}
        onSelectClient={(client) => {
          setSelectedClient(client);
          setIsServiceClientsDialogOpen(false);
          setIsClientDialogOpen(true);
        }}
      />
    </div>
  );
}

export const DashboardEnhanced = memo(DashboardEnhancedComponent);
