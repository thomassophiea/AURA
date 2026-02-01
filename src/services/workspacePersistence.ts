/**
 * Workspace Persistence Service
 *
 * Handles saving and restoring user-specific workspace widget state.
 * Implements the SaveWidgetToWorkspace feature allowing users to persist
 * any insight widget to their personal Workspace.
 *
 * Internal Principle: "Workspace is a personal analytical memory,
 * not a modification of the product"
 */

import { WIDGET_CATALOG, type WidgetCatalogItem, type WorkspaceWidget } from '@/hooks/useWorkspace';

/**
 * Persisted widget reference - what we store for saved widgets
 */
export interface PersistedWidgetReference {
  // Core identity
  widget_id: string;
  widget_type: string;
  catalog_id?: string;

  // Data binding
  data_endpoint_refs: string[];

  // Configuration
  title: string;
  metric_selection?: string[];
  filters?: Record<string, any>;
  time_range?: string;
  columns?: string[];

  // Layout
  layout_position?: { x: number; y: number };
  layout_size?: { width: number; height: number };

  // Linking
  cross_widget_linking_state?: {
    isLinked: boolean;
    linkedWidgets?: string[];
  };

  // Source tracking
  source_page?: string;
  source_widget_id?: string;

  // Timestamps
  saved_at: number;
  last_updated?: number;
}

/**
 * Workspace state stored per user
 */
export interface WorkspacePersistedState {
  version: number;
  user_id?: string;
  widgets: PersistedWidgetReference[];
  canvas_layout?: {
    columns: number;
    gap: number;
  };
  last_modified: number;
}

const STORAGE_KEY = 'workspace_saved_widgets';
const STORAGE_VERSION = 1;

/**
 * Load persisted workspace state from storage
 */
export function loadWorkspaceState(): WorkspacePersistedState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const state = JSON.parse(stored) as WorkspacePersistedState;

    // Version migration if needed
    if (state.version !== STORAGE_VERSION) {
      return migrateState(state);
    }

    return state;
  } catch (error) {
    console.warn('[WorkspacePersistence] Failed to load state:', error);
    return null;
  }
}

/**
 * Save workspace state to storage
 */
export function saveWorkspaceState(state: WorkspacePersistedState): boolean {
  try {
    state.version = STORAGE_VERSION;
    state.last_modified = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn('[WorkspacePersistence] Failed to save state:', error);
    return false;
  }
}

/**
 * Add a widget reference to workspace
 */
export function saveWidgetToWorkspace(widget: PersistedWidgetReference): boolean {
  const state = loadWorkspaceState() || createEmptyState();

  // Validate before save
  if (!validateWidgetForSave(widget)) {
    console.warn('[WorkspacePersistence] Widget failed validation:', widget.widget_id);
    return false;
  }

  // Check if already exists
  const existingIndex = state.widgets.findIndex(w => w.widget_id === widget.widget_id);

  if (existingIndex >= 0) {
    // Update existing
    state.widgets[existingIndex] = {
      ...state.widgets[existingIndex],
      ...widget,
      last_updated: Date.now(),
    };
  } else {
    // Add new
    widget.saved_at = Date.now();
    state.widgets.push(widget);
  }

  return saveWorkspaceState(state);
}

/**
 * Remove a widget reference from workspace
 */
export function removeWidgetFromWorkspace(widgetId: string): boolean {
  const state = loadWorkspaceState();
  if (!state) return true; // Nothing to remove

  const initialLength = state.widgets.length;
  state.widgets = state.widgets.filter(w => w.widget_id !== widgetId);

  if (state.widgets.length !== initialLength) {
    return saveWorkspaceState(state);
  }

  return true;
}

/**
 * Check if a widget is saved to workspace
 */
export function isWidgetSavedToWorkspace(widgetId: string): boolean {
  const state = loadWorkspaceState();
  if (!state) return false;

  return state.widgets.some(w => w.widget_id === widgetId);
}

/**
 * Get all saved widget references
 */
export function getSavedWidgets(): PersistedWidgetReference[] {
  const state = loadWorkspaceState();
  return state?.widgets || [];
}

/**
 * Update a saved widget's state (filters, time range, position, etc.)
 */
export function updateSavedWidget(
  widgetId: string,
  updates: Partial<PersistedWidgetReference>
): boolean {
  const state = loadWorkspaceState();
  if (!state) return false;

  const widgetIndex = state.widgets.findIndex(w => w.widget_id === widgetId);
  if (widgetIndex < 0) return false;

  state.widgets[widgetIndex] = {
    ...state.widgets[widgetIndex],
    ...updates,
    last_updated: Date.now(),
  };

  return saveWorkspaceState(state);
}

