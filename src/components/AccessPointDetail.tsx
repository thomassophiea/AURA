import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Skeleton } from './ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Wifi,
  Activity,
  Users,
  MapPin,
  Server,
  Signal,
  Zap,
  HardDrive,
  Cpu,
  RefreshCw,
  Settings,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  ChevronDown,
  ChevronRight,
  Radio,
  ArrowUpDown,
  Power,
  Download,
  ArrowLeft,
  Maximize2,
  Cable,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { apiService, AccessPoint, APDetails, APStation, APRadio, APAlarm, APAlarmCategory } from '../services/api';
import { APEventsTimeline } from './APEventsTimeline';
import { APInsights, APInsightsFullScreen } from './APInsights';
import { toast } from 'sonner';

// Cable health detection utilities
interface CableIssue {
  type: 'speed_degraded' | 'speed_critical' | 'duplex_mismatch' | 'poe_issue' | 'low_power';
  severity: 'warning' | 'critical';
  description: string;
  recommendation: string;
}

interface CableHealthResult {
  status: 'good' | 'warning' | 'critical' | 'unknown';
  speedMbps: number | null;
  speedDisplay: string;
  expectedSpeedMbps: number;
  message: string;
  aiInsight?: string;
  issues: CableIssue[];
  duplexMode?: string;
  portName?: string;
}

/**
 * Parse ethernet speed string to Mbps
 * Handles formats like: "speed5Gbps", "speed100Mbps", "speedNA", "speedAuto"
 */
function parseSpeedString(speedStr: string | undefined | null): { speedMbps: number | null; speedDisplay: string } {
  if (!speedStr || speedStr === '-') {
    return { speedMbps: null, speedDisplay: 'Unknown' };
  }

  const speed = String(speedStr).toLowerCase().trim();

  // Handle "speedNA" or "speedAuto" - these mean we can't determine actual speed
  if (speed === 'speedna' || speed === 'speedauto' || speed === 'na' || speed === 'auto') {
    return { speedMbps: null, speedDisplay: speedStr };
  }

  // Handle "speed5Gbps", "speed100Mbps", "speed1Gbps" format
  const speedPrefixMatch = speed.match(/speed([\d.]+)(g|m)/i);
  if (speedPrefixMatch) {
    const value = parseFloat(speedPrefixMatch[1]);
    const unit = speedPrefixMatch[2].toLowerCase();
    const mbps = unit === 'g' ? value * 1000 : value;
    const display = unit === 'g' ? `${value}Gbps` : `${value}Mbps`;
    return { speedMbps: mbps, speedDisplay: display };
  }

  // Handle "5Gbps", "100Mbps" format (without "speed" prefix)
  const gbpsMatch = speed.match(/([\d.]+)\s*g/i);
  if (gbpsMatch) {
    const value = parseFloat(gbpsMatch[1]);
    return { speedMbps: value * 1000, speedDisplay: `${value}Gbps` };
  }

  const mbpsMatch = speed.match(/([\d.]+)\s*m/i);
  if (mbpsMatch) {
    const value = parseFloat(mbpsMatch[1]);
    return { speedMbps: value, speedDisplay: `${value}Mbps` };
  }

  return { speedMbps: null, speedDisplay: speedStr };
}

/**
 * Get the actual negotiated ethernet speed and duplex mode from AP data
 * Checks ALL ports in ethPorts array and finds the one with valid speed
 * (some APs use eth1 as uplink, not eth0)
 */
function getActualEthSpeed(ap: any): {
  speedMbps: number | null;
  speedDisplay: string;
  portName?: string;
  duplexMode?: string;
} {
  // Check all ports in ethPorts array to find one with valid speed
  if (ap.ethPorts && Array.isArray(ap.ethPorts) && ap.ethPorts.length > 0) {
    // First pass: find any port with valid numeric speed (not speedNA)
    for (const port of ap.ethPorts) {
      if (port && port.speed) {
        const parsed = parseSpeedString(port.speed);
        if (parsed.speedMbps !== null) {
          return {
            ...parsed,
            portName: port.name || 'eth',
            duplexMode: port.mode || port.duplex || ap.ethMode
          };
        }
      }
    }
  }

  // Fallback to ethSpeed field
  if (ap.ethSpeed) {
    const parsed = parseSpeedString(ap.ethSpeed);
    return { ...parsed, duplexMode: ap.ethMode };
  }

  return { speedMbps: null, speedDisplay: 'Unknown' };
}

