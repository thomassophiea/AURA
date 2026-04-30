/**
 * Clients Table Column Configuration
 *
 * Defines all available columns for the Connected Clients table
 * Used with useTableCustomization hook for column management
 *
 * This configuration migrates the existing AVAILABLE_COLUMNS array
 * to the universal table customization framework.
 */

import { ColumnConfig } from '@/types/table';
import { Station } from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { formatCompactNumber } from '@/lib/units';
import {
  CheckCircle,
  AlertCircle,
  WifiOff,
  SignalHigh,
  SignalMedium,
  SignalLow,
} from 'lucide-react';

// Re-export Station type for component use
export type { Station };

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Get signal strength indicator
 */
function getSignalIndicator(rssi?: number) {
  if (!rssi) return <SignalLow className="h-4 w-4 text-muted-foreground" />;

  if (rssi >= -50) return <SignalHigh className="h-4 w-4 text-[color:var(--status-success)]" />;
  if (rssi >= -60) return <SignalHigh className="h-4 w-4 text-[color:var(--status-warning)]" />;
  if (rssi >= -70) return <SignalMedium className="h-4 w-4 text-[color:var(--status-error)]" />;
  return <SignalLow className="h-4 w-4 text-[color:var(--status-error)]" />;
}

/**
 * Column configurations for Connected Clients table
 */
