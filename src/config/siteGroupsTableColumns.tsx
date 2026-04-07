/**
 * Site Groups Table Column Configuration
 *
 * Defines all available columns for the Site Groups table.
 * Used with useTableCustomization hook for column management.
 * Site Groups represent controller pairs — not manual color-coded groupings.
 */

import { ColumnConfig } from '@/types/table';
import { SiteGroup } from '@/types/domain';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, AlertTriangle, HelpCircle } from 'lucide-react';

export const SITE_GROUPS_TABLE_COLUMNS: ColumnConfig<SiteGroup>[] = [
  {
    key: 'name',
    label: 'Name',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'name',
    defaultVisible: true,
    sortable: true,
    lockVisible: true,
    defaultWidth: 200,
    tooltip: 'Site group name',
  },
  {
    key: 'controllerPair',
    label: 'Controller Pair',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'controller_url',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 260,
    renderCell: (sg: SiteGroup) => (
      <div className="flex flex-col text-xs">
        <span className="font-medium">{sg.primary_controller || sg.controller_url}</span>
        {sg.secondary_controller && (
          <span className="text-muted-foreground">{sg.secondary_controller}</span>
        )}
      </div>
    ),
    tooltip: 'Primary and secondary controller addresses',
  },
  {
    key: 'siteCount',
    label: 'Site Count',
    category: 'basic',
    dataType: 'number',
    fieldPath: 'site_count',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 110,
    tooltip: 'Number of sites in this group — click to view filtered Sites page',
    // renderCell handled in SiteGroupsPage.tsx for navigation behavior
  },
  {
    key: 'connectionStatus',
    label: 'Status',
    category: 'status',
    dataType: 'string',
    fieldPath: 'connection_status',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 140,
    renderCell: (sg: SiteGroup) => {
      const statusConfig: Record<string, { icon: any; variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; className: string }> = {
        connected:    { icon: Wifi,         variant: 'default',     label: 'Connected',    className: 'text-green-500' },
        disconnected: { icon: WifiOff,      variant: 'destructive', label: 'Disconnected', className: 'text-red-500' },
        error:        { icon: AlertTriangle,variant: 'destructive', label: 'Error',        className: 'text-orange-500' },
        unknown:      { icon: HelpCircle,   variant: 'secondary',   label: 'Unknown',      className: 'text-muted-foreground' },
      };
      const config = statusConfig[sg.connection_status] || statusConfig.unknown;
      const Icon = config.icon;
      return (
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.className}`} />
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
      );
    },
    tooltip: 'Controller connection status',
  },
  {
    key: 'region',
    label: 'Region',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'region',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 130,
    renderCell: (sg: SiteGroup) => sg.region || '—',
    tooltip: 'Geographic region',
  },
  {
    key: 'description',
    label: 'Description',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'description',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 260,
    renderCell: (sg: SiteGroup) => sg.description || '—',
    tooltip: 'Group description',
  },
  {
    key: 'lastConnected',
    label: 'Last Connected',
    category: 'status',
    dataType: 'date',
    fieldPath: 'last_connected_at',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 170,
    renderCell: (sg: SiteGroup) =>
      sg.last_connected_at
        ? new Date(sg.last_connected_at).toLocaleString()
        : '—',
    tooltip: 'Last successful connection time',
  },
];
