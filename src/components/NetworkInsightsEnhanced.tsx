import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { RefreshCw, TrendingUp, BarChart3, Wifi, Users, Radio, AppWindow, MapPin, Activity, User } from 'lucide-react';
import { FilterBar } from './FilterBar';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { apiService } from '../services/api';
import { fetchWidgetData, WIDGET_CATEGORIES } from '../services/widgetService';
import { TimeseriesWidget, RankingWidget, ScoreCardGrid, DistributionWidget, NetworkHealthWidget } from './widgets';

// Keep existing widgets for compatibility
import { AnomalyDetector } from './AnomalyDetector';
import { RFQualityWidget } from './RFQualityWidget';
import { ApplicationAnalyticsEnhancedWidget } from './ApplicationAnalyticsEnhancedWidget';
import { ApplicationCategoriesWidget } from './ApplicationCategoriesWidget';
import { SmartRFWidget } from './SmartRFWidget';
import { VenueStatsWidget } from './VenueStatsWidget';

type CategoryTab = 'overview' | 'throughput' | 'sites' | 'aps' | 'clients' | 'rf' | 'apps' | 'locations' | 'health' | 'users' | 'legacy';

const TABS: { id: CategoryTab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'throughput', label: 'Throughput & Usage', icon: TrendingUp },
  { id: 'sites', label: 'Sites', icon: MapPin },
  { id: 'aps', label: 'Access Points', icon: Wifi },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'rf', label: 'RF Analytics', icon: Radio },
  { id: 'apps', label: 'Applications', icon: AppWindow },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'users', label: 'Users', icon: User },
  { id: 'health', label: 'System Health', icon: Activity },
  { id: 'legacy', label: 'Legacy Widgets', icon: BarChart3 }
];

/**
 * Enhanced Network Insights Dashboard
 * Comprehensive analytics with 75+ widgets organized by category
 */
