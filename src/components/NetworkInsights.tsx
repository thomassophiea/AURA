import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { AnomalyDetector } from './AnomalyDetector';
import { RFQualityWidget } from './RFQualityWidget';
import { ApplicationAnalyticsEnhancedWidget } from './ApplicationAnalyticsEnhancedWidget';
import { ApplicationCategoriesWidget } from './ApplicationCategoriesWidget';
import { SmartRFWidget } from './SmartRFWidget';
import { VenueStatsWidget } from './VenueStatsWidget';
import { FilterBar } from './FilterBar';
import { useGlobalFilters } from '../hooks/useGlobalFilters';
import { apiService } from '../services/api';

/**
 * Network Insights Dashboard
 *
 * Auto-loads on page render with 30-second background refresh.
 * Supports site and time range filtering via global FilterBar.
 * Displays advanced analytics and insights about network performance:
 * - Anomaly Detection (What Changed?)
 * - RF Quality Index (RFQI)
 * - Application Analytics
 * - Application Categories
 * - Smart RF (RRM)
 * - Venue Statistics
 */
export function NetworkInsights() {
  const { filters } = useGlobalFilters();
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [sites, setSites] = useState<any[]>([]);

  // Load sites and determine selected site ID
  useEffect(() => {
    const loadSites = async () => {
      try {
        const sitesData = await apiService.getSites();
        setSites(sitesData);

        // Determine which site to use
        if (filters.site === 'all' && sitesData.length > 0) {
          // Use first site if "All Sites" is selected
          setSelectedSiteId(sitesData[0].id);
        } else if (filters.site !== 'all') {
          // Use the selected site ID
          setSelectedSiteId(filters.site);
        }
      } catch (error) {
        console.error('[NetworkInsights] Failed to load sites:', error);
        // Fallback to hardcoded site ID
        setSelectedSiteId('c7395471-aa5c-46dc-9211-3ed24c5789bd');
      }
    };

    loadSites();
  }, [filters.site]);

  // Convert filter timeRange to API duration format
  const getDuration = (timeRange: string): string => {
    const durationMap: Record<string, string> = {
      '15m': '15M',
      '1h': '1H',
      '24h': '24H',
      '7d': '7D',
      '30d': '30D'
    };
    return durationMap[timeRange] || '24H';
  };

  const duration = getDuration(filters.timeRange);

  // Auto-load on page render and background refresh every 30 seconds
  useEffect(() => {
    // Initial load
    setLastUpdate(new Date());

    // Background refresh every 30 seconds
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
      setLastUpdate(new Date());
      console.log('[NetworkInsights] Auto-refresh triggered (30s interval)');
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Manual refresh for troubleshooting
  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setLastUpdate(new Date());

    setTimeout(() => {
      setRefreshing(false);
    }, 500);
  };

  // Don't render widgets until we have a site ID
  if (!selectedSiteId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <TrendingUp className="h-8 w-8 text-primary" />
              Network Insights
            </h2>
            <p className="text-muted-foreground mt-1">
              Advanced analytics, anomaly detection, and performance insights
            </p>
          </div>
        </div>
        <FilterBar showSiteFilter={true} showTimeRangeFilter={true} />
        <div className="text-center py-12 text-muted-foreground">
          Loading site information...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            Advanced Analytics Dashboard
          </h2>
          <p className="text-muted-foreground mt-1">
            Anomaly detection, performance insights, and trend analysis
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
          Refresh All
        </Button>
      </div>

      {/* Filter Bar */}
      <FilterBar showSiteFilter={true} showTimeRangeFilter={true} />

      {/* Anomaly Detector - What Changed? */}
      <div className="widget-container">
        <AnomalyDetector key={`anomaly-${refreshKey}`} />
      </div>

      {/* RF Quality Index (RFQI) */}
      <div className="widget-container">
        <RFQualityWidget
          key={`rfqi-${refreshKey}-${selectedSiteId}-${duration}`}
          siteId={selectedSiteId}
          duration={duration}
        />
      </div>

      {/* Application Analytics */}
      <div className="widget-container">
        <ApplicationAnalyticsEnhancedWidget
          key={`apps-${refreshKey}-${selectedSiteId}-${duration}`}
          siteId={selectedSiteId}
          duration={duration}
        />
      </div>

      {/* Application Categories */}
      <div className="widget-container">
        <ApplicationCategoriesWidget
          key={`categories-${refreshKey}-${selectedSiteId}-${duration}`}
          siteId={selectedSiteId}
          duration={duration}
        />
      </div>

      {/* Site RRM (Radio Resource Management) */}
      <div className="widget-container">
        <SmartRFWidget
          key={`smartrf-${refreshKey}-${selectedSiteId}-${duration}`}
          siteId={selectedSiteId}
          duration={duration}
        />
      </div>

      {/* Venue Statistics */}
      <div className="widget-container">
        <VenueStatsWidget
          key={`venue-${refreshKey}-${selectedSiteId}-${duration}`}
          siteId={selectedSiteId}
          duration={duration}
        />
      </div>

      {/* Info Footer */}
      <div className="mt-8 p-4 bg-muted/20 rounded-lg border border-muted">
        <p className="text-sm text-muted-foreground">
          <strong>Network Insights</strong> provides advanced analytics powered by the Campus Controller.
          Use the site and time range filters to view data for specific locations and time periods.
          Data updates automatically every 5 minutes per widget. Use the "Refresh All" button to manually update all widgets.
        </p>
      </div>
    </div>
  );
}
