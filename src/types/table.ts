/**
 * Universal Table Customization Types
 *
 * Core type definitions for the customizable table columns feature.
 * These types support column visibility, ordering, resizing, pinning,
 * saved views, and persistence across all tables in the application.
 */

import { ReactNode } from 'react';

/**
 * Stable identifier for each table surface in the application
 * Examples: 'sites', 'clients', 'access_points', 'networks', 'wlans'
 */
export type TableId = string;

/**
 * Stable identifier for a column, derived from canonical field keys
 */
export type ColumnId = string;

/**
 * Data types supported by table columns
 */
export type ColumnDataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'json'
  | 'ip_address'
  | 'mac_address';

/**
 * Column categories for organizing columns in the customization UI
 */
export type ColumnCategory =
  | 'basic'
  | 'devices'
  | 'metrics'
  | 'status'
  | 'network'
  | 'connection'
  | 'advanced'
  | 'security'
  | 'performance';

/**
 * Scope types for table preferences
 */
export type PreferenceScope = 'user' | 'site' | 'network' | 'global';

/**
 * Column definition with all configuration options
 */
export interface ColumnConfig<T = any> {
  /** Unique identifier for this column */
  key: ColumnId;

  /** Display label shown in table header */
  label: string;

  /** Path to the field in the data object (supports nested paths like 'user.name') */
  fieldPath?: string;

  /** Data type of the column */
  dataType?: ColumnDataType;

  /** Column category for grouping in UI */
  category?: ColumnCategory;

  /** Whether column is visible by default */
  defaultVisible?: boolean;

  /** Whether column can be hidden by user */
  lockVisible?: boolean;

  /** Whether column position is locked (cannot be reordered) */
  lockPosition?: boolean;

  /** Default width in pixels */
  defaultWidth?: number;

  /** Minimum width in pixels */
  minWidth?: number;

  /** Maximum width in pixels */
  maxWidth?: number;

  /** Whether column supports sorting */
  sortable?: boolean;

  /** Whether column supports filtering */
  filterable?: boolean;

  /** Whether column can be pinned to left */
  pinnable?: boolean;

  /** Whether this field requires query endpoint (not in base list) */
  requiresQuery?: boolean;

  /** Custom render function for cell content */
  renderCell?: (data: T, rowIndex?: number) => ReactNode;

  /** Custom render function for header */
  renderHeader?: () => ReactNode;

  /** Format string for value display (e.g., '0.00', 'YYYY-MM-DD') */
  valueFormat?: string;

  /** Tooltip text for column header */
  tooltip?: string;

  /** CSS class for column cells */
  cellClassName?: string;

  /** CSS class for column header */
  headerClassName?: string;

  /** Whether column requires specific permissions to view */
  requiredPermission?: string;
}

/**
 * Column state for a specific user and table
 */
export interface ColumnState {
  /** Column identifier */
  columnId: ColumnId;

  /** Whether column is currently visible */
  visible: boolean;

  /** Order index (0-based) */
  orderIndex: number;

  /** Current width in pixels */
  widthPx?: number;

  /** Whether column is pinned to left */
  pinnedLeft?: boolean;
}

/**
 * Saved view configuration
 */
export interface ColumnView {
  /** Unique identifier for this view */
  id: string;

  /** User-defined name for the view */
  name: string;

  /** Optional description */
  description?: string;

  /** Table this view applies to */
  tableId: TableId;

  /** Column IDs included in this view (in order) */
  columns: ColumnId[];

  /** Column widths override */
  columnWidths?: Record<ColumnId, number>;

  /** Pinned columns */
  pinnedColumns?: ColumnId[];

  /** User who created this view */
  createdBy: string;

  /** Whether this is a shared/org-level view */
  isShared?: boolean;

  /** Users who can access this view (if shared) */
  sharedWith?: string[];

  /** Whether this is the user's default view for this table */
  isDefault?: boolean;

  /** Creation timestamp */
  createdAt?: string;

  /** Last update timestamp */
  updatedAt?: string;
}

/**
 * Complete table preferences for a user
 */
export interface TablePreferences {
  /** Table identifier */
  tableId: TableId;

  /** User identifier */
  userId?: string;

  /** Preference scope */
  scope?: PreferenceScope;

  /** List of visible column IDs */
  visibleColumns: ColumnId[];

  /** Ordered list of all column IDs */
  columnOrder?: ColumnId[];

  /** Column widths override */
  columnWidths?: Record<ColumnId, number>;

  /** Pinned column IDs */
  pinnedColumns?: ColumnId[];

  /** Currently active view ID */
  currentView?: string;

  /** Last modified timestamp */
  lastModified?: string;
}

/**
 * Options for table data queries with field projection
 */
export interface TableQueryOptions {
  /** Specific fields to fetch (field projection) */
  fields?: string[];

  /** Pagination limit */
  limit?: number;

  /** Pagination offset */
  offset?: number;

