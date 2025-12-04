import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Users,
  Wifi,
  Server,
  RefreshCw,
  Download,
  Clock,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  MapPin,
  Filter
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface Site {
  id: string;
  name: string;
  status?: string;
}

interface ReportWidget {
  id: string;
  name: string;
  type: string;
  data: any;
}

interface SiteReport {
  siteId: string;
  siteName: string;
  widgets: any[];
  metrics: {
    apCount?: number;
    clientCount?: number;
    uptime?: number;
    throughput?: number;
    health?: number;
  };
}

interface APReport {
  apId: string;
  name: string;
  serialNumber: string;
  siteId?: string;
  siteName?: string;
  status: string;
  clientCount: number;
  health: number;
  uptime: number;
  throughput?: number;
}

const CHART_COLORS = ['#8b5cf6', '#1dd1a1', '#06b6d4', '#f59e0b', '#ef4444'];

export function PerformanceAnalytics() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [siteReports, setSiteReports] = useState<SiteReport[]>([]);
  const [apReports, setApReports] = useState<APReport[]>([]);
  const [reportWidgets, setReportWidgets] = useState<ReportWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch available sites with fallback
  const fetchSites = async () => {
    const siteEndpoints = ['/v3/sites', '/v1/sites'];
    
    for (const endpoint of siteEndpoints) {
      try {
        const response = await apiService.makeAuthenticatedRequest(endpoint, {}, 3000);
        if (response.ok) {
          const data = await response.json();
          const sitesData = Array.isArray(data) ? data : data.sites || [];
          setSites(sitesData.map((site: any) => ({
            id: site.id || site.siteId,
            name: site.name || site.siteName || `Site ${site.id}`,
            status: site.status
          })));
          console.log(`Sites data loaded successfully from: ${endpoint}`);
          return;
        }
      } catch (err) {
        console.log(`Sites endpoint ${endpoint} failed:`, err instanceof Error ? err.message : 'Unknown error');
      }
    }
    console.log('All sites endpoints failed, but continuing with empty sites array');
  };

  // Fetch site report widgets with fallback strategies
  const fetchSiteReportWidgets = async () => {
    const widgetEndpoints = [
      '/v1/sites/report/widgets',   // Try v1 first
      '/v3/sites/report/widgets',   // Original v3 endpoint
      '/v1/reports/widgets'         // General widgets endpoint
    ];

    for (const endpoint of widgetEndpoints) {
      try {
        const response = await apiService.makeAuthenticatedRequest(endpoint, {}, 3000);
        if (response.ok) {
          const data = await response.json();
          console.log(`Site widgets successful with endpoint: ${endpoint}`);
          return Array.isArray(data) ? data : data.widgets || [];
        }
      } catch (err) {
        console.log(`Widget endpoint ${endpoint} failed:`, err instanceof Error ? err.message : 'Unknown error');
      }
    }
    
    console.log('All widget endpoints failed, returning empty array');
    return [];
  };

  // Fetch sites report (all sites overview) with fallback strategies
  const fetchSitesReport = async () => {
    // Try multiple endpoints for sites reports
    const sitesReportEndpoints = [
      '/v1/sites/report',         // Try v1 first
      '/v3/sites/report',         // Original v3 endpoint  
      '/v1/report/sites'          // Alternative structure
    ];

    for (const endpoint of sitesReportEndpoints) {
      try {
        const response = await apiService.makeAuthenticatedRequest(endpoint, {}, 4000);
        if (response.ok) {
          const data = await response.json();
          console.log(`Sites report successful with endpoint: ${endpoint}`);
          return data;
        }
      } catch (err) {
        console.log(`Sites report endpoint ${endpoint} failed:`, err instanceof Error ? err.message : 'Unknown error');
      }
    }
    
    // If all report endpoints fail, fall back to basic sites data
    try {
      console.log('Falling back to basic sites data for analytics');
      const response = await apiService.makeAuthenticatedRequest('/v3/sites', {}, 4000);
      if (response.ok) {
        const sitesData = await response.json();
        // Transform basic sites data into a report-like structure
        return {
          sites: Array.isArray(sitesData) ? sitesData : sitesData.sites || [],
          generated: new Date().toISOString(),
          fallback: true
        };
      }
    } catch (err) {
      console.log('Fallback to basic sites data also failed:', err instanceof Error ? err.message : 'Unknown error');
    }
    
    return null;
  };

  // Fetch individual site report with fallback strategies
  const fetchSiteReport = async (siteId: string) => {
    // Try multiple endpoints for site reports, starting with most likely to work
    const siteReportEndpoints = [
      `/v1/sites/${siteId}/report`,  // Try v1 first as it's more commonly available
      `/v3/sites/${siteId}/report`,  // Original v3 endpoint
      `/v1/report/sites/${siteId}`   // Alternative report endpoint structure
    ];

    for (const endpoint of siteReportEndpoints) {
      try {
        const response = await apiService.makeAuthenticatedRequest(endpoint, {}, 4000); // Shorter timeout
        if (response.ok) {
          const data = await response.json();
          console.log(`Site report successful with endpoint: ${endpoint}`);
          return data;
        }
      } catch (err) {
        // Log the error but continue trying other endpoints - use console.log instead of warn to reduce noise
        console.log(`Site report endpoint ${endpoint} failed:`, err instanceof Error ? err.message : 'Unknown error');
      }
    }
    
    // All endpoints failed, return null
    console.log(`All site report endpoints failed for site ${siteId}`);
    return null;
  };

  // Fetch APs report with fallback strategies
  const fetchAPsReport = async () => {
    const apReportEndpoints = [
      '/v1/aps/report',           // Primary reports endpoint
      '/v1/aps',                  // Fallback to basic APs data
      '/v1/state/aps'             // Alternative state endpoint
    ];

    for (const endpoint of apReportEndpoints) {
      try {
        const response = await apiService.makeAuthenticatedRequest(endpoint, {}, 4000);
        if (response.ok) {
          const data = await response.json();
          console.log(`APs data successful with endpoint: ${endpoint}`);
          return Array.isArray(data) ? data : data.aps || [];
        }
      } catch (err) {
        console.log(`AP endpoint ${endpoint} failed:`, err instanceof Error ? err.message : 'Unknown error');
      }
    }
    
    console.log('All AP endpoints failed, returning empty array');
    return [];
  };

  // Fetch AP report widgets with fallback strategies  
  const fetchAPReportWidgets = async () => {
    const apWidgetEndpoints = [
      '/v1/aps/report/widgets',
      '/v1/reports/widgets'       // General widgets as fallback
    ];

    for (const endpoint of apWidgetEndpoints) {
      try {
        const response = await apiService.makeAuthenticatedRequest(endpoint, {}, 3000);
        if (response.ok) {
          const data = await response.json();
          console.log(`AP widgets successful with endpoint: ${endpoint}`);
          return Array.isArray(data) ? data : data.widgets || [];
        }
      } catch (err) {
        console.log(`AP widget endpoint ${endpoint} failed:`, err instanceof Error ? err.message : 'Unknown error');
      }
    }
    
    return [];
  };

  // Fetch general report widgets with fallback strategies
  const fetchReportWidgets = async () => {
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/reports/widgets', {}, 3000);
      if (response.ok) {
        const data = await response.json();
        console.log('General widgets successful');
        return Array.isArray(data) ? data : data.widgets || [];
      }
    } catch (err) {
      console.log('General widgets endpoint failed:', err instanceof Error ? err.message : 'Unknown error');
    }
    return [];
  };

  // Main data fetching function
  const fetchAnalyticsData = async () => {
    try {
      setError(null);
      setRefreshing(true);

      // Fetch all sites data first
      await fetchSites();

      if (selectedSite === 'all') {
        // Fetch all sites analytics with graceful error handling
        console.log('Fetching analytics data for all sites...');
        const [sitesReportData, apsReportData, siteWidgets, apWidgets, generalWidgets] = await Promise.allSettled([
          fetchSitesReport(),
          fetchAPsReport(),
          fetchSiteReportWidgets(),
          fetchAPReportWidgets(),
          fetchReportWidgets()
        ]);

        // Process sites report
        if (sitesReportData.status === 'fulfilled' && sitesReportData.value) {
          const sitesData = sitesReportData.value;
          
          // Create site reports from the data
          const processedSiteReports: SiteReport[] = [];
          
          if (sitesData.sites && Array.isArray(sitesData.sites)) {
            sitesData.sites.forEach((site: any) => {
              processedSiteReports.push({
                siteId: site.id || site.siteId,
                siteName: site.name || site.siteName || `Site ${site.id}`,
                widgets: site.widgets || [],
                metrics: {
                  apCount: site.apCount || site.accessPoints || 0,
                  clientCount: site.clientCount || site.clients || 0,
                  uptime: site.uptime || 0,
                  throughput: site.throughput || 0,
                  health: site.health || site.healthScore || 0
                }
              });
            });
          }
          
          setSiteReports(processedSiteReports);
        }

        // Process APs report
        if (apsReportData.status === 'fulfilled' && apsReportData.value) {
          const apsData = apsReportData.value;
          const processedAPReports: APReport[] = apsData.map((ap: any) => ({
            apId: ap.id || ap.apId || ap.serial,
            name: ap.name || ap.displayName || `AP ${ap.serial}`,
            serialNumber: ap.serial || ap.serialNumber,
            siteId: ap.siteId || ap.site,
            siteName: ap.siteName,
            status: ap.status || 'unknown',
            clientCount: ap.clientCount || ap.clients || 0,
            health: ap.health || ap.healthScore || 0,
            uptime: ap.uptime || 0,
            throughput: ap.throughput || 0
          }));
          
          setApReports(processedAPReports);
        }

        // Process widgets
        const allWidgets: ReportWidget[] = [];
        
        [siteWidgets, apWidgets, generalWidgets].forEach((widgetResult) => {
          if (widgetResult.status === 'fulfilled' && widgetResult.value) {
            const widgets = Array.isArray(widgetResult.value) ? widgetResult.value : [];
            widgets.forEach((widget: any) => {
              allWidgets.push({
                id: widget.id || widget.widgetId,
                name: widget.name || widget.title,
                type: widget.type || 'unknown',
                data: widget.data || widget
              });
            });
          }
        });
        
        setReportWidgets(allWidgets);

      } else {
        // Fetch specific site analytics
        console.log(`Fetching analytics data for site: ${selectedSite}`);
        const siteReport = await fetchSiteReport(selectedSite);
        
        if (siteReport) {
          const site = sites.find(s => s.id === selectedSite);
          const processedSiteReport: SiteReport = {
            siteId: selectedSite,
            siteName: site?.name || `Site ${selectedSite}`,
            widgets: siteReport.widgets || [],
            metrics: {
              apCount: siteReport.apCount || siteReport.accessPoints || 0,
              clientCount: siteReport.clientCount || siteReport.clients || 0,
              uptime: siteReport.uptime || 0,
              throughput: siteReport.throughput || 0,
              health: siteReport.health || siteReport.healthScore || 0
            }
          };
          
          setSiteReports([processedSiteReport]);
        } else {
          // If site report fails, create a basic site report from available data
          const site = sites.find(s => s.id === selectedSite);
          const basicSiteReport: SiteReport = {
            siteId: selectedSite,
            siteName: site?.name || `Site ${selectedSite}`,
            widgets: [],
            metrics: {
              apCount: 0,
              clientCount: 0,
              uptime: 0,
              throughput: 0,
              health: 0
            }
          };
          setSiteReports([basicSiteReport]);
        }

        // Fetch APs for this specific site
        const apsData = await fetchAPsReport();
        const siteAPs = apsData.filter((ap: any) => 
          (ap.siteId === selectedSite) || (ap.site === selectedSite) || (ap.siteName && sites.find(s => s.id === selectedSite)?.name === ap.siteName)
        );
        
        const processedAPReports: APReport[] = siteAPs.map((ap: any) => ({
          apId: ap.id || ap.apId || ap.serial,
          name: ap.name || ap.displayName || `AP ${ap.serial}`,
          serialNumber: ap.serial || ap.serialNumber,
          siteId: ap.siteId || ap.site,
          siteName: ap.siteName,
          status: ap.status || 'unknown',
          clientCount: ap.clientCount || ap.clients || 0,
          health: ap.health || ap.healthScore || (ap.status === 'online' ? 85 : 0),
          uptime: ap.uptime || (ap.status === 'online' ? 95 : 0),
          throughput: ap.throughput || 0
        }));
        
        setApReports(processedAPReports);
        
        // Update site metrics based on actual AP data if site report was empty
        if (processedAPReports.length > 0 && (!siteReport || Object.keys(siteReport).length === 0)) {
          const updatedSiteReport: SiteReport = {
            siteId: selectedSite,
            siteName: sites.find(s => s.id === selectedSite)?.name || `Site ${selectedSite}`,
            widgets: [],
            metrics: {
              apCount: processedAPReports.length,
              clientCount: processedAPReports.reduce((sum, ap) => sum + ap.clientCount, 0),
              uptime: processedAPReports.length > 0 ? processedAPReports.reduce((sum, ap) => sum + ap.uptime, 0) / processedAPReports.length : 0,
              throughput: processedAPReports.reduce((sum, ap) => sum + (ap.throughput || 0), 0),
              health: processedAPReports.length > 0 ? processedAPReports.reduce((sum, ap) => sum + ap.health, 0) / processedAPReports.length : 0
            }
          };
          setSiteReports([updatedSiteReport]);
        }
      }

      setLastUpdated(new Date());

      // Show info message only if we truly have very limited data and it's the first load
      const hasMinimalData = apReports.length === 0 && siteReports.length === 0 && sites.length === 0;
      if (hasMinimalData && !lastUpdated) {
        toast.info('Limited Analytics Data', {
          description: 'Analytics endpoints are currently unavailable. Please check the API test tool or try refreshing.',
          duration: 5000
        });
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics data';
      
      // Don't show error toasts for suppressed analytics endpoints
      if (errorMessage.includes('SUPPRESSED_ANALYTICS_ERROR')) {
        console.log('Suppressed analytics error in PerformanceAnalytics component');
        setError(null); // Don't set error state for suppressed errors
      } else {
        setError(errorMessage);
        toast.error('Analytics Error', {
          description: errorMessage
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [selectedSite]);

  const handleRefresh = () => {
    setLoading(true);
    fetchAnalyticsData();
  };

  const handleExport = () => {
    const dataToExport = {
      siteReports,
      apReports,
      reportWidgets,
      selectedSite,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-analytics-${selectedSite}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Analytics data exported successfully');
  };

  // Calculate aggregate metrics for all sites
  const getAggregateMetrics = () => {
    if (selectedSite === 'all') {
      const totalAPs = apReports.length;
      const onlineAPs = apReports.filter(ap => ap.status === 'online' || ap.status === 'up').length;
      const totalClients = apReports.reduce((sum, ap) => sum + ap.clientCount, 0);
      const avgHealth = totalAPs > 0 ? apReports.reduce((sum, ap) => sum + ap.health, 0) / totalAPs : 0;
      const avgUptime = totalAPs > 0 ? apReports.reduce((sum, ap) => sum + ap.uptime, 0) / totalAPs : 0;

      return {
        totalSites: siteReports.length,
        totalAPs,
        onlineAPs,
        totalClients,
        avgHealth,
        avgUptime,
        apHealthPercent: totalAPs > 0 ? (onlineAPs / totalAPs) * 100 : 0
      };
    } else {
      const siteAPs = apReports;
      const totalAPs = siteAPs.length;
      const onlineAPs = siteAPs.filter(ap => ap.status === 'online' || ap.status === 'up').length;
      const totalClients = siteAPs.reduce((sum, ap) => sum + ap.clientCount, 0);
      const avgHealth = totalAPs > 0 ? siteAPs.reduce((sum, ap) => sum + ap.health, 0) / totalAPs : 0;
      const avgUptime = totalAPs > 0 ? siteAPs.reduce((sum, ap) => sum + ap.uptime, 0) / totalAPs : 0;

      return {
        totalSites: 1,
        totalAPs,
        onlineAPs,
        totalClients,
        avgHealth,
        avgUptime,
        apHealthPercent: totalAPs > 0 ? (onlineAPs / totalAPs) * 100 : 0
      };
    }
  };

  if (error && siteReports.length === 0) {
    return (
      <div className="space-y-6">
        
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>

        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const metrics = getAggregateMetrics();

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center">
        <div className="flex items-center space-x-4">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              Updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Site Selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <Filter className="h-5 w-5 mr-2" />
                Analytics Scope
              </CardTitle>
              <CardDescription>Select sites to analyze performance data</CardDescription>
            </div>
            
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites Overview</SelectItem>
                {sites.map(site => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedSite === 'all' ? 'Total Sites' : 'Site Status'}
            </CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <div className="text-2xl font-bold">{metrics.totalSites}</div>
                <p className="text-xs text-muted-foreground">
                  {selectedSite === 'all' ? 'Active sites' : 'Selected site'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Access Points</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <div className="flex items-center space-x-2">
                  <div className="text-2xl font-bold">{metrics.onlineAPs}/{metrics.totalAPs}</div>
                  <Badge variant={metrics.apHealthPercent > 80 ? 'default' : 'destructive'}>
                    {Math.round(metrics.apHealthPercent)}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Online access points
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connected Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <div className="text-2xl font-bold">{metrics.totalClients}</div>
                <p className="text-xs text-muted-foreground">
                  Active connections
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <>
                <div className="flex items-center space-x-2">
                  <div className="text-2xl font-bold">{Math.round(metrics.avgHealth)}%</div>
                  {metrics.avgHealth > 80 ? 
                    <TrendingUp className="h-4 w-4 text-green-500" /> : 
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Network health score
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Details */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sites">Sites Performance</TabsTrigger>
          <TabsTrigger value="access-points">Access Points</TabsTrigger>
          <TabsTrigger value="widgets">Report Widgets</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Health Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Health Distribution</CardTitle>
                <CardDescription>Access point health status breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Excellent (90-100%)', value: apReports.filter(ap => ap.health >= 90).length, fill: CHART_COLORS[0] },
                          { name: 'Good (80-89%)', value: apReports.filter(ap => ap.health >= 80 && ap.health < 90).length, fill: CHART_COLORS[1] },
                          { name: 'Fair (70-79%)', value: apReports.filter(ap => ap.health >= 70 && ap.health < 80).length, fill: CHART_COLORS[2] },
                          { name: 'Poor (<70%)', value: apReports.filter(ap => ap.health < 70).length, fill: CHART_COLORS[3] }
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Client Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Client Distribution</CardTitle>
                <CardDescription>Connected clients across access points</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={apReports.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="clientCount" fill={CHART_COLORS[1]} name="Clients" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="sites" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sites Performance</CardTitle>
              <CardDescription>Performance metrics for all sites</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  {siteReports.map((site, index) => (
                    <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <span className="font-medium">{site.siteName}</span>
                          <div className="text-sm text-muted-foreground">Site ID: {site.siteId}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-6 text-sm">
                        <div className="text-center">
                          <div className="font-medium">{site.metrics.apCount || 0}</div>
                          <div className="text-muted-foreground">APs</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{site.metrics.clientCount || 0}</div>
                          <div className="text-muted-foreground">Clients</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{Math.round(site.metrics.health || 0)}%</div>
                          <div className="text-muted-foreground">Health</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{Math.round(site.metrics.uptime || 0)}%</div>
                          <div className="text-muted-foreground">Uptime</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {siteReports.length === 0 && (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No site reports available</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="access-points" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Access Points Performance</CardTitle>
              <CardDescription>Detailed AP metrics and status</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (
                <div className="space-y-4">
                  {apReports.map((ap, index) => (
                    <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <Wifi className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <span className="font-medium">{ap.name}</span>
                          <div className="text-sm text-muted-foreground">
                            {ap.serialNumber} {ap.siteName && `• ${ap.siteName}`}
                          </div>
                        </div>
                        <Badge variant={ap.status === 'online' ? 'default' : 'destructive'}>
                          {ap.status}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center space-x-6 text-sm">
                        <div className="text-center">
                          <div className="font-medium">{ap.clientCount}</div>
                          <div className="text-muted-foreground">Clients</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{Math.round(ap.health)}%</div>
                          <div className="text-muted-foreground">Health</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">{Math.round(ap.uptime)}%</div>
                          <div className="text-muted-foreground">Uptime</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium">
                            {ap.throughput >= 1000
                              ? `${(ap.throughput / 1000).toFixed(2)} GB/s`
                              : `${Math.round(ap.throughput)} MB/s`
                            }
                          </div>
                          <div className="text-muted-foreground">Throughput</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {apReports.length === 0 && (
                    <div className="text-center py-8">
                      <Wifi className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No access points data available</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="widgets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Report Widgets</CardTitle>
              <CardDescription>Available reporting widgets and data sources</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reportWidgets.map((widget, index) => (
                    <Card key={index}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{widget.name}</CardTitle>
                        <Badge variant="outline" className="w-fit text-xs">
                          {widget.type}
                        </Badge>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground">
                          Widget ID: {widget.id}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {reportWidgets.length === 0 && (
                    <div className="col-span-full text-center py-8">
                      <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No report widgets available</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}