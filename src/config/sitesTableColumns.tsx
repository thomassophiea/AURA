/**
 * Sites Table Column Configuration
 *
 * Defines all available columns for the Sites table
 * Used with useTableCustomization hook for column management
 */

import { ColumnConfig } from '@/types/table';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertTriangle,
  Activity,
  Circle
} from 'lucide-react';

// Site interface matching the component
export interface Site {
  id: string;
  siteName: string;
  name?: string;
  country?: string;
  timezone?: string;
  campus?: string;
  status?: string;
  deviceGroups?: any[];
  switchSerialNumbers?: string[];
  aps?: number;
  switches?: number;
  networks?: number;
  roles?: number;
  adoptionPrimary?: string;
  adoptionBackup?: string;
  activeAPs?: number;
  nonActiveAPs?: number;
  allClients?: number;
  canDelete?: boolean;
  canEdit?: boolean;
  [key: string]: any;
}

/**
 * Get status badge variant based on status value
 */
function getStatusVariant(status?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status?.toLowerCase()) {
    case 'online':
    case 'up':
    case 'active':
      return 'default';
    case 'partial':
    case 'degraded':
      return 'secondary';
    case 'offline':
    case 'down':
    case 'inactive':
      return 'destructive';
    default:
      return 'outline';
  }
}

/**
 * Get status icon based on status value
 */
function getStatusIcon(status?: string) {
  switch (status?.toLowerCase()) {
    case 'online':
    case 'up':
    case 'active':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'partial':
    case 'degraded':
      return <Activity className="h-4 w-4 text-amber-500" />;
    case 'offline':
    case 'down':
    case 'inactive':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    default:
      return <Circle className="h-4 w-4 text-gray-500" />;
  }
}

/**
 * Column configurations for Sites table
 */
export const SITES_TABLE_COLUMNS: ColumnConfig<Site>[] = [
  {
    key: 'status',
    label: 'Status',
    category: 'status',
    dataType: 'string',
    fieldPath: 'status',
    defaultVisible: true,
    lockVisible: false,
    sortable: true,
    defaultWidth: 100,
    renderCell: (site) => {
      return (
        <div className="flex items-center gap-2">
          {getStatusIcon(site.status)}
          <Badge variant={getStatusVariant(site.status)}>
            {site.status || 'Unknown'}
          </Badge>
        </div>
      );
    },
    tooltip: 'Current operational status'
  },

  {
    key: 'siteName',
    label: 'Name',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'siteName',
    defaultVisible: true,
    lockVisible: true, // Always visible
    sortable: true,
    defaultWidth: 200,
    renderCell: (site) => {
      return (
        <div className="font-medium">
          {site.siteName || site.name || 'Unnamed Site'}
        </div>
      );
    },
    tooltip: 'Site name'
  },

  {
    key: 'country',
    label: 'Country',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'country',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 120,
    renderCell: (site) => site.country || '—',
    tooltip: 'Country location'
  },

  {
    key: 'timezone',
    label: 'Timezone',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'timezone',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 150,
    renderCell: (site) => site.timezone || '—',
    tooltip: 'Site timezone'
  },

  {
    key: 'campus',
    label: 'Campus',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'campus',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 150,
    renderCell: (site) => site.campus || '—',
    tooltip: 'Campus or building'
  },

  {
    key: 'roles',
    label: 'Roles',
    category: 'network',
    dataType: 'number',
    fieldPath: 'roles',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 100,
    renderCell: (site) => (
      <div className="text-center">
        {site.roles ?? 0}
      </div>
    ),
    tooltip: 'Number of network roles'
  },

  {
    key: 'networks',
    label: 'Networks',
    category: 'network',
    dataType: 'number',
    fieldPath: 'networks',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 100,
    renderCell: (site) => (
      <div className="text-center">
        {site.networks ?? 0}
      </div>
    ),
    tooltip: 'Number of networks/WLANs'
  },

  {
    key: 'switches',
    label: 'Switches',
    category: 'devices',
    dataType: 'number',
    fieldPath: 'switches',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 100,
    renderCell: (site) => (
      <div className="text-center">
        {site.switches ?? 0}
      </div>
    ),
    tooltip: 'Number of switches'
  },

  {
    key: 'aps',
    label: 'APs',
    category: 'devices',
    dataType: 'number',
    fieldPath: 'aps',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 100,
    renderCell: (site) => (
      <div className="text-center">
        {site.aps ?? 0}
      </div>
    ),
    tooltip: 'Total access points'
  },

  {
    key: 'activeAPs',
    label: 'Active APs',
    category: 'devices',
    dataType: 'number',
    fieldPath: 'activeAPs',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 120,
    renderCell: (site) => (
      <div className="text-center text-green-500">
        {site.activeAPs ?? 0}
      </div>
    ),
    tooltip: 'Currently active access points'
  },

  {
    key: 'nonActiveAPs',
    label: 'Non Active APs',
    category: 'devices',
    dataType: 'number',
    fieldPath: 'nonActiveAPs',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 130,
    renderCell: (site) => (
      <div className="text-center text-red-500">
        {site.nonActiveAPs ?? 0}
      </div>
    ),
    tooltip: 'Inactive access points'
  },

  {
    key: 'allClients',
    label: 'All Clients',
    category: 'metrics',
    dataType: 'number',
    fieldPath: 'allClients',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 120,
    renderCell: (site) => (
      <div className="text-center">
        {site.allClients ?? 0}
      </div>
    ),
    tooltip: 'Total connected clients'
  },

  {
    key: 'adoptionPrimary',
    label: 'Primary Platform',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'adoptionPrimary',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 180,
    renderCell: (site) => site.adoptionPrimary || '—',
    tooltip: 'Primary Extreme Platform ONE address'
  },

  {
    key: 'adoptionBackup',
    label: 'Backup Platform',
    category: 'advanced',
    dataType: 'string',
    fieldPath: 'adoptionBackup',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 180,
    renderCell: (site) => site.adoptionBackup || '—',
    tooltip: 'Backup Extreme Platform ONE address'
  }
];
