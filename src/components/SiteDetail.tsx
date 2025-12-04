import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { 
  Building2, 
  MapPin, 
  Wifi, 
  Users, 
  Activity,
  Settings,
  Plus,
  Edit,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

interface SiteDetailProps {
  siteId: string;
  siteName: string;
}

interface SiteInfo {
  id: string;
  name: string;
  location?: string;
  description?: string;
  accessPointCount: number;
  clientCount: number;
  status: 'healthy' | 'warning' | 'critical';
  lastUpdated: string;
}

export function SiteDetail({ siteId, siteName }: SiteDetailProps) {
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSiteDetails = async () => {
    try {
      setIsLoading(true);
      
      // Mock site data - in real implementation, this would come from the API
      const mockSiteInfo: SiteInfo = {
        id: siteId,
        name: siteName,
        location: 'Building A, Floor 3',
        description: 'Main office site with conference rooms and workspaces',
        accessPointCount: Math.floor(Math.random() * 50) + 10,
        clientCount: Math.floor(Math.random() * 200) + 50,
        status: ['healthy', 'warning', 'critical'][Math.floor(Math.random() * 3)] as 'healthy' | 'warning' | 'critical',
        lastUpdated: new Date().toISOString()
      };
      
      setSiteInfo(mockSiteInfo);
    } catch (error) {
      console.error('Failed to load site details:', error);
      toast.error('Failed to load site details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadSiteDetails();
    setIsRefreshing(false);
    toast.success('Site details refreshed');
  };

  useEffect(() => {
    loadSiteDetails();
  }, [siteId, siteName]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!siteInfo) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load site details</p>
      </div>
    );
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'healthy': return 'default';
      case 'warning': return 'secondary';
      case 'critical': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Site Details</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Site Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{siteInfo.name}</span>
            <Badge variant={getStatusBadgeVariant(siteInfo.status)}>
              {siteInfo.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">{siteInfo.location || 'Not specified'}</p>
              </div>
            </div>
            {siteInfo.description && (
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="font-medium">{siteInfo.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Site Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>Site Statistics</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Wifi className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Access Points</span>
              </div>
              <div className="text-2xl font-bold">{siteInfo.accessPointCount}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Connected Clients</span>
              </div>
              <div className="text-2xl font-bold">{siteInfo.clientCount}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className={`h-4 w-4 ${getStatusColor(siteInfo.status)}`} />
            <span>Health Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Overall Status:</span>
            <Badge variant={getStatusBadgeVariant(siteInfo.status)}>
              {siteInfo.status.charAt(0).toUpperCase() + siteInfo.status.slice(1)}
            </Badge>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">Access Points Online</span>
              <div className="flex items-center space-x-2">
                <div className="w-16 bg-muted rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '85%' }}></div>
                </div>
                <span className="text-sm font-medium">85%</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm">Network Performance</span>
              <div className="flex items-center space-x-2">
                <div className="w-16 bg-muted rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '92%' }}></div>
                </div>
                <span className="text-sm font-medium">92%</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm">Client Satisfaction</span>
              <div className="flex items-center space-x-2">
                <div className="w-16 bg-muted rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '78%' }}></div>
                </div>
                <span className="text-sm font-medium">78%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-4 w-4" />
            <span>Recent Activity</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex-1">
                <p className="text-sm font-medium">New access point added</p>
                <p className="text-xs text-muted-foreground">AP-Conference-Room-B was configured</p>
              </div>
              <span className="text-xs text-muted-foreground">2 hours ago</span>
            </div>
            
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex-1">
                <p className="text-sm font-medium">Client authentication spike</p>
                <p className="text-xs text-muted-foreground">45 new clients connected during meeting hours</p>
              </div>
              <span className="text-xs text-muted-foreground">4 hours ago</span>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div className="flex-1">
                <p className="text-sm font-medium">Firmware update completed</p>
                <p className="text-xs text-muted-foreground">All access points updated to version 10.0.4</p>
              </div>
              <span className="text-xs text-muted-foreground">1 day ago</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Management Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Site Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" size="sm" className="justify-start">
              <Edit className="h-4 w-4 mr-2" />
              Edit Site Information
            </Button>
            <Button variant="outline" size="sm" className="justify-start">
              <Plus className="h-4 w-4 mr-2" />
              Add Access Point
            </Button>
            <Button variant="outline" size="sm" className="justify-start">
              <Settings className="h-4 w-4 mr-2" />
              Configure Site Settings
            </Button>
            <Button variant="outline" size="sm" className="justify-start">
              <BarChart3 className="h-4 w-4 mr-2" />
              View Detailed Analytics
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Site Information */}
      <Card>
        <CardHeader>
          <CardTitle>Site Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Site ID:</span>
              <span className="font-mono text-xs">{siteInfo.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Updated:</span>
              <span className="font-medium">
                {new Date(siteInfo.lastUpdated).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Configuration Status:</span>
              <Badge variant="default">Active</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}