/**
 * Convert a persisted widget reference to a WorkspaceWidget for rendering
 */
export function hydrateWidgetFromReference(
  ref: PersistedWidgetReference
): WorkspaceWidget | null {
  // Try to find matching catalog item
  const catalogItem = ref.catalog_id
    ? WIDGET_CATALOG.find(c => c.id === ref.catalog_id)
    : findCatalogItemByEndpoint(ref.data_endpoint_refs[0]);

  if (!catalogItem) {
    console.warn('[WorkspacePersistence] Could not find catalog item for widget:', ref.widget_id);
    // Create a generic widget anyway
    return createGenericWidget(ref);
  }

  return {
    id: ref.widget_id,
    catalogId: catalogItem.id,
    type: catalogItem.type,
    topic: catalogItem.topic,
    title: ref.title || catalogItem.title,
    description: catalogItem.description,
    columns: ref.columns || catalogItem.columns,
    dataBinding: catalogItem.dataBinding,
    interaction: catalogItem.interaction,
    isLoading: true, // Will be loaded on mount
    isLinked: ref.cross_widget_linking_state?.isLinked ?? true,
    localFilters: ref.filters,
    data: null,
    error: null,
    lastUpdated: ref.last_updated,
  };
}

/**
 * Create a PersistedWidgetReference from an existing insight widget
 */
export function createWidgetReference(
  widgetId: string,
  widgetType: string,
  title: string,
  endpointRefs: string[],
  options: Partial<PersistedWidgetReference> = {}
): PersistedWidgetReference {
  return {
    widget_id: widgetId,
    widget_type: widgetType,
    title,
    data_endpoint_refs: endpointRefs,
    saved_at: Date.now(),
    ...options,
  };
}

// ============================================
// Internal helpers
// ============================================

function createEmptyState(): WorkspacePersistedState {
  return {
    version: STORAGE_VERSION,
    widgets: [],
    last_modified: Date.now(),
  };
}

function migrateState(state: WorkspacePersistedState): WorkspacePersistedState {
  // Handle version migrations here
  console.log('[WorkspacePersistence] Migrating state from version', state.version);
  state.version = STORAGE_VERSION;
  return state;
}

function validateWidgetForSave(widget: PersistedWidgetReference): boolean {
  // Must have required fields
  if (!widget.widget_id || !widget.widget_type || !widget.title) {
    return false;
  }

  // Must use real data endpoints
  if (!widget.data_endpoint_refs || widget.data_endpoint_refs.length === 0) {
    return false;
  }

  // Must be wireless-related (check endpoint refs)
  const validPrefixes = [
    'access_points',
    'clients',
    'client_experience',
    'app_insights',
    'contextual_insights',
  ];

  const hasValidEndpoint = widget.data_endpoint_refs.some(ref =>
    validPrefixes.some(prefix => ref.startsWith(prefix))
  );

  if (!hasValidEndpoint) {
    console.warn('[WorkspacePersistence] Widget does not use wireless endpoints:', widget.data_endpoint_refs);
    return false;
  }

  return true;
}

function findCatalogItemByEndpoint(endpointRef: string): WidgetCatalogItem | undefined {
  return WIDGET_CATALOG.find(item => item.dataBinding.endpointRef === endpointRef);
}

function createGenericWidget(ref: PersistedWidgetReference): WorkspaceWidget {
  return {
    id: ref.widget_id,
    catalogId: ref.catalog_id || 'custom',
    type: ref.widget_type as any,
    topic: 'ContextualInsights', // Default
    title: ref.title,
    description: 'Saved widget',
    columns: ref.columns,
    dataBinding: {
      endpointRef: ref.data_endpoint_refs[0],
    },
    isLoading: true,
    isLinked: ref.cross_widget_linking_state?.isLinked ?? true,
    localFilters: ref.filters,
    data: null,
    error: null,
  };
}

/**
 * Generate a unique widget ID for saving
 */
export function generateSavedWidgetId(sourcePage: string, sourceWidgetType: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `saved_${sourcePage}_${sourceWidgetType}_${timestamp}_${random}`;
}

/**
 * Debounced save helper for state management
 */
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSaveState(state: WorkspacePersistedState, delay = 500): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveWorkspaceState(state);
    saveTimeout = null;
  }, delay);
}
