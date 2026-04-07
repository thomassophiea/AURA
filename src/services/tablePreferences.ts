/**
 * Table Preferences Service
 *
 * Handles persistence of table customization preferences including:
 * - Column visibility, ordering, widths, pinning
 * - Saved views
 * - User and organization-level defaults
 *
 * Storage Strategy:
 * 1. LocalStorage - Always used as fast cache and fallback
 * 2. Supabase - Server persistence for cross-device sync
 */

import { supabase } from './supabaseClient';
import {
  TablePreferences,
  ColumnView,
  PreferenceScope,
  TableId
} from '@/types/table';

export class TablePreferencesService {
  private static instance: TablePreferencesService;

  private constructor() {}

  static getInstance(): TablePreferencesService {
    if (!TablePreferencesService.instance) {
      TablePreferencesService.instance = new TablePreferencesService();
    }
    return TablePreferencesService.instance;
  }

  /**
   * Fetch user preferences for a table
   */
  async fetchPreferences(
    tableId: TableId,
    userId: string,
    scope: PreferenceScope = 'user'
  ): Promise<TablePreferences | null> {
    try {
      const { data, error } = await supabase
        .from('table_preferences')
        .select('*')
        .eq('table_id', tableId)
        .eq('user_id', userId)
        .eq('scope', scope)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No data found - not an error
          return null;
        }
        throw error;
      }

      if (!data) return null;

