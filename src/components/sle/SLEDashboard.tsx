/**
 * SLE Dashboard - Mist-style Service Level Expectations page
 * Shows wireless SLE blocks with success rates, timelines, and classifier drill-down
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { ScrollArea, ScrollBar } from '../ui/scroll-area';
import { RefreshCw, Building, Clock, Target, Wifi, Cable } from 'lucide-react';
import { apiService, Site } from '../../services/api';
import { useGlobalFilters } from '../../hooks/useGlobalFilters';
import { sleDataCollectionService } from '../../services/sleDataCollection';
import { computeAllWirelessSLEs } from '../../services/sleCalculationEngine';
import { SLEBlock } from './SLEBlock';
import { SLE_STATUS_COLORS } from '../../types/sle';
import type { SLEMetric } from '../../types/sle';
import { toast } from 'sonner';

export function SLEDashboard() {
  const { filters, updateFilter } = useGlobalFilters();

  const [wirelessSLEs, setWirelessSLEs] = useState<SLEMetric[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [aps, setAps] = useState<any[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedSite, setSelectedSite] = useState(filters.site || 'all');
  const [activeTab, setActiveTab] = useState('wireless');

  // Load sites for filter
  useEffect(() => {
    apiService.getSites().then(setSites).catch(() => {});
  }, []);

  // Sync site filter to global filters
  useEffect(() => {
    if (selectedSite !== filters.site) {
      updateFilter('site', selectedSite);
    }
  }, [selectedSite]);

  // Load data
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const siteFilter = selectedSite !== 'all' ? selectedSite : undefined;

      // Fetch stations and APs in parallel
      const [stationsData, apsData] = await Promise.all([
        siteFilter
          ? apiService.makeAuthenticatedRequest(`/v3/sites/${siteFilter}/stations`, { method: 'GET' }, 15000)
              .then(r => r.ok ? r.json() : null)
              .then(d => d ? (Array.isArray(d) ? d : (d.stations || d.clients || d.data || [])) : [])
              .catch(() => apiService.getStations().then(all => {
                // Client-side filter fallback
                return apiService.getSiteById(siteFilter).then(site => {
                  const name = site?.name || site?.siteName || siteFilter;
                  return all.filter((s: any) => s.siteName === name || s.siteId === siteFilter || s.siteName === siteFilter);
                });
              }).catch(() => []))
          : apiService.getStations(),
        siteFilter
          ? apiService.getAccessPointsBySite(siteFilter)
          : apiService.getAccessPoints(),
      ]);

      const stationsArr = Array.isArray(stationsData) ? stationsData : [];
      const apsArr = Array.isArray(apsData) ? apsData : [];

      setStations(stationsArr);
      setAps(apsArr);

      // Get historical data from SLE collection service
      const timeRangeMs = timeRange === '1h' ? 3600000 : timeRange === '7d' ? 604800000 : 86400000;
      const historicalData = sleDataCollectionService.getFilteredData({
        siteId: selectedSite,
        scope: 'wireless',
        startTimestamp: Date.now() - timeRangeMs,
      });

      // Compute all SLEs
      const sles = computeAllWirelessSLEs(stationsArr, apsArr, historicalData);
      setWirelessSLEs(sles);
      setLastUpdate(new Date());

      if (isRefresh) toast.success('SLE data refreshed');
    } catch (error) {
      console.error('[SLE Dashboard] Error loading data:', error);
      toast.error('Failed to load SLE data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSite, timeRange]);

  // Initial load + auto-refresh
  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Ensure SLE collection is running
  useEffect(() => {
    if (!sleDataCollectionService.isCollectionActive()) {
      sleDataCollectionService.startCollection();
    }
  }, []);

  // Overall score (average of all SLEs)
  const overallScore = wirelessSLEs.length > 0
    ? wirelessSLEs.reduce((sum, s) => sum + s.successRate, 0) / wirelessSLEs.length
    : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl tracking-tight">Service Levels</h2>
          <div className="h-10 w-32 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-32 bg-muted/50 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl tracking-tight">Service Levels</h2>
          <p className="text-muted-foreground text-sm">
            SLE metrics with drill-down classifier analysis
            {lastUpdate && <span className="ml-2">- Updated {lastUpdate.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-48">
              <Building className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Select Site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map(site => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name || site.siteName || site.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-36">
              <Clock className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => loadData(true)} variant="outline" disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex items-center gap-2 pb-2">
          {/* Overall score */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 flex-shrink-0">
            <Target className="h-4 w-4 text-purple-400" />
            <span className="text-xs font-medium">Overall</span>
            <span className="text-sm font-bold" style={{ color: SLE_STATUS_COLORS[overallScore >= 95 ? 'good' : overallScore >= 80 ? 'warn' : 'poor'].hex }}>
              {overallScore.toFixed(1)}%
            </span>
          </div>

          {/* Per-SLE pills */}
          {wirelessSLEs.map(sle => (
            <div
              key={sle.id}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/20 border border-border/30 hover:border-border/60 cursor-default transition-colors flex-shrink-0"
            >
              <span className="text-xs text-muted-foreground">{sle.name}</span>
              <span className="text-xs font-bold" style={{ color: SLE_STATUS_COLORS[sle.status].hex }}>
                {sle.successRate.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Tabs: Wireless / Wired */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="wireless" className="flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5" />
            Wireless
            <Badge variant="secondary" className="text-[10px] ml-1">{wirelessSLEs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="wired" className="flex items-center gap-1.5" disabled>
            <Cable className="h-3.5 w-3.5" />
            Wired
            <Badge variant="outline" className="text-[10px] ml-1">Coming Soon</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wireless" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {wirelessSLEs.map(sle => (
              <SLEBlock
                key={sle.id}
                sle={sle}
                stations={stations}
                aps={aps}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="wired" className="mt-4">
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="text-center">
              <Cable className="mx-auto h-12 w-12 mb-3 opacity-50" />
              <h3 className="text-lg font-medium mb-1">Wired SLEs Coming Soon</h3>
              <p className="text-sm">Switch Health, Throughput, Successful Connect, and Switch Bandwidth</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
