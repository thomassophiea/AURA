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
  SignalLow
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
        <div className="flex items-center gap-2 min-w-[100px]">
          <Badge className={isOnline
            ? 'bg-green-500/15 text-green-500 border-green-500/30 hover:bg-green-500/20'
            : 'bg-gray-500/15 text-gray-400 border-gray-500/30'
          }>
            {station.status || 'Unknown'}
          </Badge>
        </div>
      );
    }
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
      if (!hostname) return <span className="text-muted-foreground">—</span>;
      return (
        <div
          className="font-semibold text-foreground max-w-[200px] truncate leading-snug"
          title={hostname}
        >
          {hostname}
        </div>
      );
    }
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
      <code className="font-mono text-[11px] text-muted-foreground tracking-tight">
        {station.macAddress || '—'}
      </code>
    )
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
      if (!label) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="max-w-[140px] truncate text-sm" title={label}>{label}</div>
      );
    }
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
      return (
        <div className="text-xs leading-snug max-w-[160px]">
          {user && (
            <div className="truncate text-foreground/90 font-medium" title={user}>{user}</div>
          )}
          {net && (
            <div className="truncate text-muted-foreground" title={net}>{net}</div>
          )}
          {!user && !net && <span className="text-muted-foreground">—</span>}
        </div>
      );
    }
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
      if (!name) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="max-w-[180px] truncate text-foreground/90" title={name}>
          {name}
        </div>
      );
    }
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
      if (!name) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="max-w-[160px] truncate" title={name}>{name}</div>
      );
    }
  },

  {
    key: 'network',
    label: 'Network',
    category: 'network',
    dataType: 'string',
    fieldPath: 'networkName',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.networkName || station.ssid || '—'
  },

  {
    key: 'role',
    label: 'Role',
    category: 'network',
    dataType: 'string',
    fieldPath: 'role',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.role || '—'
  },

  {
    key: 'username',
    label: 'Username',
    category: 'network',
    dataType: 'string',
    fieldPath: 'username',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.username || '—'
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
      return <Badge variant="outline">{band || '—'}</Badge>;
    }
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
        <div className="flex items-center gap-2">
          {getSignalIndicator(station.rssi)}
          <span>{station.rssi ? `${station.rssi} dBm` : '—'}</span>
        </div>
      );
    }
  },

  {
    key: 'rssi',
    label: 'RSSI (dBm)',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'rssi',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.rssi || '—'
  },

  {
    key: 'channel',
    label: 'Channel',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'channel',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.channel || '—'
  },

  {
    key: 'protocol',
    label: 'Protocol',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'protocol',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.protocol || '—'
  },

  {
    key: 'rxRate',
    label: 'Rx Rate',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'rxRate',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.rxRate ? `${station.rxRate} Mbps` : '—'
  },

  {
    key: 'txRate',
    label: 'Tx Rate',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'txRate',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.txRate ? `${station.txRate} Mbps` : '—'
  },

  {
    key: 'spatialStreams',
    label: 'Spatial Streams',
    category: 'connection',
    dataType: 'number',
    fieldPath: 'spatialStreams',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.spatialStreams || '—'
  },

  {
    key: 'capabilities',
    label: 'Capabilities',
    category: 'connection',
    dataType: 'string',
    fieldPath: 'capabilities',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.capabilities || '—'
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
      return (
        <div className="text-sm">
          <div>↓ {formatBytes(inBytes)}</div>
          <div className="text-muted-foreground">↑ {formatBytes(outBytes)}</div>
        </div>
      );
    }
  },

  {
    key: 'inBytes',
    label: 'In Bytes',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'inBytes',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => formatBytes(station.inBytes || 0)
  },

  {
    key: 'outBytes',
    label: 'Out Bytes',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'outBytes',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => formatBytes(station.outBytes || 0)
  },

  {
    key: 'inPackets',
    label: 'In Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'inPackets',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => formatCompactNumber(station.inPackets) || '0'
  },

  {
    key: 'outPackets',
    label: 'Out Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'outPackets',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => formatCompactNumber(station.outPackets) || '0'
  },

  {
    key: 'dlLostRetriesPackets',
    label: 'Dl Lost Retries Packets',
    category: 'performance',
    dataType: 'number',
    fieldPath: 'dlLostRetriesPackets',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.dlLostRetriesPackets || '0'
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
      <code className="text-xs">{station.macAddress || '—'}</code>
    )
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
      <code className="text-xs">{station.ipAddress || '—'}</code>
    )
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
      <code className="text-xs">{station.ipv6Address || '—'}</code>
    )
  },

  {
    key: 'deviceType',
    label: 'Device Type',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'deviceType',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.deviceType || '—'
  },

  {
    key: 'manufacturer',
    label: 'Manufacturer',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'manufacturer',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.manufacturer || '—'
  },

  {
    key: 'apName',
    label: 'AP Name',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'apName',
    defaultVisible: false,
    sortable: true,
    renderCell: (station) => station.apName || station.apDisplayName || '—'
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
      <code className="text-xs">{station.apSerial || station.apSerialNumber || '—'}</code>
    )
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
      if (station.lastSeen) {
        return new Date(station.lastSeen).toLocaleString();
      }
      return '—';
    }
  }
];