/**
 * Determine expected ethernet speed based on AP model
 */
function getExpectedSpeed(model: string | undefined): number {
  if (!model) return 1000;

  const m = model.toUpperCase();

  // WiFi 6E / WiFi 7 APs - typically have 2.5Gbps or 5Gbps ports
  if (m.includes('AP6') || m.includes('AP7') || m.includes('635') || m.includes('655') ||
      m.includes('735') || m.includes('755') || m.includes('OAW-AP13') || m.includes('OAW-AP15') ||
      m.includes('5050')) {
    return 5000; // 5Gbps for WiFi 6E
  }

  // WiFi 6 APs - typically 1Gbps or 2.5Gbps
  if (m.includes('AP5') || m.includes('515') || m.includes('535') || m.includes('555') ||
      m.includes('OAW-AP12') || m.includes('OAW-AP11') || m.includes('5020')) {
    return 1000;
  }

  return 1000;
}

/**
 * Check if duplex mode indicates a problem
 */
function isDuplexIssue(duplexMode: string | undefined): boolean {
  if (!duplexMode) return false;
  const mode = duplexMode.toLowerCase();
  return mode.includes('half') || mode === 'halfduplex' || mode === 'half-duplex';
}

/**
 * Check if PoE status indicates a cable issue
 */
function getPoEIssue(ap: any): { hasIssue: boolean; description: string } | null {
  const powerStatus = ap.ethPowerStatus?.toLowerCase() || '';
  const powerMode = ap.powerMode?.toLowerCase() || '';
  const lowPower = ap.lowPower === true;

  if (lowPower || powerMode.includes('low') || powerMode.includes('reduced')) {
    return {
      hasIssue: true,
      description: 'AP running in low power mode - may indicate high cable resistance'
    };
  }

  if (powerStatus.includes('low') || powerStatus.includes('insufficient') ||
      powerStatus.includes('fault') || powerStatus.includes('error')) {
    return {
      hasIssue: true,
      description: `PoE issue detected: ${ap.ethPowerStatus}`
    };
  }

  return null;
}

/**
 * Analyze cable health for an AP using multiple indicators
 */
