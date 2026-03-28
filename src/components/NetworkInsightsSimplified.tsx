import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { RefreshCw, TrendingUp, BarChart3, Wifi, Users, Radio, MapPin, Activity } from 'lucide-react';
import { UnifiedFilterBar } from './UnifiedFilterBar';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { fetchSimplifiedWidgetData, type SimplifiedWidgetData } from '../services/simplifiedWidgetService';
import {
  ClientCountWidget,
  APHealthWidget,
  NetworkOverviewWidget,
  SiteRankingsWidget,
  ClientDistributionWidget,
  APRankingsWidget,
  ManufacturerWidget
} from './widgets/SimplifiedWidgets';

// Keep existing legacy widgets
import { AnomalyDetector } from './AnomalyDetector';
import { RFQualityWidget } from './RFQualityWidget';
import { ApplicationAnalyticsEnhancedWidget } from './ApplicationAnalyticsEnhancedWidget';
import { ApplicationCategoriesWidget } from './ApplicationCategoriesWidget';
import { SmartRFWidget } from './SmartRFWidget';
import { VenueStatsWidget } from './VenueStatsWidget';

type CategoryTab = 'overview' | 'clients' | 'aps' | 'sites' | 'rf' | 'legacy';

const TABS: { id: CategoryTab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Network Overview', icon: BarChart3 },
  { id: 'clients', label: 'Clients & Devices', icon: Users },
  { id: 'aps', label: 'Access Points', icon: Wifi },
  { id: 'sites', label: 'Sites', icon: MapPin },
  { id: 'rf', label: 'RF Analytics', icon: Radio },
  { id: 'legacy', label: 'Advanced Analytics', icon: Activity }
];

/**
 * Simplified Network Insights Dashboard
 * Uses working endpoints (/v1/aps/query, /v1/stations, /v3/sites)
 * instead of the problematic /v1/report/sites endpoint
 */
export function NetworkInsightsSimplified() {
  const { filters } = useGlobalFilters();
  const [activeTab, setActiveTab] = useState<CategoryTab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [insightsSearch, setInsightsSearch] = useState('');
  const [widgetData, setWidgetData] = useState<SimplifiedWidgetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get site ID from filters
  const selectedSiteId = filters.site === 'all' ? undefined : filters.site;

  // Load widget data
  useEffect(() => {
    const loadWidgetData = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log('[NetworkInsights] Loading simplified widget data...', { selectedSiteId });
        const data = await fetchSimplifiedWidgetData(selectedSiteId);
        setWidgetData(data);
        setLastUpdate(new Date());
        console.log('[NetworkInsights] Successfully loaded widget data');
      } catch (err) {
        console.error('[NetworkInsights] Failed to load widget data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load widget data');
      } finally {
        setLoading(false);
      }
    };

    loadWidgetData();
  }, [selectedSiteId, refreshKey]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
      console.log('[NetworkInsights] Auto-refresh triggered');
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshKey(prev => prev + 1);

    setTimeout(() => {
      setRefreshing(false);
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            Network Insights
          </h2>
          <p className="text-muted-foreground mt-1">
            Real-time analytics from live network data
            {lastUpdate && (
              <span className="ml-2">• Last updated {lastUpdate.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          disabled={refreshing}
          size="default"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <UnifiedFilterBar
        searchPlaceholder="Search insights..."
        searchValue={insightsSearch}
        onSearchChange={setInsightsSearch}
        defaultContextTab="site"
        showTimeRange={false}
      />

      {/* Category Tabs */}
      <div className="border-b border-border">
        <div className="flex overflow-x-auto scrollbar-thin">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-sm text-destructive font-medium">Error loading data: {error}</p>
        </div>
      )}

      {/* Widget Content */}
      {loading && !widgetData ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading network data...</p>
          </div>
        </div>
      ) : widgetData ? (
        <div className="space-y-6">
          {renderTabContent(activeTab, widgetData, selectedSiteId, refreshKey)}
        </div>
      ) : null}
    </div>
  );
}

function renderTabContent(
  tab: CategoryTab,
  data: SimplifiedWidgetData,
  selectedSiteId: string | undefined,
  refreshKey: number
) {
  if (tab === 'legacy') {
    return renderLegacyWidgets(selectedSiteId, refreshKey);
  }

  if (tab === 'overview') {
    return renderOverviewTab(data);
  }

  if (tab === 'clients') {
    return renderClientsTab(data);
  }

  if (tab === 'aps') {
    return renderAPsTab(data);
  }

  if (tab === 'sites') {
    return renderSitesTab(data);
  }

  if (tab === 'rf') {
    return renderRFTab(data);
  }

  return <div className="text-center text-muted-foreground py-12">Loading {tab} widgets...</div>;
}

