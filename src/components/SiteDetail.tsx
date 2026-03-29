import { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import {
  Building2,
  MapPin,
  Wifi,
  Users,
  Network,
  Globe,
  Clock,
  RefreshCw,
  Server,
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface SiteDetailProps {
  siteId: string;
  siteName: string;
}

interface SiteInfo {
  id: string;
  name: string;
  location?: string;
  country?: string;
  timezone?: string;
  description?: string;
  status: 'active' | 'inactive' | 'provisioning' | 'error' | 'unknown';
  site_group_name?: string;
  ap_count: number;
  client_count: number;
  network_count: number;
}

export function SiteDetail({ siteId, siteName }: SiteDetailProps) {
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSiteDetails = async () => {
    try {
      setIsLoading(true);

      // Fetch site state and AP/client counts in parallel
      const [siteState, aps, stations] = await Promise.all([
        apiService.makeAuthenticatedRequest(
          `/v1/state/sites/${encodeURIComponent(siteId)}`
        ).then(r => r.ok ? r.json() : null).catch(() => null),
        apiService.getAccessPointsBySite(siteId).catch(() => [] as any[]),
        apiService.getStations().catch(() => [] as any[]),
      ]);

      const apCount = Array.isArray(aps) ? aps.length : 0;
      const clientCount = Array.isArray(stations)
        ? stations.filter((s: any) => s.siteId === siteId || s.siteName === siteName).length
        : 0;

      const opStatus: string = siteState?.operationalStatus || siteState?.state || '';
      let status: SiteInfo['status'] = 'active';
      if (opStatus.toLowerCase().includes('outofservice') || opStatus.toLowerCase() === 'down') {
        status = 'error';
      } else if (opStatus.toLowerCase().includes('inactive')) {
        status = 'inactive';
      }

      // Extract location from tree node or top-level
      const city = siteState?.treeNode?.city;
      const region = siteState?.treeNode?.region;
      const location = city
        ? [city, region].filter(Boolean).join(', ')
        : siteState?.location;

      setSiteInfo({
        id: siteId,
        name: siteName,
        location,
        country: siteState?.treeNode?.country || siteState?.country,
        timezone: siteState?.treeNode?.timezone || siteState?.timezone,
        description: siteState?.description,
        status,
        site_group_name: siteState?.siteGroupName,
        ap_count: apCount,
        client_count: clientCount,
        network_count: 0, // Not available from this endpoint
      });
    } catch (error) {
      console.error('Failed to load site details:', error);
      setSiteInfo({
        id: siteId,
        name: siteName,
        status: 'unknown',
        ap_count: 0,
        client_count: 0,
        network_count: 0,
      });
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
  }, [siteId, siteName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
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

  const statusVariant = siteInfo.status === 'active'
    ? 'default'
    : siteInfo.status === 'error'
      ? 'destructive'
      : 'secondary';

  const statusLabel = siteInfo.status === 'unknown' ? 'Unknown' :
    siteInfo.status.charAt(0).toUpperCase() + siteInfo.status.slice(1);

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">{siteInfo.name}</h3>
            {siteInfo.description && (
              <p className="text-sm text-muted-foreground mt-1">{siteInfo.description}</p>
            )}
          </div>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>

        <div className="space-y-2.5 text-sm">
          {siteInfo.site_group_name && (
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Server className="h-4 w-4 shrink-0" />
              <span className="text-foreground font-medium">{siteInfo.site_group_name}</span>
              <span className="text-xs">(Site Group)</span>
            </div>
          )}
          {siteInfo.location && (
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{siteInfo.location}</span>
            </div>
          )}
          {siteInfo.country && (
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Globe className="h-4 w-4 shrink-0" />
              <span>{siteInfo.country}</span>
            </div>
          )}
          {siteInfo.timezone && (
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span>{siteInfo.timezone}</span>
            </div>
          )}
          {!siteInfo.location && !siteInfo.country && !siteInfo.timezone && !siteInfo.site_group_name && (
            <p className="text-muted-foreground italic text-xs">No location details available</p>
          )}
        </div>
      </section>

      {/* Stats */}
      <section>
        <h4 className="text-sm font-semibold mb-3">Statistics</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/30 border">
            <Wifi className="h-4 w-4 mx-auto mb-1 text-blue-500" />
            <div className="text-xl font-bold">{siteInfo.ap_count}</div>
            <div className="text-xs text-muted-foreground">APs</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30 border">
            <Users className="h-4 w-4 mx-auto mb-1 text-violet-500" />
            <div className="text-xl font-bold">{siteInfo.client_count}</div>
            <div className="text-xs text-muted-foreground">Clients</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30 border">
            <Network className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
            <div className="text-xl font-bold">{siteInfo.network_count}</div>
            <div className="text-xs text-muted-foreground">Networks</div>
          </div>
        </div>
      </section>

      {/* Variables Placeholder */}
      <section>
        <h4 className="text-sm font-semibold mb-3">Site Variables</h4>
        <div className="flex flex-col items-center justify-center py-8 text-center border rounded-lg border-dashed border-muted-foreground/30">
          <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
          <h4 className="text-sm font-medium">Site Variables</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Site-level variables will appear here. This feature is coming soon.
          </p>
        </div>
      </section>
    </div>
  );
}
