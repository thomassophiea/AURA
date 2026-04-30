/**
 * Sites Table Column Configuration
 *
 * Defines all available columns for the Sites table.
 * Used with useTableCustomization hook for column management.
 * Uses the canonical Site type from src/types/domain.ts.
 */

import { ColumnConfig } from '@/types/table';
import { Site } from '@/types/domain';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Activity, Circle, Clock } from 'lucide-react';

function getStatusVariant(status?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'default';
    case 'provisioning':
      return 'secondary';
    case 'inactive':
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getStatusIcon(status?: string) {
  switch (status?.toLowerCase()) {
    case 'active':
      return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    case 'provisioning':
      return <Activity className="h-3.5 w-3.5 text-amber-500 animate-pulse" />;
    case 'error':
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    case 'inactive':
      return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export const SITES_TABLE_COLUMNS: ColumnConfig<Site>[] = [
  {
    key: 'name',
    label: 'Site Name',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'name',
    defaultVisible: true,
    lockVisible: true,
    sortable: true,
    defaultWidth: 220,
    renderCell: (site: Site) => (
      <div className="text-xs font-medium text-foreground truncate" title={site.name}>
        {site.name || site.siteName || site.displayName || 'Unnamed Site'}
      </div>
    ),
    tooltip: 'Site name',
  },
  {
    key: 'siteGroupName',
    label: 'Site Group',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'site_group_name',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 180,
    renderCell: (site: Site) =>
      site.site_group_name ? (
        <span className="text-xs">{site.site_group_name}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    tooltip: 'Parent site group (controller pair)',
  },
  {
    key: 'location',
    label: 'Location',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'location',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 180,
    renderCell: (site: Site) =>
      site.location ? (
        <span className="text-xs truncate" title={site.location}>
          {site.location}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    tooltip: 'Physical location or address',
  },
  {
    key: 'status',
    label: 'Status',
    category: 'status',
    dataType: 'string',
    fieldPath: 'status',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 140,
    renderCell: (site: Site) => (
      <div className="flex items-center gap-1.5">
        {getStatusIcon(site.status)}
        <Badge
          variant={getStatusVariant(site.status)}
          className="text-xs h-4 px-1.5 py-0 uppercase tracking-wide"
        >
          {site.status ? site.status.charAt(0).toUpperCase() + site.status.slice(1) : 'Unknown'}
        </Badge>
      </div>
    ),
    tooltip: 'Current operational status',
  },
  {
    key: 'apCount',
    label: 'AP Count',
    category: 'devices',
    dataType: 'number',
    fieldPath: 'ap_count',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 110,
    renderCell: (site: Site) => <div className="text-xs font-medium">{site.ap_count ?? 0}</div>,
    tooltip: 'Total access points at this site',
  },
  {
    key: 'clientCount',
    label: 'Client Count',
    category: 'devices',
    dataType: 'number',
    fieldPath: 'client_count',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 120,
    renderCell: (site: Site) => <div className="text-xs font-medium">{site.client_count ?? 0}</div>,
    tooltip: 'Total connected clients at this site',
  },
  {
    key: 'country',
    label: 'Country',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'country',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 130,
    renderCell: (site: Site) =>
      site.country ? (
        <span className="text-xs">{site.country}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    tooltip: 'Country',
  },
  {
    key: 'timezone',
    label: 'Timezone',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'timezone',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 160,
    renderCell: (site: Site) =>
      site.timezone ? (
        <span className="text-xs">{site.timezone}</span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    tooltip: 'Site timezone',
  },
  {
    key: 'tags',
    label: 'Tags',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'tags',
    defaultVisible: false,
    sortable: false,
    defaultWidth: 200,
    renderCell: (site: Site) =>
      site.tags && site.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {site.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs h-4 px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
    tooltip: 'Site tags',
  },
];
