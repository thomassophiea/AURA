import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { AnomalyDetector } from './AnomalyDetector';
import { RFQualityWidget } from './RFQualityWidget';
import { ApplicationAnalyticsEnhancedWidget } from './ApplicationAnalyticsEnhancedWidget';
import { ApplicationCategoriesWidget } from './ApplicationCategoriesWidget';
import { SmartRFWidget } from './SmartRFWidget';
import { VenueStatsWidget } from './VenueStatsWidget';

/**
 * Network Insights Dashboard
 *
 * Auto-loads on page render with 30-second background refresh.
 * Displays advanced analytics and insights about network performance:
 * - Anomaly Detection (What Changed?)
 * - RF Quality Index (RFQI)
 * - Application Analytics
 */
export function NetworkInsights() {
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
            Advanced analytics, anomaly detection, and performance insights
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

      {/* Anomaly Detector - What Changed? */}
      <div className="widget-container">
        <AnomalyDetector key={`anomaly-${refreshKey}`} />
      </div>

      {/* RF Quality Index (RFQI) */}
      <div className="widget-container">
        <RFQualityWidget
          key={`rfqi-${refreshKey}`}
          siteId="c7395471-aa5c-46dc-9211-3ed24c5789bd"
          duration="24H"
        />
      </div>

      {/* Application Analytics */}
      <div className="widget-container">
        <ApplicationAnalyticsEnhancedWidget
          key={`apps-${refreshKey}`}
          siteId="c7395471-aa5c-46dc-9211-3ed24c5789bd"
          duration="24H"
        />
      </div>

      {/* Application Categories */}
      <div className="widget-container">
        <ApplicationCategoriesWidget
          key={`categories-${refreshKey}`}
          siteId="c7395471-aa5c-46dc-9211-3ed24c5789bd"
          duration="24H"
        />
      </div>

      {/* Site RRM (Radio Resource Management) */}
      <div className="widget-container">
        <SmartRFWidget
          key={`smartrf-${refreshKey}`}
          siteId="c7395471-aa5c-46dc-9211-3ed24c5789bd"
          duration="24H"
        />
      </div>

      {/* Venue Statistics */}
      <div className="widget-container">
        <VenueStatsWidget
          key={`venue-${refreshKey}`}
          siteId="c7395471-aa5c-46dc-9211-3ed24c5789bd"
          duration="24H"
        />
      </div>

      {/* Info Footer */}
      <div className="mt-8 p-4 bg-muted/20 rounded-lg border border-muted">
        <p className="text-sm text-muted-foreground">
          <strong>Network Insights</strong> provides advanced analytics powered by the Campus Controller.
          Data updates automatically every 5 minutes per widget. Use the "Refresh All" button to manually update all widgets.
        </p>
      </div>
    </div>
  );
}
