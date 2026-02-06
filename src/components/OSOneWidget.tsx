import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  Clock,
  Network,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Cloud,
  Shield,
  Key,
  Activity,
  Gauge,
  Info,
  CheckCircle2,
  AlertCircle,
  Wifi
} from 'lucide-react';
import { apiService, OSOneInfo, OSOneSystemInfo, OSOneManufacturingInfo } from '../services/api';

interface OSOneWidgetProps {
  siteId?: string;
  siteName?: string;
  compact?: boolean;
  showManufacturing?: boolean;
  className?: string;
}

export function OSOneWidget({
  siteId,
  siteName,
  compact = false,
  showManufacturing = true,
  className = ''
}: OSOneWidgetProps) {
  const [osOneInfo, setOsOneInfo] = useState<OSOneInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showDiskDetails, setShowDiskDetails] = useState(false);

  const loadOSOneInfo = async () => {
    try {
      setError(null);
      const info = await apiService.getOSOneInfo();
      setOsOneInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OS ONE information');
      console.error('[OSOneWidget] Error loading info:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadOSOneInfo();
  };

  useEffect(() => {
    loadOSOneInfo();
    // Auto-refresh every 60 seconds
    const interval = setInterval(loadOSOneInfo, 60000);
    return () => clearInterval(interval);
  }, [siteId]);

  const formatUptime = (uptimeMs?: number): string => {
    if (!uptimeMs) return 'Unknown';
    const seconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatMemory = (kb?: number): string => {
    if (!kb) return 'Unknown';
    const gb = kb / 1024 / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const getServiceStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'available' || statusLower === 'onboarded' || statusLower === 'connected') {
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">{status}</Badge>;
    } else if (statusLower === 'unavailable' || statusLower === 'error') {
      return <Badge variant="destructive">{status}</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  const getCpuColor = (usage: number): string => {
    if (usage > 80) return 'bg-red-500';
    if (usage > 60) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const getMemoryColor = (freePercent: number): string => {
    const usedPercent = 100 - freePercent;
    if (usedPercent > 85) return 'bg-red-500';
    if (usedPercent > 70) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  if (isLoading) {
    return (
      <Card className={`${className}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <Skeleton className="h-6 w-32" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !osOneInfo) {
    return (
      <Card className={`${className}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">OS ONE</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefresh} aria-label="Refresh OS ONE data">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error || 'Unable to load OS ONE information'}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { system, manufacturing } = osOneInfo;
  const cpuUsage = system?.cpuUtilization || 0;
  const memoryUsed = 100 - (system?.memoryFreePercent || 0);

  // Compact view for dashboard cards
  if (compact) {
    return (
      <Card className={`relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
        <div className="absolute -right-8 -top-8 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
          <CardTitle className="text-sm font-semibold">OS ONE Control</CardTitle>
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shadow-md group-hover:scale-110 transition-transform">
            <Server className="h-3.5 w-3.5 text-white" />
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">CPU</span>
              <span className={`text-sm font-bold ${cpuUsage > 80 ? 'text-red-500' : cpuUsage > 60 ? 'text-amber-500' : 'text-green-500'}`}>
                {cpuUsage.toFixed(1)}%
              </span>
            </div>
            <Progress value={cpuUsage} className="h-1.5" />
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">Memory</span>
              <span className={`text-sm font-bold ${memoryUsed > 85 ? 'text-red-500' : memoryUsed > 70 ? 'text-amber-500' : 'text-blue-500'}`}>
                {memoryUsed.toFixed(0)}% used
              </span>
            </div>
            <Progress value={memoryUsed} className="h-1.5" />
            {manufacturing?.model && (
              <p className="text-xs text-muted-foreground pt-1">
                {manufacturing.model}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full view
  return (
    <Card className={`${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shadow-md">
              <Server className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                OS ONE
                {siteName && <Badge variant="outline" className="ml-2">{siteName}</Badge>}
              </CardTitle>
              <CardDescription>
                {manufacturing?.model || 'System Information'}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* System Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* CPU */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">CPU</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Usage</span>
                <span className={`font-bold ${cpuUsage > 80 ? 'text-red-500' : cpuUsage > 60 ? 'text-amber-500' : 'text-green-500'}`}>
                  {cpuUsage.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${getCpuColor(cpuUsage)}`}
                  style={{ width: `${Math.min(cpuUsage, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Memory */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Memory</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Used</span>
                <span className={`font-bold ${memoryUsed > 85 ? 'text-red-500' : memoryUsed > 70 ? 'text-amber-500' : 'text-blue-500'}`}>
                  {memoryUsed.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${getMemoryColor(system?.memoryFreePercent || 100)}`}
                  style={{ width: `${memoryUsed}%` }}
                />
              </div>
            </div>
          </div>

          {/* Uptime */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Uptime</span>
            </div>
            <p className="text-lg font-bold text-primary">
              {system?.uptime || formatUptime(system?.sysUptime)}
            </p>
          </div>

          {/* Ports */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Network Ports</span>
            </div>
            <div className="flex gap-2">
              {system?.ports.map((port) => (
                <Tooltip key={port.port}>
                  <TooltipTrigger>
                    <Badge
                      variant={port.state === 'up' ? 'default' : 'secondary'}
                      className={port.state === 'up' ? 'bg-green-500' : ''}
                    >
                      P{port.port}: {port.speed / 1000}G
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Port {port.port}: {port.state}, {port.speed} Mbps</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {(!system?.ports || system.ports.length === 0) && (
                <span className="text-sm text-muted-foreground">No port data</span>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* External Services */}
        {system?.externalServices && system.externalServices.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              External Services
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {system.externalServices.map((service, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    {service.service === 'Cloud' && <Cloud className="h-4 w-4 text-blue-500" />}
                    {service.service === 'Afc' && <Wifi className="h-4 w-4 text-purple-500" />}
                    {service.service === 'Licensing' && <Key className="h-4 w-4 text-amber-500" />}
                    <span className="text-sm">{service.service}</span>
                  </div>
                  {getServiceStatusBadge(service.status)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disk Usage (Collapsible) */}
        {system?.diskPartitions && system.diskPartitions.length > 0 && (
          <Collapsible open={showDiskDetails} onOpenChange={setShowDiskDetails}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Disk Usage ({system.diskPartitions.length} partitions)
                </span>
                {showDiskDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="space-y-2">
                {system.diskPartitions.map((partition) => (
                  <div key={partition.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-mono text-xs">{partition.name}</span>
                      <span className={partition.usePercent > 80 ? 'text-red-500' : ''}>
                        {partition.usePercent}%
                      </span>
                    </div>
                    <Progress value={partition.usePercent} className="h-1" />
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Manufacturing Info */}
        {showManufacturing && manufacturing && (
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Hardware Details
                </span>
                {showDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {manufacturing.softwareVersion && (
                  <>
                    <span className="text-muted-foreground">Software Version</span>
                    <span className="font-mono">{manufacturing.softwareVersion}</span>
                  </>
                )}
                {manufacturing.cpuType && (
                  <>
                    <span className="text-muted-foreground">CPU</span>
                    <span className="font-mono text-xs">{manufacturing.cpuType}</span>
                  </>
                )}
                {manufacturing.numberOfCpus && (
                  <>
                    <span className="text-muted-foreground">CPU Cores</span>
                    <span>{manufacturing.numberOfCpus}</span>
                  </>
                )}
                {manufacturing.totalMemory && (
                  <>
                    <span className="text-muted-foreground">Total Memory</span>
                    <span>{formatMemory(manufacturing.totalMemory)}</span>
                  </>
                )}
                {manufacturing.hwEncryption !== undefined && (
                  <>
                    <span className="text-muted-foreground">HW Encryption</span>
                    <span>{manufacturing.hwEncryption ? 'Yes' : 'No'}</span>
                  </>
                )}
                {manufacturing.lan1Mac && (
                  <>
                    <span className="text-muted-foreground">LAN 1 MAC</span>
                    <span className="font-mono text-xs">{manufacturing.lan1Mac}</span>
                  </>
                )}
                {manufacturing.lan2Mac && (
                  <>
                    <span className="text-muted-foreground">LAN 2 MAC</span>
                    <span className="font-mono text-xs">{manufacturing.lan2Mac}</span>
                  </>
                )}
                {manufacturing.lockingId && (
                  <>
                    <span className="text-muted-foreground">Locking ID</span>
                    <span className="font-mono text-xs">{manufacturing.lockingId}</span>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

export default OSOneWidget;
