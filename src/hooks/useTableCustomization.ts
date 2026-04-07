/**
 * Universal Table Customization Hook
 *
 * Provides complete table customization functionality including:
 * - Column visibility, ordering, resizing, pinning
 * - Saved views with create, load, delete, share
 * - Persistence (localStorage + server)
 * - Field projection support
 *
 * Usage:
 * ```tsx
 * const customization = useTableCustomization({
 *   tableId: 'sites',
 *   columns: SITE_COLUMNS,
 *   enableViews: true,
 *   enablePersistence: true
 * });
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ColumnConfig,
  ColumnId,
  TablePreferences,
  ColumnView,
  PreferenceScope,
  TableCustomizationContext,
  TableCustomizationActions
} from '@/types/table';

interface UseTableCustomizationOptions<T = any> {
  /** Unique identifier for this table */
  tableId: string;

  /** Available column definitions */
  columns: ColumnConfig<T>[];

  /** LocalStorage key (defaults to tableId-columns) */
  storageKey?: string;

  /** Enable saved views feature */
  enableViews?: boolean;

  /** Enable server persistence */
  enablePersistence?: boolean;

  /** Current user ID (required for persistence) */
  userId?: string;

  /** Preference scope */
  scope?: PreferenceScope;

  /** Callback when preferences change */
  onPreferencesChange?: (preferences: TablePreferences) => void;

  /** Callback when view is loaded */
  onViewLoad?: (view: ColumnView) => void;
}