function renderOverviewTab(data: SimplifiedWidgetData) {
  return (
    <>
      {/* Top Row: Network Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <NetworkOverviewWidget data={data.networkOverview} />
        <APHealthWidget data={data.apHealth} />
        <ClientCountWidget data={data.clientCount} />
      </div>

      {/* Client Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ClientDistributionWidget
          data={data.clientDistribution.byBand}
          title="Clients by Frequency Band"
          type="band"
        />
        <ClientDistributionWidget
          data={data.clientDistribution.bySSID}
          title="Clients by SSID"
          type="ssid"
        />
      </div>

      {/* Top Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SiteRankingsWidget
          data={data.siteRankings.byClientCount}
          title="Top Sites by Client Count"
          metric="clients"
        />
        <SiteRankingsWidget
          data={data.siteRankings.byAPCount}
          title="Sites by AP Count"
          metric="APs"
        />
      </div>
    </>
  );
}

function renderClientsTab(data: SimplifiedWidgetData) {
  return (
    <>
      {/* Client Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ClientCountWidget data={data.clientCount} />
        <ClientDistributionWidget
          data={data.clientDistribution.byBand}
          title="Distribution by Band"
          type="band"
        />
        <ClientDistributionWidget
          data={data.clientDistribution.bySSID}
          title="Distribution by SSID"
          type="ssid"
        />
      </div>

      {/* Client Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ManufacturerWidget data={data.clientCount.byManufacturer} />
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Client Protocols</h3>
          <div className="space-y-2">
            {data.clientCount.byProtocol.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-3 bg-card border border-border rounded-lg">
                <span className="font-medium">{item.protocol}</span>
                <span className="text-2xl font-bold text-primary">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function renderAPsTab(data: SimplifiedWidgetData) {
  return (
    <>
      {/* AP Health Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <APHealthWidget data={data.apHealth} />
        <NetworkOverviewWidget data={data.networkOverview} />
      </div>

      {/* AP Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <APRankingsWidget
          data={data.apRankings.topByClientCount}
          title="Top APs by Client Count"
          metric="clients"
          icon={Users}
        />
        <APRankingsWidget
          data={data.apRankings.topBySignalStrength}
          title="Top APs by Signal Strength"
          metric="rssi"
          icon={Radio}
        />
      </div>
    </>
  );
}

function renderSitesTab(data: SimplifiedWidgetData) {
  return (
    <>
      {/* Site Overview */}
      <NetworkOverviewWidget data={data.networkOverview} />

      {/* Site Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SiteRankingsWidget
          data={data.siteRankings.byClientCount}
          title="Sites by Client Count"
          metric="clients"
        />
        <SiteRankingsWidget
          data={data.siteRankings.byAPCount}
          title="Sites by AP Count"
          metric="APs"
        />
      </div>
    </>
  );
}

function renderRFTab(data: SimplifiedWidgetData) {
  return (
    <>
      {/* RF Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <APHealthWidget data={data.apHealth} />
        <ClientDistributionWidget
          data={data.clientDistribution.byBand}
          title="Client Distribution by Frequency Band"
          type="band"
        />
      </div>

      {/* RF Quality Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <APRankingsWidget
          data={data.apRankings.topBySignalStrength}
          title="Best APs by Signal Quality"
          metric="rssi"
          icon={Radio}
        />
        <APRankingsWidget
          data={data.apRankings.topByClientCount}
          title="Most Active APs"
          metric="clients"
          icon={Users}
        />
      </div>
    </>
  );
}

function renderLegacyWidgets(selectedSiteId: string | undefined, refreshKey: number) {
  if (!selectedSiteId) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Please select a specific site to view advanced analytics
      </div>
    );
  }

  return (
    <>
      <AnomalyDetector key={`anomaly-${refreshKey}`} />
      <RFQualityWidget key={`rfqi-${refreshKey}`} siteId={selectedSiteId} duration="24H" />
      <ApplicationAnalyticsEnhancedWidget key={`apps-${refreshKey}`} siteId={selectedSiteId} duration="24H" />
      <ApplicationCategoriesWidget key={`categories-${refreshKey}`} siteId={selectedSiteId} duration="24H" />
      <SmartRFWidget key={`smartrf-${refreshKey}`} siteId={selectedSiteId} duration="24H" />
      <VenueStatsWidget key={`venue-${refreshKey}`} siteId={selectedSiteId} duration="24H" />
    </>
  );
}
