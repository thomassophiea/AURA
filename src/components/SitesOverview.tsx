import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { DetailSlideOut } from './DetailSlideOut';
import { 
  MapPin, 
  Wifi, 
  Users, 
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Eye,
  Settings,
  TrendingUp,
  Clock,
  Network
} from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface SiteData {
  id: string;
  siteName: string;
  country?: string;
  distributed?: boolean;
  timezone?: string;
  deviceGroups?: any[];
  apSerialNumbers?: string[];
  switchSerialNumbers?: string[];
  canDelete?: boolean;
  canEdit?: boolean;
  [key: string]: any;
}

interface SiteDetails extends SiteData {
  apsData?: any[];
  switchesData?: any[];
  totalDevices?: number;
  onlineDevices?: number;
  healthPercentage?: number;
}

interface SitesOverviewProps {
  onShowDetail?: (siteId: string, siteName: string) => void;
}

export function SitesOverview({ onShowDetail }: SitesOverviewProps) {
  const [sites, setSites] = useState<SiteData[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isDetailSlideOutOpen, setIsDetailSlideOutOpen] = useState(false);

  const fetchSitesOverview = async () => {
    try {
      setError(null);
      
      // Fetch sites from the correct v3 endpoint
      const response = await apiService.makeAuthenticatedRequest('/v3/sites', {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sites: ${response.status} ${response.statusText}`);
      }

      const sitesData = await response.json();
      
      // Ensure we have an array and handle various API response formats
      let sitesList: any[] = [];
      if (Array.isArray(sitesData)) {
        sitesList = sitesData;
      } else if (sitesData && Array.isArray(sitesData.sites)) {
        sitesList = sitesData.sites;
      } else if (sitesData && Array.isArray(sitesData.data)) {
        sitesList = sitesData.data;
      }

      // Process sites data for display
      const enhancedSites = sitesList.map(site => {
        // Count devices from device groups
        const totalAPs = site.deviceGroups?.reduce((total: number, group: any) => {
          return total + (group.apSerialNumbers?.length || 0);
        }, 0) || 0;
        
        const totalSwitches = site.switchSerialNumbers?.length || 0;

        return {
          ...site,
          name: site.siteName,
          aps: totalAPs,
          switches: totalSwitches,
          clients: 0, // Would need additional API call to get client counts
          totalDevices: totalAPs + totalSwitches,
          onlineDevices: totalAPs + totalSwitches, // Assume online for now
          healthPercentage: totalAPs + totalSwitches > 0 ? 100 : 0, // Default to 100% for existing devices
          status: totalAPs + totalSwitches > 0 ? 'online' : 'offline',
          location: site.treeNode?.city ? `${site.treeNode.city}, ${site.treeNode.region}` : site.treeNode?.region || 'Not specified'
        };
      });

      setSites(enhancedSites);
      setLastUpdated(new Date());

      if (enhancedSites.length === 0) {
        toast.info('No sites found', {
          description: 'No sites are currently configured in the system.'
        });
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch sites data';
      setError(errorMessage);
      
      if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
        toast.error('Request timed out', {
          description: 'The Campus Controller is taking too long to respond. Please try again.',
          duration: 8000,
          action: {
            label: 'Retry',
            onClick: () => fetchSitesOverview()
          }
        });
      } else {
        toast.error('Sites Overview Error', {
          description: errorMessage,
          duration: 5000,
          action: {
            label: 'Retry',
            onClick: () => fetchSitesOverview()
          }
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchSiteDetails = async (siteId: string) => {
    setDetailsLoading(true);
    try {
      // Try to fetch specific site details
      const siteResponse = await apiService.makeAuthenticatedRequest(`/v1/state/sites/${siteId}`);
      let siteDetails = sites.find(s => s.id === siteId || s.name === siteId) || {};

      if (siteResponse.ok) {
        const apiSiteDetails = await siteResponse.json();
        siteDetails = { ...siteDetails, ...apiSiteDetails };
      }

      // Fetch site-specific APs if endpoint exists
      try {
        const siteAPsResponse = await apiService.makeAuthenticatedRequest(`/v1/state/sites/${siteId}/aps`);
        if (siteAPsResponse.ok) {
          const siteAPsData = await siteAPsResponse.json();
          siteDetails.apsData = Array.isArray(siteAPsData) ? siteAPsData : siteAPsData.aps || [];
        }
      } catch (err) {
        // Site-specific APs endpoint might not exist, use filtered data
        console.log('Site-specific APs endpoint not available');
      }

      setSelectedSite(siteDetails as SiteDetails);

    } catch (err) {
      toast.error('Failed to fetch site details', {
        description: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    fetchSitesOverview();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSitesOverview, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    fetchSitesOverview();
  };

  const getStatusColor = (status: string, health?: number) => {
    if (health !== undefined) {
      if (health >= 90) return 'default';
      if (health >= 70) return 'secondary';
      return 'destructive';
    }
    
    switch (status?.toLowerCase()) {
      case 'online':
      case 'up':
        return 'default';
      case 'partial':
        return 'secondary';
      case 'offline':
      case 'down':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: string, health?: number) => {
    if (health !== undefined) {
      if (health >= 90) return <CheckCircle className="h-4 w-4" />;
      if (health >= 70) return <Activity className="h-4 w-4" />;
      return <AlertTriangle className="h-4 w-4" />;
    }
    
    switch (status?.toLowerCase()) {
      case 'online':
      case 'up':
        return <CheckCircle className="h-4 w-4" />;
      case 'partial':
        return <Activity className="h-4 w-4" />;
      case 'offline':
      case 'down':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  if (error && sites.length === 0) {
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center">
        <div className="flex items-center space-x-4">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{sites.length}</div>
                <p className="text-xs text-muted-foreground">
                  Network locations
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy Sites</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {sites.filter(s => (s.healthPercentage || 0) >= 90).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  90%+ health score
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {sites.reduce((total, site) => total + (site.totalDevices || 0), 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  APs and switches
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="surface-1dp">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {sites.reduce((total, site) => total + (site.clients || 0), 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Connected users
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sites List */}
      <Card className="surface-2dp">
        <CardHeader>
          <CardTitle className="text-headline-6 text-high-emphasis">Site Details</CardTitle>
          <CardDescription>Overview of all network sites and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : sites.length === 0 ? (
            <div className="text-center py-8">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No sites found</p>
              <p className="text-sm text-muted-foreground">Sites will appear here when devices are configured with site information</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sites.map((site, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => onShowDetail?.(site.id, site.siteName || site.name || 'Unknown Site')}
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      {getStatusIcon(site.status || '', site.healthPercentage)}
                    </div>
                    
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{site.siteName || site.name || 'Unknown Site'}</span>
                        <Badge variant={getStatusColor(site.status || '', site.healthPercentage)}>
                          {site.healthPercentage ? `${site.healthPercentage}% health` : site.status || 'Unknown'}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {site.location || site.description || 'No description available'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-center">
                      <div className="flex items-center space-x-1">
                        <Wifi className="h-4 w-4" />
                        <span className="font-medium">{site.aps || 0}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">APs</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="flex items-center space-x-1">
                        <Server className="h-4 w-4" />
                        <span className="font-medium">{site.switches || 0}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Switches</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="flex items-center space-x-1">
                        <Users className="h-4 w-4" />
                        <span className="font-medium">{site.clients || 0}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Clients</div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        fetchSiteDetails(site.id || site.name || '');
                        setIsDetailSlideOutOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site Details Slide-out */}
      <DetailSlideOut
        isOpen={isDetailSlideOutOpen}
        onClose={() => setIsDetailSlideOutOpen(false)}
        title={selectedSite?.siteName || selectedSite?.name || 'Site Details'}
        description="Detailed information about this network site"
        width="lg"
      >
        {detailsLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : selectedSite ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-2">Site Information</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant={getStatusColor(selectedSite.status || '', selectedSite.healthPercentage)}>
                      {selectedSite.status || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Health:</span>
                    <span>{selectedSite.healthPercentage || 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location:</span>
                    <span>{selectedSite.location || 'Not specified'}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Device Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Access Points:</span>
                    <span>{selectedSite.aps || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Switches:</span>
                    <span>{selectedSite.switches || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Clients:</span>
                    <span>{selectedSite.clients || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Online Devices:</span>
                    <span>{selectedSite.onlineDevices || 0}/{selectedSite.totalDevices || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {selectedSite.apsData && selectedSite.apsData.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Access Points</h4>
                <div className="space-y-2">
                  {selectedSite.apsData.slice(0, 5).map((ap, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                      <span className="text-sm">{ap.name || ap.serial}</span>
                      <Badge variant={ap.status === 'online' ? 'default' : 'destructive'} className="text-xs">
                        {ap.status}
                      </Badge>
                    </div>
                  ))}
                  {selectedSite.apsData.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{selectedSite.apsData.length - 5} more access points
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">No additional details available</p>
        )}
      </DetailSlideOut>
    </div>
  );
}