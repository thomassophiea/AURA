/**
 * SaveToWorkspace Component
 *
 * A checkbox control that allows users to save any insight widget
 * to their personal Workspace. This component can be embedded in
 * any widget header across the dashboard.
 *
 * Usage:
 * <SaveToWorkspace
 *   widgetId="unique-widget-id"
 *   widgetType="topn_table"
 *   title="Top Clients By Bandwidth"
 *   endpointRefs={['clients.list']}
 *   sourcePage="clients"
 * />
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from './ui/utils';
import {
  saveWidgetToWorkspace,
  removeWidgetFromWorkspace,
  isWidgetSavedToWorkspace,
  createWidgetReference,
  type PersistedWidgetReference,
} from '@/services/workspacePersistence';

export interface SaveToWorkspaceProps {
  // Required identification
  widgetId: string;
  widgetType: string;
  title: string;
  endpointRefs: string[];

  // Optional configuration
  sourcePage?: string;
  catalogId?: string;
  columns?: string[];
  filters?: Record<string, any>;
  timeRange?: string;
  metricSelection?: string[];

  // Layout hints (optional)
  layoutPosition?: { x: number; y: number };
  layoutSize?: { width: number; height: number };

  // Callbacks
  onSave?: (widgetId: string) => void;
  onRemove?: (widgetId: string) => void;
  onError?: (error: string) => void;

  // Styling
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const SaveToWorkspace: React.FC<SaveToWorkspaceProps> = ({
  widgetId,
  widgetType,
  title,
  endpointRefs,
  sourcePage = 'dashboard',
  catalogId,
  columns,
  filters,
  timeRange,
  metricSelection,
  layoutPosition,
  layoutSize,
  onSave,
  onRemove,
  onError,
  className,
  showLabel = false,
  size = 'sm',
}) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check initial saved state
  useEffect(() => {
    setIsSaved(isWidgetSavedToWorkspace(widgetId));
  }, [widgetId]);

  const handleToggle = useCallback(async () => {
    setIsLoading(true);

    try {
      if (isSaved) {
        // Remove from workspace
        const success = removeWidgetFromWorkspace(widgetId);
        if (success) {
          setIsSaved(false);
          onRemove?.(widgetId);
        } else {
          onError?.('Failed to remove widget from Workspace');
        }
      } else {
        // Save to workspace
        const widgetRef = createWidgetReference(
          widgetId,
          widgetType,
          title,
          endpointRefs,
          {
            catalog_id: catalogId,
            columns,
            filters,
            time_range: timeRange,
            metric_selection: metricSelection,
            layout_position: layoutPosition,
            layout_size: layoutSize,
            source_page: sourcePage,
            source_widget_id: widgetId,
          }
        );

        const success = saveWidgetToWorkspace(widgetRef);
        if (success) {
          setIsSaved(true);
          onSave?.(widgetId);
        } else {
          onError?.('Widget could not be saved to Workspace');
        }
      }
    } catch (error) {
      console.error('[SaveToWorkspace] Error:', error);
      onError?.(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [
    isSaved,
    widgetId,
    widgetType,
    title,
    endpointRefs,
    catalogId,
    columns,
    filters,
    timeRange,
    metricSelection,
    layoutPosition,
    layoutSize,
    sourcePage,
    onSave,
    onRemove,
    onError,
  ]);

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const Icon = isSaved ? BookmarkCheck : Bookmark;

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md transition-colors',
        'text-muted-foreground hover:text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isSaved && 'text-primary hover:text-primary/80',
        className
      )}
      title={isSaved ? 'Remove from Workspace' : 'Save to Workspace'}
      aria-label={isSaved ? 'Remove from Workspace' : 'Save to Workspace'}
      aria-pressed={isSaved}
    >
      <Icon
        className={cn(
          sizeClasses[size],
          isLoading && 'animate-pulse',
          isSaved && 'fill-current'
        )}
      />
      {showLabel && (
        <span className="text-xs font-medium">
          {isSaved ? 'Saved' : 'Save to Workspace'}
        </span>
      )}
    </button>
  );
};

/**
 * Simplified hook for components that need to check/update saved state
 */
export function useSaveToWorkspace(widgetId: string) {
  const [isSaved, setIsSaved] = useState(() => isWidgetSavedToWorkspace(widgetId));

  const save = useCallback((widget: PersistedWidgetReference) => {
    const success = saveWidgetToWorkspace(widget);
    if (success) setIsSaved(true);
    return success;
  }, []);

  const remove = useCallback(() => {
    const success = removeWidgetFromWorkspace(widgetId);
    if (success) setIsSaved(false);
    return success;
  }, [widgetId]);

  const toggle = useCallback((widget: PersistedWidgetReference) => {
    if (isSaved) {
      return remove();
    } else {
      return save(widget);
    }
  }, [isSaved, save, remove]);

  // Re-check on mount
  useEffect(() => {
    setIsSaved(isWidgetSavedToWorkspace(widgetId));
  }, [widgetId]);

  return { isSaved, save, remove, toggle };
}

export default SaveToWorkspace;