  /** Sort field and direction */
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };

  /** Filter criteria */
  filter?: Record<string, any>;

  /** Search query */
  search?: string;

  /** Scope context (site, network, etc.) */
  scope?: {
    type: PreferenceScope;
    id?: string;
  };
}

/**
 * Result of a table data query
 */
export interface TableQueryResult<T = any> {
  /** Array of data items */
  data: T[];

  /** Total count (for pagination) */
  total: number;

  /** Current page/offset */
  offset: number;

  /** Page size/limit */
  limit: number;

  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Table data source adapter interface
 * Allows different tables to provide data through a consistent interface
 */
export interface TableDataSource<T = any> {
  /** Fetch data with query options */
  fetch: (options?: TableQueryOptions) => Promise<TableQueryResult<T>>;

  /** Refresh/invalidate cached data */
  refresh?: () => Promise<void>;

  /** Whether this source supports field projection */
  supportsFieldProjection?: boolean;

  /** Whether this source supports server-side sorting */
  supportsServerSort?: boolean;

  /** Whether this source supports server-side filtering */
  supportsServerFilter?: boolean;
}

/**
 * Context for table customization UI
 */
export interface TableCustomizationContext {
  /** Table identifier */
  tableId: TableId;

  /** Available columns */
  columns: ColumnConfig[];

  /** Current visible columns */
  visibleColumns: ColumnId[];

  /** Column order */
  columnOrder: ColumnId[];

  /** Column widths */
  columnWidths: Record<ColumnId, number>;

  /** Pinned columns */
  pinnedColumns: ColumnId[];

  /** Saved views */
  savedViews: ColumnView[];

  /** Current view */
  currentView?: string;

  /** Whether views feature is enabled */
  enableViews: boolean;

  /** Whether persistence is enabled */
  enablePersistence: boolean;

  /** Whether currently loading */
  isLoading: boolean;
}

/**
 * Actions for table customization
 */
export interface TableCustomizationActions {
  /** Toggle column visibility */
  toggleColumn: (columnId: ColumnId) => void;

  /** Show specific columns */
  showColumns: (columnIds: ColumnId[]) => void;

  /** Hide specific columns */
  hideColumns: (columnIds: ColumnId[]) => void;

  /** Reset to default columns */
  resetColumns: () => void;

  /** Set column width */
  setColumnWidth: (columnId: ColumnId, width: number) => void;

  /** Pin column to left */
  pinColumn: (columnId: ColumnId) => void;

  /** Unpin column */
  unpinColumn: (columnId: ColumnId) => void;

  /** Reorder columns */
  reorderColumns: (newOrder: ColumnId[]) => void;

  /** Save current configuration as a view */
  saveView: (view: Omit<ColumnView, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ColumnView>;

  /** Load a saved view */
  loadView: (viewId: string) => void;

  /** Delete a saved view */
  deleteView: (viewId: string) => Promise<void>;

  /** Share a view with other users */
  shareView: (viewId: string, userIds: string[]) => Promise<void>;

  /** Set a view as default */
  setDefaultView: (viewId: string) => Promise<void>;
}

/**
 * Export options for table data
 */
export interface TableExportOptions {
  /** Format for export */
  format: 'csv' | 'json' | 'xlsx';

  /** Whether to use visible columns only */
  visibleColumnsOnly?: boolean;

  /** Specific columns to export (overrides visibleColumnsOnly) */
  columns?: ColumnId[];

  /** Whether to include column headers */
  includeHeaders?: boolean;

  /** Filename for the export */
  filename?: string;
}

/**
 * Telemetry event for table customization
 */
export interface TableCustomizationEvent {
  /** Event type */
  type: 'view_loaded' | 'column_toggled' | 'column_reordered' | 'column_resized'
    | 'view_saved' | 'view_loaded' | 'reset_to_default';

  /** Table identifier */
  tableId: TableId;

  /** User identifier */
  userId?: string;

  /** Event timestamp */
  timestamp: string;

  /** Additional event metadata */
  metadata?: Record<string, any>;
}

/**
 * Field mapping for API queries
 * Maps UI column IDs to API field names
 */
export interface FieldMapping {
  /** Column ID in UI */
  columnId: ColumnId;

  /** API field name(s) required for this column */
  apiFields: string[];

  /** Whether this field requires a specific query endpoint */
  requiresQueryEndpoint?: boolean;

  /** Transform function to map API data to display value */
  transform?: (apiData: any) => any;
}

/**
 * Table definition combining all configuration
 */
export interface TableDefinition<T = any> {
  /** Table identifier */
  id: TableId;

  /** Display name */
  name: string;

  /** Column definitions */
  columns: ColumnConfig<T>[];

  /** Data source */
  dataSource: TableDataSource<T>;

  /** Field mappings for API queries */
  fieldMappings?: FieldMapping[];

  /** Default sort configuration */
  defaultSort?: {
    field: string;
    direction: 'asc' | 'desc';
  };

  /** Whether this table supports views */
  supportsViews?: boolean;

  /** Whether this table supports export */
  supportsExport?: boolean;

  /** Required permissions to view this table */
  requiredPermissions?: string[];
}
