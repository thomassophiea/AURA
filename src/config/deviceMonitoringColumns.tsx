/**
 * Device Monitoring & Traffic Analytics Table Column Configuration
 *
 * Defines all available columns for the Device Monitoring table.
 * Used with useTableCustomization hook for column management.
 *
 * Columns are organized by category:
 * - basic: Core identification columns (status, hostname, mac, ip)
 * - network: Network-related columns (site, network, AP info)
 * - connection: Connection details (band, signal, channel, protocol)
 * - performance: Traffic and performance metrics
 * - advanced: Additional device and technical details
 */

import { ColumnConfig } from '@/types/table';
import { Station } from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Clock,
  MapPin,
  Star,
  Wifi,
  Radio,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SignalZero,
  WifiOff,
  Cable,
  Shuffle,
  ArrowDown,
  ArrowUp,
  Info,
} from 'lucide-react';
import { isRandomizedMac } from '@/services/macAddressUtils';
import { resolveClientIdentity } from '@/lib/clientIdentity';

// Re-export Station type for component use
export type { Station };

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format large numbers compactly
 */
function formatCompactNumber(num: number | undefined): string {
  if (!num) return '0';
  if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Get band info from radio ID
 */
function getBandFromRadioId(radioId: number | undefined) {
  switch (radioId) {
    case 1:
      return { band: '2.4 GHz', color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
    case 2:
      return { band: '5 GHz', color: 'text-green-500', bgColor: 'bg-green-500/10' };
    case 3:
      return { band: '6 GHz', color: 'text-purple-500', bgColor: 'bg-purple-500/10' };
    case 20:
      return { band: 'Eth1 Wired', color: 'text-orange-500', bgColor: 'bg-orange-500/10' };
    default:
      return { band: 'Unknown', color: 'text-muted-foreground', bgColor: 'bg-muted/10' };
  }
}

/**
 * Get signal strength indicator
 */
function getSignalStrengthIndicator(rss: number | undefined, radioId: number | undefined) {
  // Handle wired connections (radioId 20 = Eth1 Wired)
  if (radioId === 20) {
    return {
      icon: Cable,
      color: 'text-blue-500',
      label: 'Wired',
      quality: 'Ethernet',
      bgColor: 'bg-blue-500/10',
    };
  }

  // Handle wireless connections without signal data
  if (rss === undefined || rss === null) {
    return {
      icon: WifiOff,
      color: 'text-muted-foreground',
      label: 'No Signal',
      quality: 'No Data',
      bgColor: 'bg-muted/10',
    };
  }

  // RSSI is typically negative, closer to 0 is better (wireless only)
  if (rss >= -30) {
    return {
      icon: Signal,
      color: 'text-green-500',
      label: `${rss} dBm`,
      quality: 'Excellent',
      bgColor: 'bg-green-500/10',
    };
  } else if (rss >= -50) {
    return {
      icon: SignalHigh,
      color: 'text-green-500',
      label: `${rss} dBm`,
      quality: 'Very Good',
      bgColor: 'bg-green-500/10',
    };
  } else if (rss >= -60) {
    return {
      icon: SignalMedium,
      color: 'text-blue-500',
      label: `${rss} dBm`,
      quality: 'Good',
      bgColor: 'bg-blue-500/10',
    };
  } else if (rss >= -70) {
    return {
      icon: SignalLow,
      color: 'text-orange-500',
      label: `${rss} dBm`,
      quality: 'Fair',
      bgColor: 'bg-orange-500/10',
    };
  } else {
    return {
      icon: SignalZero,
      color: 'text-red-500',
      label: `${rss} dBm`,
      quality: 'Poor',
      bgColor: 'bg-red-500/10',
    };
  }
}

/**
 * Get status badge variant
 */
function getStatusBadgeVariant(status: string) {
  switch (status?.toLowerCase()) {
    case 'connected':
    case 'associated':
    case 'active':
      return 'default';
    case 'disconnected':
    case 'inactive':
      return 'destructive';
    case 'idle':
    case 'low':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Format last seen timestamp
 */
function formatLastSeen(lastSeenTimestamp: string | undefined): string | null {
  if (!lastSeenTimestamp) return null;

  try {
    const lastSeenDate = new Date(lastSeenTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - lastSeenDate.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hr${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

    return lastSeenDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: diffDays > 365 ? 'numeric' : undefined,
    });
  } catch {
    return lastSeenTimestamp;
  }
}

// Extended Station type with traffic data
export interface StationWithTraffic extends Station {
  trafficData?: {
    inBytes?: number;
    outBytes?: number;
    rss?: number;
    inPackets?: number;
    outPackets?: number;
  };
}

/**
 * Column configurations for Device Monitoring & Traffic Analytics table
 */
export const DEVICE_MONITORING_COLUMNS: ColumnConfig<StationWithTraffic>[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC COLUMNS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'status',
    label: 'Status',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'status',
    defaultVisible: true,
    lockVisible: true,
    sortable: true,
    tooltip: 'Connection status and last seen time',
    renderCell: (station) => {
      return (
        <div className="flex flex-col gap-0.5 items-start">
          {station.status ? (
            <Badge
              variant={getStatusBadgeVariant(station.status)}
              className="text-xs px-1.5 py-0 h-4 font-medium uppercase tracking-wide"
            >
              {station.status}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {station.status?.toLowerCase() === 'disconnected' && station.lastSeen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="text-xs leading-none">{formatLastSeen(station.lastSeen)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Last seen: {new Date(station.lastSeen).toLocaleString()}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
  },

  {
    key: 'hostname',
    label: 'Hostname',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'hostName',
    defaultVisible: true,
    sortable: true,
    tooltip: 'Device hostname or identifier',
    renderCell: (station) => {
      const identity = resolveClientIdentity(station);
      const isDerived = identity.identitySource === 'derived_label';
      return (
        <div className="flex items-center gap-1.5 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`text-xs leading-tight cursor-help truncate ${
                  isDerived ? 'text-muted-foreground italic' : 'font-medium text-foreground'
                }`}
              >
                {identity.displayName}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-medium">{identity.displayName}</p>
                {identity.deviceType && <p>{identity.deviceType}</p>}
                {identity.manufacturer && (
                  <p className="text-muted-foreground">{identity.manufacturer}</p>
                )}
                {isDerived && (
                  <p className="text-xs text-muted-foreground italic">
                    Derived from OUI vendor lookup
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
          {!identity.isResolved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Identity not resolved - showing derived label</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
  },

  {
    key: 'macAddress',
    label: 'MAC Address',
    category: 'basic',
    dataType: 'mac_address',
    fieldPath: 'macAddress',
    defaultVisible: true,
    sortable: true,
    tooltip: 'Hardware MAC address',
    renderCell: (station) => {
      return (
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs leading-tight cursor-help">
                {station.macAddress || '—'}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-mono">{station.macAddress}</p>
              {isRandomizedMac(station.macAddress) && (
                <p className="text-purple-500 mt-1">Randomized MAC Address</p>
              )}
            </TooltipContent>
          </Tooltip>
          {isRandomizedMac(station.macAddress) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Shuffle className="h-3 w-3 text-purple-500 flex-shrink-0" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">Randomized MAC Address</p>
                <p>Privacy feature - prevents device tracking</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
  },

  {
    key: 'ipAddress',
    label: 'IP Address',
    category: 'basic',
    dataType: 'ip_address',
    fieldPath: 'ipAddress',
    defaultVisible: true,
    sortable: true,
    tooltip: 'IPv4 address',
    renderCell: (station) => (
      <span className="font-mono text-xs leading-tight">{station.ipAddress || '—'}</span>
    ),
  },

  {
    key: 'ipv6Address',
    label: 'IPv6 Address',
    category: 'basic',
    dataType: 'ip_address',
    fieldPath: 'ipv6Address',
    defaultVisible: false,
    sortable: true,
    tooltip: 'IPv6 address',
    renderCell: (station) => (
      <span className="font-mono text-xs leading-tight truncate max-w-[200px]">
        {station.ipv6Address || '—'}
      </span>
    ),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK COLUMNS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'siteName',
    label: 'Site Name',
    category: 'network',
    dataType: 'string',
    fieldPath: 'siteName',
    defaultVisible: true,
    sortable: true,
    tooltip: 'Network site location',
    renderCell: (station) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs truncate leading-tight">{station.siteName || '—'}</span>
            {station.siteRating !== undefined && (
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <Star className="h-3 w-3 text-amber-500" />
                <span className="text-xs leading-none">{station.siteRating}</span>
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{station.siteName || '—'}</p>
        </TooltipContent>
      </Tooltip>
    ),
  },

  {
    key: 'network',
    label: 'Network',
    category: 'network',
    dataType: 'string',
    fieldPath: 'network',
    defaultVisible: true,
    sortable: true,
    tooltip: 'SSID/Network name',
    renderCell: (station) => {
      const networkName = station.ssid || station.network;
      if (!networkName) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 min-w-0">
              <Wifi className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium truncate leading-tight">{networkName}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Network: {networkName}</p>
            {station.role && <p className="text-muted-foreground">Role: {station.role}</p>}
          </TooltipContent>
        </Tooltip>
      );
    },
  },

  {
    key: 'username',
    label: 'Username',
    category: 'network',
    dataType: 'string',
    fieldPath: 'username',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Authenticated username',
    renderCell: (station) => <span className="text-xs">{station.username || '—'}</span>,
  },

  {
    key: 'role',
    label: 'Role',
    category: 'network',
    dataType: 'string',
    fieldPath: 'role',
    defaultVisible: false,
    sortable: true,
    tooltip: 'User/device role',
    renderCell: (station) => <span className="text-xs">{station.role || '—'}</span>,
  },

  {
    key: 'apName',
    label: 'AP Name',
    category: 'network',
    dataType: 'string',
    fieldPath: 'apName',
    defaultVisible: true,
    sortable: true,
    tooltip: 'Access Point name',
    renderCell: (station) => {
      const apLabel =
        station.apName || station.apDisplayName || station.apHostname || station.accessPointName;
      const lastSeenLabel = formatLastSeen(station.lastSeen);
      return (
        <div className="flex flex-col gap-0.5 min-w-0">
          {apLabel && (
            <div className="text-xs font-medium leading-tight truncate text-foreground">
              {apLabel}
            </div>
          )}
          {station.apSerial && (
            <div className="font-mono text-xs text-muted-foreground truncate leading-tight">
              {station.apSerial}
            </div>
          )}
          {lastSeenLabel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="text-xs leading-none">{lastSeenLabel}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Last seen: {new Date(station.lastSeen!).toLocaleString()}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
  },

  {
    key: 'apSerial',
    label: 'AP Serial',
    category: 'network',
    dataType: 'string',
    fieldPath: 'apSerial',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Access Point serial number',
    renderCell: (station) => (
      <code className="text-xs font-mono">{station.apSerial || station.apSerialNumber || '—'}</code>
    ),
  },

  {
    key: 'lastSeen',
    label: 'Last Seen',
    category: 'network',
    dataType: 'datetime',
    fieldPath: 'lastSeen',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Last activity timestamp',
    renderCell: (station) => {
      const label = formatLastSeen(station.lastSeen);
      if (!label) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs cursor-help">{label}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{new Date(station.lastSeen!).toLocaleString()}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION COLUMNS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'band',
    label: 'Band',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'radioId',
    defaultVisible: true,
    sortable: true,
    tooltip: 'Radio frequency band',
    renderCell: (station) => {
      const bandInfo = getBandFromRadioId(station.radioId || station.radio);
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${bandInfo.bgColor}`}
            >
              <Radio className={`h-3 w-3 ${bandInfo.color}`} />
              <span className={`text-xs font-medium leading-none ${bandInfo.color}`}>
                {bandInfo.band}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Radio Band: {bandInfo.band}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  },

  {
    key: 'rss',
    label: 'RSS (dBm)',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'rss',
    defaultVisible: true,
    sortable: true,
    tooltip: 'Received Signal Strength in dBm',
    renderCell: (station) => {
      const rssValue = station.trafficData?.rss ?? station.rss ?? station.signalStrength;
      const radioId = station.radioId || station.radio;
      const signalInfo = getSignalStrengthIndicator(rssValue, radioId);
      const SignalIcon = signalInfo.icon;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${signalInfo.bgColor}`}
            >
              <SignalIcon className={`h-3 w-3 ${signalInfo.color}`} />
              <span className={`text-xs font-medium leading-none ${signalInfo.color}`}>
                {radioId === 20 ? signalInfo.label : rssValue !== undefined ? `${rssValue}` : '—'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-center">
              <p className="font-medium">{signalInfo.quality}</p>
              <p className="text-muted-foreground">
                {radioId === 20
                  ? 'Physical ethernet connection'
                  : rssValue !== undefined
                    ? `${rssValue} dBm`
                    : 'No signal data'}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    },
  },

  {
    key: 'channel',
    label: 'Channel',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'channel',
    defaultVisible: false,
    sortable: true,
    tooltip: 'WiFi channel number',
    renderCell: (station) => (
      <span className="text-xs">{station.channel || station.radioChannel || '—'}</span>
    ),
  },

  {
    key: 'protocol',
    label: 'Protocol',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'protocol',
    defaultVisible: false,
    sortable: true,
    tooltip: 'WiFi protocol (802.11ax, etc.)',
    renderCell: (station) => <span className="text-xs">{station.protocol || '—'}</span>,
  },

  {
    key: 'capabilities',
    label: 'Capabilities',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'capabilities',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Device capabilities (RRM, WPA2, etc.)',
    renderCell: (station) => (
      <span className="text-xs truncate max-w-[200px]">{station.capabilities || '—'}</span>
    ),
  },

  {
    key: 'rxRate',
    label: 'Rx Rate',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'rxRate',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Receive data rate',
    renderCell: (station) => <span className="text-xs">{station.rxRate || '—'}</span>,
  },

  {
    key: 'txRate',
    label: 'Tx Rate',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'txRate',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Transmit data rate',
    renderCell: (station) => <span className="text-xs">{station.txRate || '—'}</span>,
  },

  {
    key: 'spatialStreams',
    label: 'Spatial Streams',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'spatialStreams',
    defaultVisible: false,
    sortable: true,
    tooltip: 'MIMO spatial streams (e.g., 2x2)',
    renderCell: (station) => <span className="text-xs">{station.spatialStreams || '—'}</span>,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE COLUMNS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'traffic',
    label: 'Traffic',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'inBytes',
    defaultVisible: true,
    sortable: true,
    tooltip: 'Combined In/Out traffic',
    renderCell: (station) => {
      const trafficData = station.trafficData;
      const inBytes = trafficData?.inBytes || station.inBytes || station.rxBytes || 0;
      const outBytes = trafficData?.outBytes || station.outBytes || station.txBytes || 0;

      if (!inBytes && !outBytes) {
        return <span className="text-xs text-muted-foreground">No data</span>;
      }

      return (
        <div className="flex flex-col justify-center gap-1 leading-none">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <ArrowDown className="h-3 w-3 text-green-500 flex-shrink-0" strokeWidth={2.5} />
                <span className="text-xs text-green-500 font-medium">{formatBytes(inBytes)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Inbound: {formatBytes(inBytes)}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5">
                <ArrowUp className="h-3 w-3 text-blue-500 flex-shrink-0" strokeWidth={2.5} />
                <span className="text-xs text-blue-500 font-medium">{formatBytes(outBytes)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Outbound: {formatBytes(outBytes)}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      );
    },
  },

  {
    key: 'inBytes',
    label: 'In Bytes',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'inBytes',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Total bytes received',
    renderCell: (station) => {
      const inBytes = station.trafficData?.inBytes || station.inBytes || station.rxBytes || 0;
      return <span className="text-xs">{formatBytes(inBytes)}</span>;
    },
  },

  {
    key: 'outBytes',
    label: 'Out Bytes',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'outBytes',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Total bytes transmitted',
    renderCell: (station) => {
      const outBytes = station.trafficData?.outBytes || station.outBytes || station.txBytes || 0;
      return <span className="text-xs">{formatBytes(outBytes)}</span>;
    },
  },

  {
    key: 'inPackets',
    label: 'In Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'inPackets',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Total packets received',
    renderCell: (station) => {
      const packets = station.trafficData?.inPackets || station.inPackets || 0;
      return <span className="text-xs">{formatCompactNumber(packets)}</span>;
    },
  },

  {
    key: 'outPackets',
    label: 'Out Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'outPackets',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Total packets transmitted',
    renderCell: (station) => {
      const packets = station.trafficData?.outPackets || station.outPackets || 0;
      return <span className="text-xs">{formatCompactNumber(packets)}</span>;
    },
  },

  {
    key: 'dlLostRetriesPackets',
    label: 'Dl Lost Retries Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'dlLostRetriesPackets',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Downlink lost/retried packets',
    renderCell: (station) => (
      <span className="text-xs">{formatCompactNumber(station.dlLostRetriesPackets) || '0'}</span>
    ),
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED COLUMNS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    key: 'deviceType',
    label: 'Device Type',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'deviceType',
    defaultVisible: true,
    sortable: true,
    tooltip: 'Type of device',
    renderCell: (station) => {
      if (station.deviceType) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs h-4 px-1.5 py-0 max-w-[200px]">
                <span className="truncate">{station.deviceType}</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{station.deviceType}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
      return <span className="text-xs text-muted-foreground">—</span>;
    },
  },

  {
    key: 'manufacturer',
    label: 'Manufacturer',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'manufacturer',
    defaultVisible: false,
    sortable: true,
    tooltip: 'Device manufacturer',
    renderCell: (station) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground leading-tight truncate max-w-[200px] block">
            {station.manufacturer || '—'}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{station.manufacturer || '—'}</p>
        </TooltipContent>
      </Tooltip>
    ),
  },

  {
    key: 'vlan',
    label: 'VLAN',
    category: 'advanced',
    dataType: 'number',
    fieldPath: 'vlan',
    defaultVisible: false,
    sortable: true,
    tooltip: 'VLAN ID',
    renderCell: (station) => (
      <span className="text-xs">{station.vlan || station.vlanId || '—'}</span>
    ),
  },
];

/**
 * Get default visible columns
 */
export function getDefaultVisibleColumns(): string[] {
  return DEVICE_MONITORING_COLUMNS.filter((col) => col.defaultVisible).map((col) => col.key);
}

/**
 * Get columns by category
 */
export function getColumnsByCategory(category: string): ColumnConfig<StationWithTraffic>[] {
  return DEVICE_MONITORING_COLUMNS.filter((col) => col.category === category);
}
