/**
 * Column Customization Hook
 *
 * Reusable hook for managing table column visibility and customization.
 * Persists preferences to localStorage per-component.
 */

import { useState, useEffect } from 'react';

export interface ColumnConfig {
  key: string;
  label: string;
  defaultVisible: boolean;
  category?: 'basic' | 'network' | 'status' | 'performance' | 'hardware' | 'advanced';
  description?: string;
}

export interface UseColumnCustomizationOptions {
  componentId: string;
  availableColumns: ColumnConfig[];
  storageKey?: string;
}

/**
 * Hook for managing column visibility in tables
 */
export function useColumnCustomization({
  componentId,
  availableColumns,
  storageKey
}: UseColumnCustomizationOptions) {
  const storageKeyName = storageKey || `${componentId}_visible_columns`;

  // Initialize visible columns from localStorage or defaults
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKeyName);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that saved columns still exist in availableColumns
        const validKeys = new Set(availableColumns.map(c => c.key));
        const validSaved = parsed.filter((key: string) => validKeys.has(key));
        if (validSaved.length > 0) {
          return validSaved;
        }
      }
    } catch (error) {
      console.warn(`[ColumnCustomization] Failed to load saved columns for ${componentId}:`, error);
    }

    // Return default visible columns
    return availableColumns
      .filter(col => col.defaultVisible)
      .map(col => col.key);
  });

  // Save to localStorage whenever visibleColumns changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKeyName, JSON.stringify(visibleColumns));
    } catch (error) {
      console.warn(`[ColumnCustomization] Failed to save columns for ${componentId}:`, error);
    }
  }, [visibleColumns, storageKeyName, componentId]);

  /**
   * Toggle visibility of a single column
   */
  const toggleColumn = (columnKey: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(columnKey)) {
        // Don't allow hiding all columns
        if (prev.length === 1) {
          console.warn('[ColumnCustomization] Cannot hide the last visible column');
          return prev;
        }
        return prev.filter(key => key !== columnKey);
      } else {
        return [...prev, columnKey];
      }
    });
  };

  /**
   * Show a column
   */
  const showColumn = (columnKey: string) => {
    setVisibleColumns(prev => {
      if (!prev.includes(columnKey)) {
        return [...prev, columnKey];
      }
      return prev;
    });
  };

  /**
   * Hide a column
   */
  const hideColumn = (columnKey: string) => {
    setVisibleColumns(prev => {
      if (prev.includes(columnKey) && prev.length > 1) {
        return prev.filter(key => key !== columnKey);
      }
      return prev;
    });
  };

  /**
   * Show all columns
   */
  const showAllColumns = () => {
    setVisibleColumns(availableColumns.map(col => col.key));
  };

  /**
   * Hide all columns in a category
   */
  const hideCategory = (category: string) => {
    const categoryKeys = availableColumns
      .filter(col => col.category === category)
      .map(col => col.key);

    setVisibleColumns(prev => {
      const remaining = prev.filter(key => !categoryKeys.includes(key));
      // Keep at least one column visible
      return remaining.length > 0 ? remaining : prev;
    });
  };

  /**
   * Show all columns in a category
   */
  const showCategory = (category: string) => {
    const categoryKeys = availableColumns
      .filter(col => col.category === category)
      .map(col => col.key);

    setVisibleColumns(prev => {
      const newKeys = categoryKeys.filter(key => !prev.includes(key));
      return [...prev, ...newKeys];
    });
  };

  /**
   * Reset to default column visibility
   */
  const resetToDefaults = () => {
    const defaults = availableColumns
      .filter(col => col.defaultVisible)
      .map(col => col.key);
    setVisibleColumns(defaults);
  };

  /**
   * Set visible columns directly
   */
  const setColumns = (columnKeys: string[]) => {
    // Validate that columns exist
    const validKeys = new Set(availableColumns.map(c => c.key));
    const validated = columnKeys.filter(key => validKeys.has(key));

    // Ensure at least one column is visible
    if (validated.length > 0) {
      setVisibleColumns(validated);
    } else {
      console.warn('[ColumnCustomization] Cannot set empty column list');
    }
  };

  /**
   * Check if a column is visible
   */
  const isColumnVisible = (columnKey: string): boolean => {
    return visibleColumns.includes(columnKey);
  };

  /**
   * Get columns grouped by category
   */
  const getColumnsByCategory = () => {
    const categories = new Map<string, ColumnConfig[]>();

    availableColumns.forEach(col => {
      const category = col.category || 'other';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(col);
    });

    return categories;
  };

  /**
   * Get visible column configs
   */
  const visibleColumnConfigs = availableColumns.filter(col =>
    visibleColumns.includes(col.key)
  );

  /**
   * Get hidden column configs
   */
  const hiddenColumnConfigs = availableColumns.filter(col =>
    !visibleColumns.includes(col.key)
  );

  return {
    // State
    visibleColumns,
    visibleColumnConfigs,
    hiddenColumnConfigs,

    // Single column operations
    toggleColumn,
    showColumn,
    hideColumn,
    isColumnVisible,

    // Bulk operations
    showAllColumns,
    setColumns,
    resetToDefaults,

    // Category operations
    showCategory,
    hideCategory,
    getColumnsByCategory,

    // Stats
    visibleCount: visibleColumns.length,
    totalCount: availableColumns.length,
    hasCustomization: JSON.stringify(visibleColumns) !== JSON.stringify(
      availableColumns.filter(c => c.defaultVisible).map(c => c.key)
    )
  };
}