export function NetworkInsightsEnhanced() {
  const { filters } = useGlobalFilters();
  const [activeTab, setActiveTab] = useState<CategoryTab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [widgetData, setWidgetData] = useState<any>({});
  const [loading, setLoading] = useState(false);

  // Load sites
  useEffect(() => {
    const loadSites = async () => {
      try {
        const sitesData = await apiService.getSites();
        setSites(sitesData);

        if (filters.site === 'all' && sitesData.length > 0) {
          setSelectedSiteId(sitesData[0].id);
        } else if (filters.site !== 'all') {
          setSelectedSiteId(filters.site);
        }
      } catch (error) {
        console.error('[NetworkInsights] Failed to load sites:', error);
        setSelectedSiteId('c7395471-aa5c-46dc-9211-3ed24c5789bd');
      }
    };

    loadSites();
  }, [filters.site]);

  // Convert filter timeRange to API duration
  const getDuration = (timeRange: string): string => {
    const durationMap: Record<string, string> = {
      '15m': '15M',
      '1h': '1H',
      '3h': '3H',
      '24h': '24H',
      '7d': '7D',
      '30d': '30D'
    };
    return durationMap[timeRange] || '3H';
  };

  const duration = getDuration(filters.timeRange);

  // Load widget data for active tab
  useEffect(() => {
    if (!selectedSiteId || activeTab === 'legacy') return;

    const loadWidgetData = async () => {
      setLoading(true);
      try {
        const widgets = getWidgetsForTab(activeTab);

        const data = await fetchWidgetData({
          siteId: activeTab === 'overview' ? undefined : selectedSiteId,
          duration: duration,
          resolution: '15',
          widgets: widgets
        });

        setWidgetData(data);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('[NetworkInsights] Failed to load widget data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWidgetData();
  }, [selectedSiteId, activeTab, duration, refreshKey]);

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

  const getWidgetsForTab = (tab: CategoryTab): string[] => {
    switch (tab) {
      case 'overview':
        return WIDGET_CATEGORIES.OVERVIEW.widgets;
      case 'throughput':
        return WIDGET_CATEGORIES.THROUGHPUT_USAGE.widgets;
      case 'sites':
        return WIDGET_CATEGORIES.SITES.widgets;
      case 'aps':
        return WIDGET_CATEGORIES.ACCESS_POINTS.widgets;
      case 'clients':
        return WIDGET_CATEGORIES.CLIENTS.widgets;
      case 'rf':
        return WIDGET_CATEGORIES.RF_ANALYTICS.widgets;
      case 'apps':
        return WIDGET_CATEGORIES.APPLICATIONS.widgets;
      case 'locations':
        return WIDGET_CATEGORIES.LOCATIONS.widgets;
      case 'users':
        return ['topUsersByThroughput', 'worstUsersByThroughput', 'topClientsByUsage'];
      case 'health':
        return WIDGET_CATEGORIES.HEALTH.widgets;
      default:
        return [];
    }
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
            Comprehensive analytics with 75+ widgets • 100% feature parity with the controller
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
      <FilterBar showSiteFilter={true} showTimeRangeFilter={true} />

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

      {/* Widget Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading widgets...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {renderTabContent(activeTab, widgetData, selectedSiteId, duration, refreshKey)}
        </div>
      )}
    </div>
  );
}

function renderTabContent(
  tab: CategoryTab,
  widgetData: any,
  selectedSiteId: string | null,
  duration: string,
  refreshKey: number
) {
  if (tab === 'legacy') {
    return renderLegacyWidgets(selectedSiteId, duration, refreshKey);
  }

  if (tab === 'overview') {
    return renderOverviewTab(widgetData);
  }

  if (tab === 'throughput') {
    return renderThroughputTab(widgetData);
  }

  if (tab === 'sites') {
    return renderSitesTab(widgetData);
  }

  if (tab === 'aps') {
    return renderAPsTab(widgetData);
  }

  if (tab === 'clients') {
    return renderClientsTab(widgetData);
  }

  if (tab === 'rf') {
    return renderRFTab(widgetData);
  }

  if (tab === 'apps') {
    return renderAppsTab(widgetData);
  }

  if (tab === 'locations') {
    return renderLocationsTab(widgetData);
  }

  if (tab === 'users') {
    return renderUsersTab(widgetData);
  }

  if (tab === 'health') {
    return renderHealthTab(widgetData);
  }

  return <div className="text-center text-muted-foreground py-12">Loading {tab} widgets...</div>;
}

function renderOverviewTab(data: any) {
  return (
    <>
      {/* Network Health */}
      {data.networkHealth && (
        <NetworkHealthWidget data={data.networkHealth} />
      )}

      {/* Throughput & Clients Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Throughput Timeseries */}
        {data.throughputReport && data.throughputReport.length > 0 && (
          <TimeseriesWidget
            title="Network Throughput"
            statistics={data.throughputReport[0].statistics || []}
            showLegend={true}
            fillArea={true}
          />
        )}

        {/* Unique Clients */}
        {data.countOfUniqueUsersReport && data.countOfUniqueUsersReport.length > 0 && (
          <TimeseriesWidget
            title="Unique Client Count"
            statistics={data.countOfUniqueUsersReport[0].statistics || []}
            showLegend={false}
            fillArea={true}
          />
        )}
      </div>

      {/* System Health Scorecard */}
      {data.systemHealth && (
        <ScoreCardGrid
          cards={[
            {
              title: 'System Health',
              value: data.systemHealth.overallHealth || 'N/A',
              status: 'good'
            }
          ]}
          columns={4}
        />
      )}
    </>
  );
}

function renderThroughputTab(data: any) {
  return (
    <>
      {/* Main Throughput Chart */}
      {data.throughputReport && data.throughputReport.length > 0 && (
        <TimeseriesWidget
          title="Throughput Over Time (Upload / Download / Total)"
          statistics={data.throughputReport[0]?.statistics || []}
          showLegend={true}
          fillArea={true}
          height={400}
        />
      )}

      {/* Byte Utilization */}
      {data.byteUtilization && data.byteUtilization.length > 0 && (
        <TimeseriesWidget
          title="Byte Utilization"
          statistics={data.byteUtilization[0]?.statistics || []}
          height={300}
        />
      )}

      {/* UL/DL Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.ulThroughputPeakScorecard && (
          <ScoreCardGrid
            cards={[
              {
                title: 'Upload Peak Throughput',
                value: data.ulThroughputPeakScorecard.peak || 0,
                unit: 'bps',
                status: 'good'
              }
            ]}
            columns={1}
          />
        )}
        {data.dlThroughputPeakScorecard && (
          <ScoreCardGrid
            cards={[
              {
                title: 'Download Peak Throughput',
                value: data.dlThroughputPeakScorecard.peak || 0,
                unit: 'bps',
                status: 'good'
              }
            ]}
            columns={1}
          />
        )}
        {data.ulUsageScorecard && (
          <ScoreCardGrid
            cards={[
              {
                title: 'Total Upload Usage',
                value: data.ulUsageScorecard.total || 0,
                unit: 'bytes',
                status: 'neutral'
              }
            ]}
            columns={1}
          />
        )}
        {data.dlUsageScorecard && (
          <ScoreCardGrid
            cards={[
              {
                title: 'Total Download Usage',
                value: data.dlUsageScorecard.total || 0,
                unit: 'bytes',
                status: 'neutral'
              }
            ]}
            columns={1}
          />
        )}
      </div>
    </>
  );
}

function renderSitesTab(data: any) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.topSitesByThroughput && (
          <RankingWidget
            title="Top Sites by Throughput"
            items={parseRankingData(data.topSitesByThroughput)}
            type="top"
            unit="bps"
            maxItems={10}
          />
        )}
        {data.topSitesByClientCount && (
          <RankingWidget
            title="Top Sites by Client Count"
            items={parseRankingData(data.topSitesByClientCount)}
            type="top"
            unit="clients"
            maxItems={10}
          />
        )}
        {data.topSitesByChannelUtil && (
          <RankingWidget
            title="Top Sites by Channel Utilization (2.4GHz)"
            items={parseRankingData(data.topSitesByChannelUtil)}
            type="top"
            unit="%"
            maxItems={10}
          />
        )}
        {data.topSitesBySnr && (
          <RankingWidget
            title="Top Sites by SNR"
            items={parseRankingData(data.topSitesBySnr)}
            type="top"
            unit="dB"
            maxItems={10}
          />
        )}
        {data.topSitesByChannelChanges && (
          <RankingWidget
            title="Sites with Most Channel Changes"
            items={parseRankingData(data.topSitesByChannelChanges)}
            type="worst"
            unit="changes"
            maxItems={10}
          />
        )}
        {data.topSitesByPowerChanges && (
          <RankingWidget
            title="Sites with Most Power Changes"
            items={parseRankingData(data.topSitesByPowerChanges)}
            type="worst"
            unit="changes"
            maxItems={10}
          />
        )}
      </div>
    </>
  );
}

function renderAPsTab(data: any) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top AP Rankings */}
        {data.topAccessPointsByThroughput && (
          <RankingWidget
            title="Top APs by Throughput"
            items={parseRankingData(data.topAccessPointsByThroughput)}
            type="top"
            unit="bps"
            maxItems={15}
          />
        )}
        {data.topAccessPointsByUserCount && (
          <RankingWidget
            title="Top APs by User Count"
            items={parseRankingData(data.topAccessPointsByUserCount)}
            type="top"
            unit="users"
            maxItems={15}
          />
        )}
        {data.topAccessPointsByConcurrentUserCount && (
          <RankingWidget
            title="Top APs by Concurrent Users"
            items={parseRankingData(data.topAccessPointsByConcurrentUserCount)}
            type="top"
            unit="users"
            maxItems={15}
          />
        )}
        {data.topAccessPointsByRfHealth && (
          <RankingWidget
            title="Top APs by RF Health"
            items={parseRankingData(data.topAccessPointsByRfHealth)}
            type="top"
            unit="score"
            maxItems={15}
          />
        )}

        {/* Channel Utilization */}
        {data.topApsByChannelUtil && (
          <RankingWidget
            title="Top APs by Channel Utilization"
            items={parseRankingData(data.topApsByChannelUtil)}
            type="top"
            unit="%"
            maxItems={15}
          />
        )}
        {data.worstApsByChannelUtil && (
          <RankingWidget
            title="Worst APs by Channel Utilization"
            items={parseRankingData(data.worstApsByChannelUtil)}
            type="worst"
            unit="%"
            maxItems={15}
          />
        )}

        {/* SNR */}
        {data.topApsBySnr && (
          <RankingWidget
            title="Top APs by SNR"
            items={parseRankingData(data.topApsBySnr)}
            type="top"
            unit="dB"
            maxItems={15}
          />
        )}
        {data.worstApsBySnr && (
          <RankingWidget
            title="Worst APs by SNR"
            items={parseRankingData(data.worstApsBySnr)}
            type="worst"
            unit="dB"
            maxItems={15}
          />
        )}

        {/* Retries */}
        {data.topApsByRetries && (
          <RankingWidget
            title="Top APs by Retry Rate"
            items={parseRankingData(data.topApsByRetries)}
            type="worst"
            unit="%"
            maxItems={15}
          />
        )}
        {data.worstApsByRetries && (
          <RankingWidget
            title="Worst APs by Retry Rate"
            items={parseRankingData(data.worstApsByRetries)}
            type="worst"
            unit="%"
            maxItems={15}
          />
        )}

        {/* Changes */}
        {data.topApsByChannelChanges && (
          <RankingWidget
            title="APs with Most Channel Changes"
            items={parseRankingData(data.topApsByChannelChanges)}
            type="worst"
            unit="changes"
            maxItems={15}
          />
        )}
        {data.topApsByPowerChanges && (
          <RankingWidget
            title="APs with Most Power Changes"
            items={parseRankingData(data.topApsByPowerChanges)}
            type="worst"
            unit="changes"
            maxItems={15}
          />
        )}

        {/* RF Health */}
        {data.worstApsByRfHealth && (
          <RankingWidget
            title="Worst APs by RF Health"
            items={parseRankingData(data.worstApsByRfHealth)}
            type="worst"
            unit="score"
            maxItems={15}
          />
        )}
      </div>
    </>
  );
}

function renderClientsTab(data: any) {
  return (
    <>
      {/* Client Distribution */}
      {data.clientDistributionByRFProtocol && (
        <DistributionWidget
          title="Client Distribution by RF Protocol (WiFi 4/5/6/6E)"
          items={parseDistributionData(data.clientDistributionByRFProtocol)}
          type="doughnut"
          height={350}
        />
      )}

      {/* Manufacturers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.topManufacturersByClientCount && (
          <RankingWidget
            title="Top Device Manufacturers"
            items={parseRankingData(data.topManufacturersByClientCount)}
            type="top"
            unit="clients"
            maxItems={15}
          />
        )}
        {data.worstManufacturersByClientCount && (
          <RankingWidget
            title="Bottom Device Manufacturers"
            items={parseRankingData(data.worstManufacturersByClientCount)}
            type="worst"
            unit="clients"
            maxItems={15}
          />
        )}

        {/* Operating Systems */}
        {data.topOsByClientCountReport && (
          <RankingWidget
            title="Top Operating Systems"
            items={parseRankingData(data.topOsByClientCountReport)}
            type="top"
            unit="clients"
            maxItems={15}
          />
        )}
        {data.worstOsByClientCountReport && (
          <RankingWidget
            title="Bottom Operating Systems"
            items={parseRankingData(data.worstOsByClientCountReport)}
            type="worst"
            unit="clients"
            maxItems={15}
          />
        )}

        {/* Client Usage */}
        {data.topClientsByUsage && (
          <RankingWidget
            title="Top Clients by Data Usage"
            items={parseRankingData(data.topClientsByUsage)}
            type="top"
            unit="bytes"
            maxItems={15}
          />
        )}

        {/* Client Retries */}
        {data.topClientsByRetries && (
          <RankingWidget
            title="Top Clients by Retry Rate"
            items={parseRankingData(data.topClientsByRetries)}
            type="worst"
            unit="%"
            maxItems={15}
          />
        )}
        {data.worstClientsByRetries && (
          <RankingWidget
            title="Worst Clients by Retry Rate"
            items={parseRankingData(data.worstClientsByRetries)}
            type="worst"
            unit="%"
            maxItems={15}
          />
        )}

        {/* Client SNR */}
        {data.topClientsBySnr && (
          <RankingWidget
            title="Top Clients by Signal Quality (SNR)"
            items={parseRankingData(data.topClientsBySnr)}
            type="top"
            unit="dB"
            maxItems={15}
          />
        )}
        {data.worstClientsBySnr && (
          <RankingWidget
            title="Worst Clients by Signal Quality (SNR)"
            items={parseRankingData(data.worstClientsBySnr)}
            type="worst"
            unit="dB"
            maxItems={15}
          />
        )}
      </div>

      {/* Client Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.uniqueClientsPeakScorecard && (
          <ScoreCardGrid
            cards={[
              {
                title: 'Peak Concurrent Clients',
                value: data.uniqueClientsPeakScorecard.peak || 0,
                status: 'good'
              }
            ]}
            columns={1}
          />
        )}
        {data.uniqueClientsTotalScorecard && (
          <ScoreCardGrid
            cards={[
              {
                title: 'Total Unique Clients',
                value: data.uniqueClientsTotalScorecard.total || 0,
                status: 'neutral'
              }
            ]}
            columns={1}
          />
        )}
      </div>
    </>
  );
}

function renderRFTab(data: any) {
  return (
    <>
      {/* RF Quality Overview */}
      {data.rfQuality && data.rfQuality.length > 0 && (
        <TimeseriesWidget
          title="RF Quality Index"
          statistics={data.rfQuality[0]?.statistics || []}
          height={300}
        />
      )}

      {/* Channel Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {data.channelDistributionRadio1 && (
          <DistributionWidget
            title="2.4 GHz Channel Distribution"
            items={parseDistributionData(data.channelDistributionRadio1)}
            type="bar"
            height={300}
          />
        )}
        {data.channelDistributionRadio2 && (
          <DistributionWidget
            title="5 GHz Channel Distribution"
            items={parseDistributionData(data.channelDistributionRadio2)}
            type="bar"
            height={300}
          />
        )}
        {data.channelDistributionRadio3 && (
          <DistributionWidget
            title="6 GHz Channel Distribution"
            items={parseDistributionData(data.channelDistributionRadio3)}
            type="bar"
            height={300}
          />
        )}
      </div>

      {/* RF Changes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.topApsByChannelChanges && (
          <RankingWidget
            title="APs with Most Channel Changes (RRM)"
            items={parseRankingData(data.topApsByChannelChanges)}
            type="worst"
            unit="changes"
            maxItems={15}
          />
        )}
        {data.topApsByPowerChanges && (
          <RankingWidget
            title="APs with Most Power Changes (RRM)"
            items={parseRankingData(data.topApsByPowerChanges)}
            type="worst"
            unit="changes"
            maxItems={15}
          />
        )}
      </div>
    </>
  );
}

function renderAppsTab(data: any) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top App Groups */}
        {data.topAppGroupsByUsage && (
          <RankingWidget
            title="Top App Groups by Data Usage"
            items={parseRankingData(data.topAppGroupsByUsage)}
            type="top"
            unit="bytes"
            maxItems={15}
          />
        )}
        {data.topAppGroupsByClientCountReport && (
          <RankingWidget
            title="Top App Groups by Client Count"
            items={parseRankingData(data.topAppGroupsByClientCountReport)}
            type="top"
            unit="clients"
            maxItems={15}
          />
        )}
        {data.topAppGroupsByThroughputReport && (
          <RankingWidget
            title="Top App Groups by Throughput"
            items={parseRankingData(data.topAppGroupsByThroughputReport)}
            type="top"
            unit="bps"
            maxItems={15}
          />
        )}

        {/* Worst App Groups */}
        {data.worstAppGroupsByUsage && (
          <RankingWidget
            title="Bottom App Groups by Usage"
            items={parseRankingData(data.worstAppGroupsByUsage)}
            type="worst"
            unit="bytes"
            maxItems={15}
          />
        )}
        {data.worstAppGroupsByClientCountReport && (
          <RankingWidget
            title="Bottom App Groups by Client Count"
            items={parseRankingData(data.worstAppGroupsByClientCountReport)}
            type="worst"
            unit="clients"
            maxItems={15}
          />
        )}
        {data.worstAppGroupsByThroughputReport && (
          <RankingWidget
            title="Bottom App Groups by Throughput"
            items={parseRankingData(data.worstAppGroupsByThroughputReport)}
            type="worst"
            unit="bps"
            maxItems={15}
          />
        )}

        {/* Services */}
        {data.topServicesByThroughput && (
          <RankingWidget
            title="Top Services by Throughput"
            items={parseRankingData(data.topServicesByThroughput)}
            type="top"
            unit="bps"
            maxItems={15}
          />
        )}
        {data.topServicesByClientCount && (
          <RankingWidget
            title="Top Services by Client Count"
            items={parseRankingData(data.topServicesByClientCount)}
            type="top"
            unit="clients"
            maxItems={15}
          />
        )}
        {data.worstServicesByClientCount && (
          <RankingWidget
            title="Bottom Services by Client Count"
            items={parseRankingData(data.worstServicesByClientCount)}
            type="worst"
            unit="clients"
            maxItems={15}
          />
        )}
      </div>
    </>
  );
}

function renderLocationsTab(data: any) {
  return (
    <>
      {/* Dwell Time */}
      {data.dwellTimeReport && data.dwellTimeReport.length > 0 && (
        <TimeseriesWidget
          title="Client Dwell Time"
          statistics={data.dwellTimeReport[0]?.statistics || []}
          height={300}
        />
      )}

      {/* Guest Users */}
      {data.guestUsersReport && data.guestUsersReport.length > 0 && (
        <TimeseriesWidget
          title="Guest User Activity"
          statistics={data.guestUsersReport[0]?.statistics || []}
          height={300}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Areas */}
        {data.topAreaByVisitors && (
          <RankingWidget
            title="Top Areas by Visitor Count"
            items={parseRankingData(data.topAreaByVisitors)}
            type="top"
            unit="visitors"
            maxItems={15}
          />
        )}
        {data.worstAreaByVisitors && (
          <RankingWidget
            title="Bottom Areas by Visitor Count"
            items={parseRankingData(data.worstAreaByVisitors)}
            type="worst"
            unit="visitors"
            maxItems={15}
          />
        )}

        {/* Floors */}
        {data.topFloorByVisitors && (
          <RankingWidget
            title="Top Floors by Visitor Count"
            items={parseRankingData(data.topFloorByVisitors)}
            type="top"
            unit="visitors"
            maxItems={15}
          />
        )}
        {data.worstFloorByVisitors && (
          <RankingWidget
            title="Bottom Floors by Visitor Count"
            items={parseRankingData(data.worstFloorByVisitors)}
            type="worst"
            unit="visitors"
            maxItems={15}
          />
        )}
      </div>
    </>
  );
}

function renderUsersTab(data: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {data.topUsersByThroughput && (
        <RankingWidget
          title="Top Users by Throughput"
          items={parseRankingData(data.topUsersByThroughput)}
          type="top"
          unit="bps"
          maxItems={20}
        />
      )}
      {data.worstUsersByThroughput && (
        <RankingWidget
          title="Bottom Users by Throughput"
          items={parseRankingData(data.worstUsersByThroughput)}
          type="worst"
          unit="bps"
          maxItems={20}
        />
      )}
      {data.topClientsByUsage && (
        <RankingWidget
          title="Top Clients by Data Usage"
          items={parseRankingData(data.topClientsByUsage)}
          type="top"
          unit="bytes"
          maxItems={20}
        />
      )}
    </div>
  );
}

function renderHealthTab(data: any) {
  return (
    <>
      {/* Network Health */}
      {data.networkHealth && (
        <NetworkHealthWidget title="Network Health Overview" data={data.networkHealth} />
      )}

      {/* QoE Metrics */}
      {data.deploymentQoE && data.deploymentQoE.length > 0 && (
        <TimeseriesWidget
          title="Deployment Quality of Experience (QoE)"
          statistics={data.deploymentQoE[0]?.statistics || []}
          height={300}
        />
      )}

      {/* Congestion Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.dataPortCongestionEvent && data.dataPortCongestionEvent.length > 0 && (
          <TimeseriesWidget
            title="Data Port Congestion Events"
            statistics={data.dataPortCongestionEvent[0]?.statistics || []}
            height={250}
          />
        )}
        {data.dataPortCongestionDuration && data.dataPortCongestionDuration.length > 0 && (
          <TimeseriesWidget
            title="Data Port Congestion Duration"
            statistics={data.dataPortCongestionDuration[0]?.statistics || []}
            height={250}
          />
        )}
      </div>

      {/* Polling Stats */}
      {data.pollSitesStats && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 text-foreground">Site Polling Statistics</h3>
          <pre className="text-xs text-muted-foreground overflow-auto">
            {JSON.stringify(data.pollSitesStats, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}

function renderLegacyWidgets(selectedSiteId: string | null, duration: string, refreshKey: number) {
  if (!selectedSiteId) return null;

  return (
    <>
      <AnomalyDetector key={`anomaly-${refreshKey}`} />
      <RFQualityWidget key={`rfqi-${refreshKey}`} siteId={selectedSiteId} duration={duration} />
      <ApplicationAnalyticsEnhancedWidget key={`apps-${refreshKey}`} siteId={selectedSiteId} duration={duration} />
      <ApplicationCategoriesWidget key={`categories-${refreshKey}`} siteId={selectedSiteId} duration={duration} />
      <SmartRFWidget key={`smartrf-${refreshKey}`} siteId={selectedSiteId} duration={duration} />
      <VenueStatsWidget key={`venue-${refreshKey}`} siteId={selectedSiteId} duration={duration} />
    </>
  );
}

// Helper functions
function parseRankingData(widgetData: any): any[] {
  if (!widgetData || !Array.isArray(widgetData)) return [];

  const report = widgetData[0];
  if (!report || !report.statistics) return [];

  return report.statistics.map((stat: any) => ({
    name: stat.statName || stat.label || 'Unknown',
    value: parseFloat(stat.value || stat.count || 0)
  }));
}

function parseDistributionData(widgetData: any): any[] {
  return parseRankingData(widgetData);
}
