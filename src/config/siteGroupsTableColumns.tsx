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
      <div className="flex flex-col gap-0.5 leading-snug min-w-0">
        <span className="text-xs font-medium text-foreground truncate font-mono">
          {sg.primary_controller || sg.controller_url}
        </span>
        {sg.secondary_controller && (
          <span className="text-[11px] text-muted-foreground truncate font-mono">
            {sg.secondary_controller}
          </span>
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
      const statusConfig: Record<
        string,
        {
          icon: any;
          variant: 'default' | 'secondary' | 'destructive' | 'outline';
          label: string;
          className: string;
        }
      > = {
        connected: {
          icon: Wifi,
          variant: 'default',
          label: 'Connected',
          className: 'text-green-500',
        },
        disconnected: {
          icon: WifiOff,
          variant: 'destructive',
          label: 'Disconnected',
          className: 'text-red-500',
        },
        error: {
          icon: AlertTriangle,
          variant: 'destructive',
          label: 'Error',
          className: 'text-orange-500',
        },
        unknown: {
          icon: HelpCircle,
          variant: 'secondary',
          label: 'Unknown',
          className: 'text-muted-foreground',
        },
      };
      const config = statusConfig[sg.connection_status] || statusConfig.unknown;
      const Icon = config.icon;
      return (
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${config.className}`} />
          <Badge
            variant={config.variant}
            className="text-[10px] h-4 px-1.5 py-0 uppercase tracking-wide"
          >
            {config.label}
          </Badge>
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
    renderCell: (sg: SiteGroup) =>
      sg.region ? (
        <span className="text-xs">{sg.region}</span>
      ) : (
        <span className="text-[11px] text-muted-foreground">—</span>
      ),
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
    renderCell: (sg: SiteGroup) =>
      sg.description ? (
        <span className="text-xs truncate" title={sg.description}>
          {sg.description}
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground">—</span>
      ),
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
      sg.last_connected_at ? (
        <span className="text-xs">{new Date(sg.last_connected_at).toLocaleString()}</span>
      ) : (
        <span className="text-[11px] text-muted-foreground">—</span>
      ),
    tooltip: 'Last successful connection time',
  },
];