export const CLIENTS_TABLE_COLUMNS: ColumnConfig<Station>[] = [
  // Basic columns
  {
    key: 'status',
    label: 'Status / Last Seen',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'status',
    defaultVisible: true,
    sortable: true,
    renderCell: (station) => {
      const isOnline =
        station.status?.toLowerCase() === 'online' ||
        station.status?.toLowerCase() === 'connected' ||
        station.status?.toLowerCase() === 'associated' ||
        station.status?.toLowerCase() === 'active';
      return (
        <div className="flex items-center gap-2">
          <Badge
            variant={isOnline ? 'default' : 'secondary'}
            className={
              isOnline
                ? 'bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500/20 text-[10px] h-4 px-1.5 py-0 uppercase tracking-wide'
                : 'bg-muted text-muted-foreground text-[10px] h-4 px-1.5 py-0 uppercase tracking-wide'
            }
          >
            {station.status || 'Unknown'}
          </Badge>
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
    renderCell: (station) => {
      const hostname = station.hostName || (station as any).hostname;
      if (!hostname) return <span className="text-[11px] text-muted-foreground">—</span>;
      return (
        <div
          className="text-xs font-medium text-foreground max-w-[200px] truncate leading-snug"
          title={hostname}
        >
          {hostname}
        </div>
      );
    },
  },

  {
    key: 'clientInfo',
    label: 'MAC Address',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'macAddress',
    defaultVisible: true,
    sortable: true,
    renderCell: (station) => (
      <code className="font-mono text-[11px] text-foreground tracking-tight">
        {station.macAddress || '—'}
      </code>
    ),
  },

  {
    key: 'deviceInfo',
    label: 'Device',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'manufacturer',
    defaultVisible: true,
    sortable: true,
    renderCell: (station) => {
      const label = station.manufacturer || (station as any).deviceType;
      if (!label) return <span className="text-[11px] text-muted-foreground">—</span>;
      return (
        <div className="max-w-[200px] truncate text-xs" title={label}>
          {label}
        </div>
      );
    },
  },

  // Network columns
  {
    key: 'userNetwork',
    label: 'User & Network',
    category: 'network',
    dataType: 'string',
    fieldPath: 'username',
    defaultVisible: true,
    sortable: true,
    renderCell: (station) => {
      const user = station.username;
      const net = (station as any).networkName || (station as any).ssid;
      if (!user && !net) {
        return <span className="text-[11px] text-muted-foreground">—</span>;
      }
      return (
        <div className="flex flex-col gap-0.5 leading-snug max-w-[200px]">
          {user && (
            <span className="truncate text-xs text-foreground font-medium" title={user}>
              {user}
            </span>
          )}
          {net && (
            <span className="truncate text-[11px] text-muted-foreground" title={net}>
              {net}
            </span>
          )}
        </div>
      );
    },
  },

  {
    key: 'accessPoint',
    label: 'Access Point',
    category: 'network',
    dataType: 'string',
    fieldPath: 'apName',
    defaultVisible: true,
    sortable: true,
    renderCell: (station) => {
      const name = station.apName || (station as any).apDisplayName;
      if (!name) return <span className="text-[11px] text-muted-foreground">—</span>;
      return (
        <div className="max-w-[200px] truncate text-xs text-foreground" title={name}>
          {name}
        </div>
      );
    },
  },

  {
    key: 'siteName',
    label: 'Site Name',
    category: 'network',
    dataType: 'string',
    fieldPath: 'siteName',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => {
      const name = (station as any).siteName;
      if (!name) return <span className="text-[11px] text-muted-foreground">—</span>;
      return (
        <div className="max-w-[200px] truncate text-xs" title={name}>
          {name}
        </div>
      );
    },
  },

  {
    key: 'network',
    label: 'Network',
    category: 'network',
    dataType: 'string',
    fieldPath: 'networkName',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <span className="text-xs">{station.networkName || station.ssid || '—'}</span>
    ),
  },

  {
    key: 'role',
    label: 'Role',
    category: 'network',
    dataType: 'string',
    fieldPath: 'role',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.role || '—'}</span>,
  },

  {
    key: 'username',
    label: 'Username',
    category: 'network',
    dataType: 'string',
    fieldPath: 'username',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.username || '—'}</span>,
  },

  // Connection columns
  {
    key: 'band',
    label: 'Band',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'band',
    defaultVisible: true,
    sortable: true,
    renderCell: (station) => {
      const band = station.band || station.radioBand;
      return (
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
          {band || '—'}
        </Badge>
      );
    },
  },

  {
    key: 'signal',
    label: 'Signal',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'rssi',
    defaultVisible: true,
    sortable: true,
    renderCell: (station) => {
      return (
        <div className="flex items-center gap-1.5">
          {getSignalIndicator(station.rssi)}
          <span className="text-xs">{station.rssi ? `${station.rssi} dBm` : '—'}</span>
        </div>
      );
    },
  },

  {
    key: 'rssi',
    label: 'RSSI (dBm)',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'rssi',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.rssi ?? '—'}</span>,
  },

  {
    key: 'channel',
    label: 'Channel',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'channel',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.channel || '—'}</span>,
  },

  {
    key: 'protocol',
    label: 'Protocol',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'protocol',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.protocol || '—'}</span>,
  },

  {
    key: 'rxRate',
    label: 'Rx Rate',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'rxRate',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <span className="text-xs">{station.rxRate ? `${station.rxRate} Mbps` : '—'}</span>
    ),
  },

  {
    key: 'txRate',
    label: 'Tx Rate',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'txRate',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <span className="text-xs">{station.txRate ? `${station.txRate} Mbps` : '—'}</span>
    ),
  },

  {
    key: 'spatialStreams',
    label: 'Spatial Streams',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'spatialStreams',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.spatialStreams || '—'}</span>,
  },

  {
    key: 'capabilities',
    label: 'Capabilities',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'capabilities',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <span className="text-xs truncate max-w-[200px] block">{station.capabilities || '—'}</span>
    ),
  },

  // Performance columns
  {
    key: 'traffic',
    label: 'Traffic',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'inBytes',
    defaultVisible: true,
    sortable: true,
    renderCell: (station) => {
      const inBytes = station.inBytes || 0;
      const outBytes = station.outBytes || 0;
      if (!inBytes && !outBytes) {
        return <span className="text-[11px] text-muted-foreground">No data</span>;
      }
      return (
        <div className="flex flex-col justify-center gap-1 leading-none">
          <div className="flex items-center gap-1.5 text-[11px] text-green-500 font-medium">
            ↓ {formatBytes(inBytes)}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-blue-500 font-medium">
            ↑ {formatBytes(outBytes)}
          </div>
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
    renderCell: (station) => <span className="text-xs">{formatBytes(station.inBytes || 0)}</span>,
  },

  {
    key: 'outBytes',
    label: 'Out Bytes',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'outBytes',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{formatBytes(station.outBytes || 0)}</span>,
  },

  {
    key: 'inPackets',
    label: 'In Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'inPackets',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <span className="text-xs">{formatCompactNumber(station.inPackets) || '0'}</span>
    ),
  },

  {
    key: 'outPackets',
    label: 'Out Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'outPackets',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <span className="text-xs">{formatCompactNumber(station.outPackets) || '0'}</span>
    ),
  },

  {
    key: 'dlLostRetriesPackets',
    label: 'Dl Lost Retries Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'dlLostRetriesPackets',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.dlLostRetriesPackets || '0'}</span>,
  },

  // Advanced columns
  {
    key: 'macAddress',
    label: 'MAC Address',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'macAddress',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <code className="font-mono text-[11px]">{station.macAddress || '—'}</code>
    ),
  },

  {
    key: 'ipAddress',
    label: 'IP Address',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'ipAddress',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <code className="font-mono text-[11px]">{station.ipAddress || '—'}</code>
    ),
  },

  {
    key: 'ipv6Address',
    label: 'IPv6 Address',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'ipv6Address',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <code className="font-mono text-[11px] truncate max-w-[200px] block">
        {station.ipv6Address || '—'}
      </code>
    ),
  },

  {
    key: 'deviceType',
    label: 'Device Type',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'deviceType',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.deviceType || '—'}</span>,
  },

  {
    key: 'manufacturer',
    label: 'Manufacturer',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'manufacturer',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => <span className="text-xs">{station.manufacturer || '—'}</span>,
  },

  {
    key: 'apName',
    label: 'AP Name',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'apName',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <span className="text-xs">{station.apName || station.apDisplayName || '—'}</span>
    ),
  },

  {
    key: 'apSerial',
    label: 'AP Serial',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'apSerial',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => (
      <code className="font-mono text-[11px]">
        {station.apSerial || station.apSerialNumber || '—'}
      </code>
    ),
  },

  {
    key: 'lastSeen',
    label: 'Last Seen',
    category: 'advanced',
    dataType: 'date',
    fieldPath: 'lastSeen',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => {
      if (!station.lastSeen) {
        return <span className="text-[11px] text-muted-foreground">—</span>;
      }
      try {
        return <span className="text-xs">{new Date(station.lastSeen).toLocaleString()}</span>;
      } catch {
        return <span className="text-xs">{station.lastSeen}</span>;
      }
    },
  },
];
