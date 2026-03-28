/**
 * Access Points Table Column Configuration
 *
 * Defines all available columns for the Access Points table.
 * Column rendering depends on component state (cableHealthMap, meshRoles, etc.)
 * so renderCell is intentionally omitted here — AccessPoints.tsx handles
 * cell rendering via renderColumnContent().
 */

import { ColumnConfig } from '@/types/table';
import { AccessPoint } from '@/services/api';

export const AP_TABLE_COLUMNS: ColumnConfig<AccessPoint>[] = [
  // Basic columns
  { key: 'connection',  label: 'Connection Status',   category: 'basic',       dataType: 'string',     fieldPath: 'status',              defaultVisible: true,  sortable: true },
  { key: 'apName',      label: 'AP Name',              category: 'basic',       dataType: 'string',     fieldPath: 'apName',              defaultVisible: true,  sortable: true },
  { key: 'serialNumber',label: 'Serial Number',        category: 'basic',       dataType: 'string',     fieldPath: 'serialNumber',        defaultVisible: true,  sortable: true },
  { key: 'hostSite',    label: 'Site/Location',        category: 'basic',       dataType: 'string',     fieldPath: 'hostSite',            defaultVisible: true,  sortable: true },
  { key: 'model',       label: 'Model',                category: 'basic',       dataType: 'string',     fieldPath: 'model',               defaultVisible: true,  sortable: true },
  { key: 'ipAddress',   label: 'IP Address',           category: 'basic',       dataType: 'ip_address', fieldPath: 'ipAddress',           defaultVisible: true,  sortable: true },
  { key: 'clients',     label: 'Connected Clients',    category: 'basic',       dataType: 'number',     fieldPath: 'clientCount',         defaultVisible: true,  sortable: true },

  // Network columns
  { key: 'meshRole',    label: 'Mesh Role',            category: 'network',     dataType: 'string',                                       defaultVisible: false, sortable: true },
  { key: 'cableHealth', label: 'Cable Health',         category: 'network',     dataType: 'string',                                       defaultVisible: false, sortable: false },
  { key: 'macAddress',  label: 'MAC Address',          category: 'network',     dataType: 'mac_address',fieldPath: 'macAddress',          defaultVisible: false, sortable: true },
  { key: 'ethMode',     label: 'Ethernet Mode',        category: 'network',     dataType: 'string',                                       defaultVisible: false, sortable: true },
  { key: 'ethSpeed',    label: 'Ethernet Speed',       category: 'network',     dataType: 'string',                                       defaultVisible: false, sortable: true },
  { key: 'tunnel',      label: 'Tunnel',               category: 'network',     dataType: 'string',                                       defaultVisible: false, sortable: true },
  { key: 'wiredClients',label: 'Wired Clients',        category: 'network',     dataType: 'number',                                       defaultVisible: false, sortable: true },

  // Status columns
  { key: 'status',      label: 'Status',               category: 'status',      dataType: 'string',     fieldPath: 'status',              defaultVisible: false, sortable: true },
  { key: 'uptime',      label: 'Uptime',               category: 'status',      dataType: 'string',     fieldPath: 'uptime',              defaultVisible: false, sortable: true },
  { key: 'adoptedBy',   label: 'Adopted By',           category: 'status',      dataType: 'string',                                       defaultVisible: false, sortable: true },
  { key: 'home',        label: 'Home Platform',        category: 'status',      dataType: 'string',                                       defaultVisible: false, sortable: true },

  // Performance columns
  { key: 'cpuUsage',           label: 'CPU %',                 category: 'performance', dataType: 'number',                               defaultVisible: false, sortable: true },
  { key: 'memoryUsage',        label: 'Memory %',              category: 'performance', dataType: 'number',                               defaultVisible: false, sortable: true },
  { key: 'pwrUsage',           label: 'Power Usage (W)',       category: 'performance', dataType: 'number',                               defaultVisible: false, sortable: true },
  { key: 'pwrSource',          label: 'Power Source',          category: 'performance', dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'channelUtilization', label: 'Avg Channel Util %',   category: 'performance', dataType: 'number', fieldPath: 'channelUtilization', defaultVisible: false, sortable: true },

  // Hardware columns
  { key: 'softwareVersion', label: 'Firmware Version',        category: 'hardware',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'platformName',    label: 'Platform',                category: 'hardware',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'environment',     label: 'Environment',             category: 'hardware',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'ethPowerStatus',  label: 'Ethernet Power Status',   category: 'hardware',    dataType: 'string',                               defaultVisible: false, sortable: true },

  // Advanced columns
  { key: 'profileName',      label: 'Profile Name',          category: 'advanced',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'rfMgmtPolicyName', label: 'RF Management Policy',  category: 'advanced',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'switchPorts',      label: 'Switch Ports',          category: 'advanced',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'source',           label: 'Location Source',       category: 'advanced',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'floorName',        label: 'Floor Name',            category: 'advanced',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'description',      label: 'Description',           category: 'advanced',    dataType: 'string',                               defaultVisible: false, sortable: true },
  { key: 'afcAnchor',        label: 'AFC Anchor',            category: 'advanced',    dataType: 'boolean',                              defaultVisible: false, sortable: true },
];