export function useTableCustomization<T = any>({
  tableId,
  columns,
  storageKey,
  enableViews = false,
  enablePersistence = true,
  userId,
  scope = 'user',
  onPreferencesChange,
  onViewLoad
}: UseTableCustomizationOptions<T>) {
  // Compute defaults from column definitions
  const defaultVisibleColumns = useMemo(
    () => columns.filter(c => c.defaultVisible !== false).map(c => c.key),
    [columns]
  );

  const defaultColumnOrder = useMemo(
    () => columns.map(c => c.key),
    [columns]
  );

  const defaultColumnWidths = useMemo(
    () => columns.reduce((acc, c) => {
      if (c.defaultWidth) {
        acc[c.key] = c.defaultWidth;
      }
      return acc;
    }, {} as Record<string, number>),
    [columns]
  );

  // State
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(defaultVisibleColumns);
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(defaultColumnOrder);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(defaultColumnWidths);
  const [pinnedColumns, setPinnedColumns] = useState<ColumnId[]>([]);
  const [savedViews, setSavedViews] = useState<ColumnView[]>([]);
  const [currentView, setCurrentView] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Get storage key
  const finalStorageKey = storageKey || `${tableId}-columns`;

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setIsLoading(true);

        // Try server persistence first if enabled
        if (enablePersistence && userId) {
          try {
            // Import service dynamically to avoid circular deps
            const { tablePreferencesService } = await import('@/services/tablePreferences');
            const prefs = await tablePreferencesService.fetchPreferences(tableId, userId, scope);

            if (prefs) {
              setVisibleColumns(prefs.visibleColumns);
              if (prefs.columnOrder) setColumnOrder(prefs.columnOrder);
              if (prefs.columnWidths) setColumnWidths(prefs.columnWidths);
              if (prefs.pinnedColumns) setPinnedColumns(prefs.pinnedColumns);
              if (prefs.currentView) setCurrentView(prefs.currentView);
              setIsLoading(false);
              return;
            }
          } catch (error) {
            console.warn('Failed to load from server, falling back to localStorage:', error);
          }
        }

        // Fallback to localStorage
        const saved = localStorage.getItem(finalStorageKey);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as TablePreferences;
            setVisibleColumns(parsed.visibleColumns || defaultVisibleColumns);
            if (parsed.columnOrder) setColumnOrder(parsed.columnOrder);
            if (parsed.columnWidths) setColumnWidths(parsed.columnWidths);
            if (parsed.pinnedColumns) setPinnedColumns(parsed.pinnedColumns);
            if (parsed.currentView) setCurrentView(parsed.currentView);
          } catch (error) {
            console.error('Failed to parse saved preferences:', error);
            // Use defaults on parse error
          }
        }

        // Load views if enabled
        if (enableViews && userId) {
          try {
            const { tablePreferencesService } = await import('@/services/tablePreferences');
            const views = await tablePreferencesService.fetchViews(tableId, userId);
            setSavedViews(views);
          } catch (error) {
            console.warn('Failed to load saved views:', error);
          }
        }
      } catch (error) {
        console.error('Failed to load table preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [tableId, userId, scope, enablePersistence, enableViews, finalStorageKey, defaultVisibleColumns]);

  // Save preferences whenever they change
  useEffect(() => {
    if (isLoading) return;

    const savePreferences = async () => {
      const preferences: TablePreferences = {
        tableId,
        userId,
        scope,
        visibleColumns,
        columnOrder,
        columnWidths,
        pinnedColumns,
        currentView,
        lastModified: new Date().toISOString()
      };

      // Save to localStorage (always as backup)
      try {
        localStorage.setItem(finalStorageKey, JSON.stringify(preferences));
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
      }

      // Save to server if enabled
      if (enablePersistence && userId) {
        try {
          const { tablePreferencesService } = await import('@/services/tablePreferences');
          await tablePreferencesService.savePreferences(preferences);
        } catch (error) {
          console.error('Failed to save preferences to server:', error);
        }
      }

      // Notify callback
      onPreferencesChange?.(preferences);
    };

    savePreferences();
    setHasUnsavedChanges(false);
  }, [
    visibleColumns,
    columnOrder,
    columnWidths,
    pinnedColumns,
    currentView,
    isLoading,
    tableId,
    userId,
    scope,
    enablePersistence,
    finalStorageKey,
    onPreferencesChange
  ]);

  // Column operations
  const toggleColumn = useCallback((columnKey: ColumnId) => {
    setVisibleColumns(prev => {
      const isVisible = prev.includes(columnKey);
      const newVisible = isVisible
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey];
      setHasUnsavedChanges(true);
      return newVisible;
    });
  }, []);

  const showColumns = useCallback((columnIds: ColumnId[]) => {
    setVisibleColumns(prev => {
      const newVisible = Array.from(new Set([...prev, ...columnIds]));
      setHasUnsavedChanges(true);
      return newVisible;
    });
  }, []);

  const hideColumns = useCallback((columnIds: ColumnId[]) => {
    setVisibleColumns(prev => {
      const newVisible = prev.filter(k => !columnIds.includes(k));
      setHasUnsavedChanges(true);
      return newVisible;
    });
  }, []);

  const resetColumns = useCallback(() => {
    setVisibleColumns(defaultVisibleColumns);
    setColumnOrder(defaultColumnOrder);
    setColumnWidths(defaultColumnWidths);
    setPinnedColumns([]);
    setCurrentView(undefined);
    setHasUnsavedChanges(false);
  }, [defaultVisibleColumns, defaultColumnOrder, defaultColumnWidths]);

  const setColumnWidth = useCallback((columnKey: ColumnId, width: number) => {
    setColumnWidths(prev => {
      const newWidths = { ...prev, [columnKey]: width };
      setHasUnsavedChanges(true);
      return newWidths;
    });
  }, []);

  const pinColumn = useCallback((columnKey: ColumnId) => {
    setPinnedColumns(prev => {
      if (prev.includes(columnKey)) return prev;
      const newPinned = [...prev, columnKey];
      setHasUnsavedChanges(true);
      return newPinned;
    });
  }, []);

  const unpinColumn = useCallback((columnKey: ColumnId) => {
    setPinnedColumns(prev => {
      const newPinned = prev.filter(k => k !== columnKey);
      setHasUnsavedChanges(true);
      return newPinned;
    });
  }, []);

  const reorderColumns = useCallback((newOrder: ColumnId[]) => {
    setColumnOrder(newOrder);
    setHasUnsavedChanges(true);
  }, []);

  // View operations
  const saveView = useCallback(
    async (view: Omit<ColumnView, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!enableViews || !userId) {
        throw new Error('Views are not enabled or user ID is missing');
      }

      try {
        const { tablePreferencesService } = await import('@/services/tablePreferences');
        const savedView = await tablePreferencesService.saveView(tableId, {
          ...view,
          createdBy: userId,
          columns: visibleColumns,
          columnWidths,
          pinnedColumns
        });
        setSavedViews(prev => [...prev, savedView]);
        setHasUnsavedChanges(false);
        return savedView;
      } catch (error) {
        console.error('Failed to save view:', error);
        throw error;
      }
    },
    [tableId, userId, enableViews, visibleColumns, columnWidths, pinnedColumns]
  );

  const loadView = useCallback(
    (viewId: string) => {
      const view = savedViews.find(v => v.id === viewId);
      if (view) {
        setVisibleColumns(view.columns);
        if (view.columnWidths) setColumnWidths(view.columnWidths);
        if (view.pinnedColumns) setPinnedColumns(view.pinnedColumns);
        setCurrentView(viewId);
        setHasUnsavedChanges(false);
        onViewLoad?.(view);
      }
    },
    [savedViews, onViewLoad]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      if (!enableViews) {
        throw new Error('Views are not enabled');
      }

      try {
        const { tablePreferencesService } = await import('@/services/tablePreferences');
        await tablePreferencesService.deleteView(viewId);
        setSavedViews(prev => prev.filter(v => v.id !== viewId));
        if (currentView === viewId) {
          setCurrentView(undefined);
        }
      } catch (error) {
        console.error('Failed to delete view:', error);
        throw error;
      }
    },
    [currentView, enableViews]
  );

  const shareView = useCallback(
    async (viewId: string, userIds: string[]) => {
      if (!enableViews) {
        throw new Error('Views are not enabled');
      }

      try {
        const { tablePreferencesService } = await import('@/services/tablePreferences');
        await tablePreferencesService.shareView(viewId, userIds);
        // Update local state
        setSavedViews(prev =>
          prev.map(v =>
            v.id === viewId
              ? { ...v, isShared: true, sharedWith: userIds }
              : v
          )
        );
      } catch (error) {
        console.error('Failed to share view:', error);
        throw error;
      }
    },
    [enableViews]
  );

  const setDefaultView = useCallback(
    async (viewId: string) => {
      if (!enableViews || !userId) {
        throw new Error('Views are not enabled or user ID is missing');
      }

      try {
        const { tablePreferencesService } = await import('@/services/tablePreferences');
        await tablePreferencesService.setDefaultView(tableId, viewId, userId);
        // Update local state
        setSavedViews(prev =>
          prev.map(v => ({
            ...v,
            isDefault: v.id === viewId
          }))
        );
      } catch (error) {
        console.error('Failed to set default view:', error);
        throw error;
      }
    },
    [tableId, userId, enableViews]
  );

  // Compute visible column configs in order
  const visibleColumnConfigs = useMemo(() => {
    return columnOrder
      .filter(key => visibleColumns.includes(key))
      .map(key => columns.find(c => c.key === key))
      .filter((c): c is ColumnConfig<T> => c !== undefined);
  }, [columnOrder, visibleColumns, columns]);

  // Compute fields for API projection
  const projectionFields = useMemo(() => {
    return visibleColumnConfigs
      .map(c => c.fieldPath || c.key)
      .filter(Boolean);
  }, [visibleColumnConfigs]);

  // Build context object
  const context: TableCustomizationContext = {
    tableId,
    columns,
    visibleColumns,
    columnOrder,
    columnWidths,
    pinnedColumns,
    savedViews,
    currentView,
    enableViews,
    enablePersistence,
    isLoading
  };

  // Build actions object
  const actions: TableCustomizationActions = {
    toggleColumn,
    showColumns,
    hideColumns,
    resetColumns,
    setColumnWidth,
    pinColumn,
    unpinColumn,
    reorderColumns,
    saveView,
    loadView,
    deleteView,
    shareView,
    setDefaultView
  };

  return {
    // State
    ...context,
    visibleColumnConfigs,
    projectionFields,
    hasUnsavedChanges,

    // Actions
    ...actions
  };
}

export type TableCustomization = ReturnType<typeof useTableCustomization>;