      return {
        tableId: data.table_id,
        userId: data.user_id,
        scope: data.scope,
        visibleColumns: data.visible_columns,
        columnOrder: data.column_order,
        columnWidths: data.column_widths,
        pinnedColumns: data.pinned_columns,
        currentView: data.current_view,
        lastModified: data.updated_at
      };
    } catch (error) {
      console.error('[TablePreferences] Failed to fetch preferences:', error);
      return null;
    }
  }

  /**
   * Save user preferences for a table
   */
  async savePreferences(preferences: TablePreferences): Promise<void> {
    if (!preferences.userId) {
      throw new Error('User ID is required to save preferences');
    }

    try {
      const { error } = await supabase
        .from('table_preferences')
        .upsert({
          table_id: preferences.tableId,
          user_id: preferences.userId,
          scope: preferences.scope || 'user',
          visible_columns: preferences.visibleColumns,
          column_order: preferences.columnOrder,
          column_widths: preferences.columnWidths,
          pinned_columns: preferences.pinnedColumns,
          current_view: preferences.currentView,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'table_id,user_id,scope'
        });

      if (error) throw error;
    } catch (error) {
      console.error('[TablePreferences] Failed to save preferences:', error);
      throw error;
    }
  }

  /**
   * Fetch all saved views for a table
   */
  async fetchViews(
    tableId: TableId,
    userId: string
  ): Promise<ColumnView[]> {
    try {
      const { data, error } = await supabase
        .from('table_views')
        .select('*')
        .eq('table_id', tableId)
        .or(`created_by.eq.${userId},is_shared.eq.true`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        tableId: row.table_id,
        columns: row.columns,
        columnWidths: row.column_widths,
        pinnedColumns: row.pinned_columns,
        createdBy: row.created_by,
        isShared: row.is_shared,
        sharedWith: row.shared_with,
        isDefault: row.is_default,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('[TablePreferences] Failed to fetch views:', error);
      return [];
    }
  }

  /**
   * Save a new view or update existing
   */
  async saveView(
    tableId: TableId,
    view: Partial<ColumnView> & { name: string; createdBy: string }
  ): Promise<ColumnView> {
    try {
      const viewData = {
        id: view.id,
        table_id: tableId,
        name: view.name,
        description: view.description,
        columns: view.columns,
        column_widths: view.columnWidths,
        pinned_columns: view.pinnedColumns,
        created_by: view.createdBy,
        is_shared: view.isShared || false,
        shared_with: view.sharedWith || [],
        is_default: view.isDefault || false,
        updated_at: new Date().toISOString()
      };

      if (view.id) {
        // Update existing
        const { data, error } = await supabase
          .from('table_views')
          .update(viewData)
          .eq('id', view.id)
          .select()
          .single();

        if (error) throw error;
        return this.mapViewFromDb(data);
      } else {
        // Create new
        const { data, error } = await supabase
          .from('table_views')
          .insert({
            ...viewData,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;
        return this.mapViewFromDb(data);
      }
    } catch (error) {
      console.error('[TablePreferences] Failed to save view:', error);
      throw error;
    }
  }

  /**
   * Delete a saved view
   */
  async deleteView(viewId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('table_views')
        .delete()
        .eq('id', viewId);

      if (error) throw error;
    } catch (error) {
      console.error('[TablePreferences] Failed to delete view:', error);
      throw error;
    }
  }

  /**
   * Share a view with other users
   */
  async shareView(viewId: string, userIds: string[]): Promise<void> {
    try {
      const { error} = await supabase
        .from('table_views')
        .update({
          is_shared: true,
          shared_with: userIds,
          updated_at: new Date().toISOString()
        })
        .eq('id', viewId);

      if (error) throw error;
    } catch (error) {
      console.error('[TablePreferences] Failed to share view:', error);
      throw error;
    }
  }

  /**
   * Set a view as default for a user
   */
  async setDefaultView(
    tableId: TableId,
    viewId: string,
    userId: string
  ): Promise<void> {
    try {
      // First, unset any existing default for this table/user
      await supabase
        .from('table_views')
        .update({ is_default: false })
        .eq('table_id', tableId)
        .eq('created_by', userId);

      // Set the new default
      const { error } = await supabase
        .from('table_views')
        .update({
          is_default: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', viewId);

      if (error) throw error;
    } catch (error) {
      console.error('[TablePreferences] Failed to set default view:', error);
      throw error;
    }
  }

  /**
   * Get default view for a table and user
   */
  async getDefaultView(
    tableId: TableId,
    userId: string
  ): Promise<ColumnView | null> {
    try {
      const { data, error } = await supabase
        .from('table_views')
        .select('*')
        .eq('table_id', tableId)
        .eq('created_by', userId)
        .eq('is_default', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return data ? this.mapViewFromDb(data) : null;
    } catch (error) {
      console.error('[TablePreferences] Failed to get default view:', error);
      return null;
    }
  }

  /**
   * Delete all preferences for a table (admin/cleanup)
   */
  async deleteTablePreferences(tableId: TableId): Promise<void> {
    try {
      await supabase
        .from('table_preferences')
        .delete()
        .eq('table_id', tableId);

      await supabase
        .from('table_views')
        .delete()
        .eq('table_id', tableId);
    } catch (error) {
      console.error('[TablePreferences] Failed to delete table preferences:', error);
      throw error;
    }
  }

  /**
   * Export preferences as JSON (for backup/migration)
   */
  async exportPreferences(
    tableId: TableId,
    userId: string
  ): Promise<{ preferences: TablePreferences | null; views: ColumnView[] }> {
    try {
      const [preferences, views] = await Promise.all([
        this.fetchPreferences(tableId, userId),
        this.fetchViews(tableId, userId)
      ]);

      return { preferences, views };
    } catch (error) {
      console.error('[TablePreferences] Failed to export preferences:', error);
      throw error;
    }
  }

  /**
   * Import preferences from JSON (for backup/migration)
   */
  async importPreferences(
    data: { preferences: TablePreferences; views: ColumnView[] }
  ): Promise<void> {
    try {
      if (data.preferences) {
        await this.savePreferences(data.preferences);
      }

      for (const view of data.views) {
        await this.saveView(view.tableId, view);
      }
    } catch (error) {
      console.error('[TablePreferences] Failed to import preferences:', error);
      throw error;
    }
  }

  /**
   * Helper to map database row to ColumnView
   */
  private mapViewFromDb(row: any): ColumnView {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tableId: row.table_id,
      columns: row.columns,
      columnWidths: row.column_widths,
      pinnedColumns: row.pinned_columns,
      createdBy: row.created_by,
      isShared: row.is_shared,
      sharedWith: row.shared_with,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

// Export singleton instance
export const tablePreferencesService = TablePreferencesService.getInstance();