function analyzeCableHealth(apDetails: APDetails): CableHealthResult {
  const apAny = apDetails as any;
  const { speedMbps, speedDisplay, portName, duplexMode } = getActualEthSpeed(apAny);
  const expectedSpeedMbps = getExpectedSpeed(apDetails.model || apAny.hardwareType || apAny.platformName);
  const issues: CableIssue[] = [];

  if (speedMbps === null) {
    return {
      status: 'unknown',
      speedMbps: null,
      speedDisplay,
      expectedSpeedMbps,
      message: 'Ethernet speed not available',
      issues: [],
      duplexMode,
      portName
    };
  }

  // Issue 1: Critical speed degradation (10Mbps or less)
  if (speedMbps <= 10) {
    issues.push({
      type: 'speed_critical',
      severity: 'critical',
      description: `Critical: ${speedDisplay} link detected`,
      recommendation: 'Multiple cable pairs likely damaged. Replace the entire cable and check both RJ45 connectors for damage.'
    });
  }
  // Issue 2: Speed degradation (100Mbps when gigabit expected)
  else if (speedMbps <= 100 && speedMbps < expectedSpeedMbps) {
    issues.push({
      type: 'speed_degraded',
      severity: 'warning',
      description: `Speed degraded: ${speedDisplay} (expected ${expectedSpeedMbps >= 1000 ? `${expectedSpeedMbps/1000}Gbps` : `${expectedSpeedMbps}Mbps`})`,
      recommendation: 'Check blue pair (pins 4,5) and brown pair (pins 7,8) on both ends. These outer pairs are most commonly damaged and only needed for gigabit.'
    });
  }

  // Issue 3: Duplex mismatch
  if (isDuplexIssue(duplexMode)) {
    issues.push({
      type: 'duplex_mismatch',
      severity: 'warning',
      description: `Half duplex detected (${duplexMode})`,
      recommendation: 'Half duplex indicates cable quality issues or switch port misconfiguration. Check for cable damage, excessive length (>100m), or switch port settings.'
    });
  }

  // Issue 4: PoE/Power issues
  const poeIssue = getPoEIssue(apAny);
  if (poeIssue) {
    issues.push({
      type: 'poe_issue',
      severity: 'warning',
      description: poeIssue.description,
      recommendation: 'High cable resistance reduces power delivery. Check for corroded connectors, damaged cable, or excessive cable length.'
    });
  }

  // Issue 5: Low power mode
  if (apAny.lowPower === true && !poeIssue) {
    issues.push({
      type: 'low_power',
      severity: 'warning',
      description: 'AP operating in low power mode',
      recommendation: 'May be due to PoE budget constraints or cable resistance. Verify PoE source capacity and cable quality.'
    });
  }

  // Determine overall status
  let status: 'good' | 'warning' | 'critical' = 'good';
  if (issues.some(i => i.severity === 'critical')) {
    status = 'critical';
  } else if (issues.length > 0) {
    status = 'warning';
  }

  // Build message
  let message = '';
  if (issues.length === 0) {
    message = `${speedDisplay} - Link speed is good`;
  } else if (issues.length === 1) {
    message = issues[0].description;
  } else {
    message = `Multiple issues detected: ${issues.map(i => i.type.replace(/_/g, ' ')).join(', ')}`;
  }

  // Build AI insight from all issues
  let aiInsight = '';
  if (issues.length > 0) {
    if (issues.some(i => i.type === 'speed_critical')) {
      aiInsight = 'A 10Mbps negotiation typically indicates multiple damaged pairs. Check both ends of the cable for damage to the RJ45 connector. The blue pair (pins 4, 5) and brown pair (pins 7, 8) are most commonly damaged as they are the outer pairs. Consider replacing the cable entirely.';
    } else if (issues.some(i => i.type === 'speed_degraded')) {
      aiInsight = 'A 100Mbps negotiation on a gigabit-capable AP usually indicates a damaged pair in the cable. Gigabit Ethernet requires all 4 pairs, while 100Mbps only uses 2. Check the blue pair (pins 4, 5) or brown pair (pins 7, 8) on the RJ45 connector.';
    }

    if (issues.some(i => i.type === 'duplex_mismatch')) {
      aiInsight += (aiInsight ? ' Additionally, ' : '') + 'Half duplex negotiation suggests signal quality issues - possibly from cable damage, interference, or excessive length.';
    }

    if (issues.some(i => i.type === 'poe_issue' || i.type === 'low_power')) {
      aiInsight += (aiInsight ? ' ' : '') + 'Power delivery issues can indicate high cable resistance from corroded connections or damaged conductors.';
    }
  }

  return {
    status,
    speedMbps,
    speedDisplay,
    expectedSpeedMbps,
    message,
    aiInsight: aiInsight || undefined,
    issues,
    duplexMode,
    portName
  };
}

interface AccessPointDetailProps {
  serialNumber: string;
}

export function AccessPointDetail({ serialNumber }: AccessPointDetailProps) {
  const [apDetails, setApDetails] = useState<APDetails | null>(null);
  const [stations, setStations] = useState<APStation[]>([]);
  const [events, setEvents] = useState<APAlarm[]>([]);
  const [eventCategories, setEventCategories] = useState<APAlarmCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [, setTimeUpdateCounter] = useState(0);
  const [eventDuration, setEventDuration] = useState<number>(14);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [showEventsTimeline, setShowEventsTimeline] = useState(false);
  const [showInsightsFullScreen, setShowInsightsFullScreen] = useState(false);

  const loadApDetails = async () => {
    try {
      setIsLoading(true);
      const [details, stationsData] = await Promise.all([
        apiService.getAccessPointDetails(serialNumber),
        apiService.getAccessPointStations(serialNumber).catch(() => [])
      ]);

      // Enrich AP details with formatted uptime
      const enrichedDetails = {
        ...details,
        uptime: (details as any).sysUptime ? formatUptime((details as any).sysUptime) : details.uptime,
        // Calculate average channel utilization from all radios
        channelUtilization: details.radios && details.radios.length > 0
          ? Math.round(details.radios.reduce((sum, radio) => sum + (radio.channelUtilization || 0), 0) / details.radios.length)
          : details.channelUtilization
      };

      setApDetails(enrichedDetails);
      setStations(stationsData);
      setLastRefreshTime(new Date());

      // Load events in parallel (don't block the main details)
      loadEvents();
    } catch (error) {
      console.error('Failed to load AP details:', error);
      toast.error('Failed to load access point details');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      setIsLoadingEvents(true);
      const categories = await apiService.getAccessPointEvents(serialNumber, eventDuration);
      setEventCategories(categories);
      const flatEvents = apiService.flattenAPEvents(categories);
      setEvents(flatEvents);
    } catch (error) {
      console.error('Failed to load AP events:', error);
      // Don't show toast - events are optional
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadApDetails();
    setIsRefreshing(false);
    toast.success('Access point details refreshed');
  };

  useEffect(() => {
    loadApDetails();
  }, [serialNumber]);

  // Reload events when duration changes
  useEffect(() => {
    if (apDetails) {
      loadEvents();
    }
  }, [eventDuration]);

  // Auto-refresh polling
  useEffect(() => {
    const REFRESH_INTERVAL = 60000; // 60 seconds

    const intervalId = setInterval(() => {
      // Only auto-refresh if the page is visible
      if (document.visibilityState === 'visible') {
        console.log('Auto-refreshing AP detail data...');
        setIsAutoRefreshing(true);
        loadApDetails().finally(() => {
          setIsAutoRefreshing(false);
        });
      }
    }, REFRESH_INTERVAL);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [serialNumber]);

  // Pause polling when tab becomes inactive, resume when active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Tab became active, refreshing AP detail data...');
        loadApDetails();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [serialNumber]);

  // Force re-render every 10 seconds to update "time ago" text
  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimeUpdateCounter(prev => prev + 1);
    }, 10000);

    return () => clearInterval(intervalId);
  }, []);

  // Helper function to format time ago
  const getTimeAgo = () => {
    if (!lastRefreshTime) return 'Never';

    const seconds = Math.floor((new Date().getTime() - lastRefreshTime.getTime()) / 1000);

    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Helper function to format uptime from seconds
  const formatUptime = (seconds: number): string => {
    if (seconds === 0 || !seconds) return 'N/A';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 && days === 0 && hours === 0) parts.push(`${secs}s`);

    return parts.length > 0 ? parts.join(' ') : 'N/A';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!apDetails) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load access point details</p>
      </div>
    );
  }

  const getStatusBadgeVariant = (status?: string) => {
    if (!status) return 'secondary';
    const s = status.toLowerCase();
    if (s === 'online' || s === 'connected' || s === 'up' || s === 'in-service' || s === 'inservice') return 'default';
    if (s === 'offline' || s === 'disconnected' || s === 'down') return 'destructive';
    return 'secondary';
  };

  // Get badge variant for event severity
  const getEventBadgeVariant = (level?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (!level) return 'secondary';
    const l = level.toLowerCase();
    if (l === 'critical' || l === 'error') return 'destructive';
    if (l === 'major' || l === 'warning') return 'default';
    return 'secondary';
  };

  // Get icon for event category
  const getEventIcon = (category?: string, context?: string) => {
    const cat = (category || '').toLowerCase();
    const ctx = (context || '').toLowerCase();

    if (cat.includes('channel') || ctx.includes('channel')) return Radio;
    if (cat.includes('discovery') || ctx.includes('connect')) return Wifi;
    if (cat.includes('reboot') || ctx.includes('power')) return Power;
    if (cat.includes('upgrade')) return Download;
    if (cat.includes('alarm')) return AlertTriangle;
    return Info;
  };

  // Format event timestamp
  const formatEventTime = (ts: number): string => {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Calculate event summary stats
  const eventStats = {
    total: events.length,
    critical: events.filter(e => e.Level?.toLowerCase() === 'critical').length,
    major: events.filter(e => e.Level?.toLowerCase() === 'major').length,
    categories: [...new Set(events.map(e => e.Category))].length
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center space-x-2">
            <Wifi className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Access Point Details</span>
          </div>
          {lastRefreshTime && (
            <p className="text-xs text-muted-foreground mt-1 ml-7">
              Last updated: {getTimeAgo()}
              {isAutoRefreshing && (
                <span className="ml-2 inline-flex items-center">
                  <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  Auto-refreshing...
                </span>
              )}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || isAutoRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing || isAutoRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Status Overview */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl hover:scale-[1.01] transition-all duration-300 group">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-500 opacity-[0.08] group-hover:opacity-[0.12] transition-opacity" />
        <div className="absolute -right-6 -top-6 w-20 h-20 bg-violet-500/10 rounded-full blur-2xl group-hover:bg-violet-500/20 transition-all" />
        <CardHeader className="relative">
          <CardTitle className="flex items-center justify-between">
            <span>Status Overview</span>
            <Badge variant={getStatusBadgeVariant(apDetails.status)}>
              {apDetails.status || 'Unknown'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 relative">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 shadow-md group-hover:scale-110 transition-transform">
                <Users className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Connected Clients</p>
                <p className="text-lg font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">{stations.length}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 shadow-md group-hover:scale-110 transition-transform">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Uptime</p>
                <p className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">{apDetails.uptime || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md group-hover:scale-110 transition-transform">
                <Wifi className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Active Radios</p>
                <p className="text-lg font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">{apDetails.radios?.filter(r => r.adminState).length || 0}/{apDetails.radios?.length || 0}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md group-hover:scale-110 transition-transform">
                <Signal className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Modes</p>
                <p className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">{apDetails.radios?.map(r => r.mode.toUpperCase()).join(', ') || 'N/A'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-4 w-4" />
            <span>Device Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Display Name:</span>
              <span className="font-medium">{apDetails.apName || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Serial Number:</span>
              <span className="font-mono text-xs">{apDetails.serialNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model:</span>
              <span className="font-medium">{apDetails.model || apDetails.hardwareType || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">MAC Address:</span>
              <span className="font-mono text-xs">{apDetails.macAddress || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IP Address:</span>
              <span className="font-mono text-xs">{apDetails.ipAddress || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Firmware:</span>
              <span className="font-medium">{apDetails.softwareVersion || 'N/A'}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Site:</span>
              <span className="font-medium">{apDetails.hostSite || 'N/A'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ethernet Status */}
      {(() => {
        const cableHealth = analyzeCableHealth(apDetails);
        const apAny = apDetails as any;
        const hasEthData = apAny.ethSpeed || apAny.ethMode || apAny.ethPowerStatus;

        if (!hasEthData && cableHealth.status === 'unknown') return null;

        return (
          <Card className={cableHealth.status === 'critical' ? 'border-red-500/50' : cableHealth.status === 'warning' ? 'border-amber-500/50' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Cable className="h-4 w-4" />
                  <span>Ethernet Status</span>
                </div>
                {cableHealth.status === 'good' && (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Good
                  </Badge>
                )}
                {cableHealth.status === 'warning' && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Check Cable
                  </Badge>
                )}
                {cableHealth.status === 'critical' && (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Bad Cable
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Link Speed:</span>
                  <span className={`font-medium ${cableHealth.status === 'critical' ? 'text-red-500' : cableHealth.status === 'warning' ? 'text-amber-500' : ''}`}>
                    {cableHealth.speedDisplay || 'N/A'}
                  </span>
                </div>
                {apAny.ethPorts && (() => {
                  // Find the port with valid speed (same logic as getActualEthSpeed)
                  const activePort = apAny.ethPorts.find((p: any) => {
                    if (!p?.speed) return false;
                    const s = String(p.speed).toLowerCase();
                    return s !== 'speedna' && s !== 'na';
                  }) || apAny.ethPorts[0];
                  return activePort?.mode ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duplex Mode ({activePort.name || 'eth'}):</span>
                      <span className="font-medium">{activePort.mode}</span>
                    </div>
                  ) : null;
                })()}
                {apAny.ethPowerStatus && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PoE Status:</span>
                    <span className="font-medium">{apAny.ethPowerStatus}</span>
                  </div>
                )}
                {cableHealth.status !== 'unknown' && cableHealth.expectedSpeedMbps && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expected Speed:</span>
                    <span className="font-medium">
                      {cableHealth.expectedSpeedMbps >= 1000
                        ? `${cableHealth.expectedSpeedMbps / 1000}Gbps`
                        : `${cableHealth.expectedSpeedMbps}Mbps`}
                    </span>
                  </div>
                )}
              </div>

              {/* Cable Health Warning */}
              {(cableHealth.status === 'warning' || cableHealth.status === 'critical') && (
                <div className={`p-3 rounded-lg ${cableHealth.status === 'critical' ? 'bg-red-500/10 border border-red-500/30' : 'bg-amber-500/10 border border-amber-500/30'}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`h-4 w-4 mt-0.5 ${cableHealth.status === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                    <div className="space-y-2">
                      <p className={`text-sm font-medium ${cableHealth.status === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>
                        {cableHealth.message}
                      </p>
                      {cableHealth.aiInsight && (
                        <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded border border-border">
                          <div className="flex items-center gap-1 mb-1">
                            <Info className="h-3 w-3" />
                            <span className="font-medium">AI Insight</span>
                          </div>
                          <p>{cableHealth.aiInsight}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Radio Configuration */}
      {apDetails.radios && apDetails.radios.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Signal className="h-4 w-4" />
              <span>Radio Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {apDetails.radios.map((radio, index) => (
              <div key={radio.radioIndex || index} className="p-4 border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{radio.radioName}</span>
                  </div>
                  <Badge variant={radio.adminState ? 'default' : 'secondary'}>
                    {radio.adminState ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel:</span>
                    <span className="font-medium">{radio.reqChannel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mode:</span>
                    <span className="font-medium">{radio.mode.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel Width:</span>
                    <span className="font-medium">{radio.channelwidth.replace('Ch1Width_', '').replace('MHz', ' MHz')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max TX Power:</span>
                    <span className="font-medium">{radio.txMaxPower} dBm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Smart RF:</span>
                    <span className="font-medium">{radio.useSmartRf ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Radio Index:</span>
                    <span className="font-medium">{radio.radioIndex}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* AP Insights */}
      <APInsights
        serialNumber={serialNumber}
        apName={apDetails.apName || 'Unknown AP'}
        onOpenFullScreen={() => setShowInsightsFullScreen(true)}
      />

      {/* Events Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4" />
              <span>Events</span>
              {events.length > 0 && (
                <Badge variant="secondary" className="ml-2">{events.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(eventDuration)}
                onValueChange={(val) => setEventDuration(parseInt(val))}
              >
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24 Hours</SelectItem>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="14">Last 14 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
              {events.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEventsTimeline(true)}
                  className="h-8 px-2 flex items-center gap-1.5 text-xs"
                  title="View Events Timeline"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Timeline
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEvents(!showEvents)}
                className="h-8 px-2"
              >
                {showEvents ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        {showEvents && (
          <CardContent>
            {isLoadingEvents ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No events in the last {eventDuration} days
                </p>
              </div>
            ) : (
              <>
                {/* Event Summary Stats */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="p-2 bg-muted/30 rounded-lg text-center">
                    <p className="text-lg font-semibold">{eventStats.total}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                  </div>
                  <div className="p-2 bg-destructive/10 rounded-lg text-center">
                    <p className="text-lg font-semibold text-destructive">{eventStats.critical}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Critical</p>
                  </div>
                  <div className="p-2 bg-amber-500/10 rounded-lg text-center">
                    <p className="text-lg font-semibold text-amber-500">{eventStats.major}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Major</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded-lg text-center">
                    <p className="text-lg font-semibold">{eventStats.categories}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">Categories</p>
                  </div>
                </div>

                {/* Event List */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {events.slice(0, 20).map((event, index) => {
                    const EventIcon = getEventIcon(event.Category, event.Context);
                    const eventKey = `${event.ts}-${event.Id}-${index}`;
                    const isExpanded = expandedEventId === eventKey;

                    return (
                      <div
                        key={eventKey}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          isExpanded ? 'bg-muted/50 border-primary/30' : 'hover:bg-muted/30'
                        }`}
                        onClick={() => setExpandedEventId(isExpanded ? null : eventKey)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-md ${
                            event.Level?.toLowerCase() === 'critical'
                              ? 'bg-destructive/10'
                              : event.Level?.toLowerCase() === 'major'
                              ? 'bg-amber-500/10'
                              : 'bg-muted'
                          }`}>
                            <EventIcon className={`h-4 w-4 ${
                              event.Level?.toLowerCase() === 'critical'
                                ? 'text-destructive'
                                : event.Level?.toLowerCase() === 'major'
                                ? 'text-amber-500'
                                : 'text-muted-foreground'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={getEventBadgeVariant(event.Level)} className="text-[10px] px-1.5 py-0">
                                {event.Level || 'Info'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {event.Category}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatEventTime(event.ts)}
                              </span>
                            </div>
                            <p className="text-sm truncate">
                              {event.log}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Time:</span>
                                <span className="ml-2 font-medium">{formatEventTime(event.ts)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Type:</span>
                                <span className="ml-2 font-medium">{event.Level}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Category:</span>
                                <span className="ml-2 font-medium">{event.Category}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Context:</span>
                                <span className="ml-2 font-medium">{event.Context}</span>
                              </div>
                              {event.ApName && (
                                <div>
                                  <span className="text-muted-foreground">AP Name:</span>
                                  <span className="ml-2 font-medium">{event.ApName}</span>
                                </div>
                              )}
                              {event.Id && (
                                <div>
                                  <span className="text-muted-foreground">Event ID:</span>
                                  <span className="ml-2 font-medium">{event.Id}</span>
                                </div>
                              )}
                            </div>
                            <div className="pt-2">
                              <span className="text-muted-foreground text-xs">Message:</span>
                              <p className="mt-1 text-sm bg-muted/30 p-2 rounded">
                                {event.log}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {events.length > 20 && (
                    <div className="text-center py-2">
                      <p className="text-xs text-muted-foreground">
                        Showing 20 of {events.length} events
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Performance Metrics */}
      {(apDetails.cpuUsage !== undefined || apDetails.memoryUsage !== undefined || apDetails.channelUtilization !== undefined) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Cpu className="h-4 w-4" />
              <span>Performance Metrics</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {apDetails.cpuUsage !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">CPU Usage:</span>
                <span className="font-medium">{apDetails.cpuUsage}%</span>
              </div>
            )}
            {apDetails.memoryUsage !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Memory Usage:</span>
                <span className="font-medium">{apDetails.memoryUsage}%</span>
              </div>
            )}
            {apDetails.channelUtilization !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Channel Utilization:</span>
                <span className="font-medium">{apDetails.channelUtilization}%</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Connected Clients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Connected Clients</span>
            </div>
            <Badge variant="secondary">{stations.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No clients currently connected
            </p>
          ) : (
            <div className="space-y-3">
              {stations.slice(0, 10).map((station, index) => (
                <div key={station.macAddress || index} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {station.hostName || station.macAddress || 'Unknown Client'}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {station.macAddress}
                    </p>
                  </div>
                  <div className="text-right">
                    {station.signalStrength && (
                      <p className="text-xs text-muted-foreground">
                        {station.signalStrength} dBm
                      </p>
                    )}
                    {station.dataRate && (
                      <p className="text-xs text-muted-foreground">
                        {station.dataRate}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {stations.length > 10 && (
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">
                    ... and {stations.length - 10} more clients
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Management Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Management Actions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={async () => {
                try {
                  await apiService.rebootAP(serialNumber);
                  toast.success('Access point reboot initiated');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to reboot access point');
                }
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reboot Access Point
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={() => {
                // Open AP configuration in detail view
                toast.info('Configuration settings coming soon');
              }}
            >
              <Settings className="h-4 w-4 mr-2" />
              Configure Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={() => setShowEventsTimeline(true)}
            >
              <Activity className="h-4 w-4 mr-2" />
              View Performance Logs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Full-Screen AP Events Timeline */}
      {showEventsTimeline && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="border-b bg-background px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEventsTimeline(false)}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <div>
                  <h2 className="text-lg font-semibold">AP Events Timeline</h2>
                  <p className="text-sm text-muted-foreground">
                    {apDetails.apName} ({serialNumber})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={String(eventDuration)}
                  onValueChange={(val) => setEventDuration(parseInt(val))}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <Clock className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 24 Hours</SelectItem>
                    <SelectItem value="7">Last 7 Days</SelectItem>
                    <SelectItem value="14">Last 14 Days</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Timeline Content */}
            <div className="flex-1 overflow-hidden">
              <APEventsTimeline
                events={events}
                categories={eventCategories}
                apName={apDetails.apName || 'Unknown AP'}
                serialNumber={serialNumber}
                onRefresh={loadEvents}
                isLoading={isLoadingEvents}
              />
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen AP Insights */}
      {showInsightsFullScreen && (
        <APInsightsFullScreen
          serialNumber={serialNumber}
          apName={apDetails.apName || 'Unknown AP'}
          onClose={() => setShowInsightsFullScreen(false)}
        />
      )}
    </div>
  );
}