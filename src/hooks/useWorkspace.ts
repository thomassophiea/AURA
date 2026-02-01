/**
 * Workspace state management hook
 *
 * Manages workspace widgets with per-user persistence.
 * Provides state for topic selection, widgets, and widget operations.
 */

import { useState, useEffect, useCallback } from 'react';

export type WorkspaceTopic = 'Devices' | 'Clients' | 'Licensing' | 'Alerts';

export interface WorkspaceWidget {
  id: string;
  topic: WorkspaceTopic;
  prompt: string;
  title: string;
  createdAt: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isLoading?: boolean;
  error?: string | null;
  data?: any;
}

export interface WorkspaceState {
  widgets: WorkspaceWidget[];
  selectedTopic: WorkspaceTopic | null;
}

const STORAGE_KEY = 'workspace_state';

const defaultState: WorkspaceState = {
  widgets: [],
  selectedTopic: null,
};

/**
 * Generate a unique widget ID
 */
function generateWidgetId(): string {
  return `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hook for managing workspace state
 */
export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>(() => {
    // Load from localStorage on initialization
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...defaultState, ...parsed };
      }
    } catch (error) {
      console.warn('[Workspace] Failed to load from localStorage:', error);
    }
    return defaultState;
  });

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[Workspace] Failed to save to localStorage:', error);
    }
  }, [state]);

  /**
   * Select a topic
   */
  const selectTopic = useCallback((topic: WorkspaceTopic | null) => {
    setState(prev => ({ ...prev, selectedTopic: topic }));
  }, []);

  /**
   * Create a new widget from a prompt
   */
  const createWidget = useCallback((prompt: string, topic: WorkspaceTopic): WorkspaceWidget => {
    const newWidget: WorkspaceWidget = {
      id: generateWidgetId(),
      topic,
      prompt,
      title: prompt,
      createdAt: Date.now(),
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      isLoading: true,
      error: null,
      data: null,
    };

    setState(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget],
    }));

    return newWidget;
  }, []);

  /**
   * Update a widget's state
   */
  const updateWidget = useCallback((id: string, updates: Partial<WorkspaceWidget>) => {
    setState(prev => ({
      ...prev,
      widgets: prev.widgets.map(widget =>
        widget.id === id ? { ...widget, ...updates } : widget
      ),
    }));
  }, []);

  /**
   * Delete a widget
   */
  const deleteWidget = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      widgets: prev.widgets.filter(widget => widget.id !== id),
    }));
  }, []);

  /**
   * Move a widget to a new position
   */
  const moveWidget = useCallback((id: string, position: { x: number; y: number }) => {
    updateWidget(id, { position });
  }, [updateWidget]);

  /**
   * Resize a widget
   */
  const resizeWidget = useCallback((id: string, size: { width: number; height: number }) => {
    updateWidget(id, { size });
  }, [updateWidget]);

  /**
   * Refresh a widget (mark as loading)
   */
  const refreshWidget = useCallback((id: string) => {
    updateWidget(id, { isLoading: true, error: null });
  }, [updateWidget]);

  /**
   * Clear all widgets
   */
  const clearWorkspace = useCallback(() => {
    setState(prev => ({
      ...prev,
      widgets: [],
    }));
  }, []);

  /**
   * Check if workspace has any widgets
   */
  const hasWidgets = state.widgets.length > 0;

  return {
    // State
    widgets: state.widgets,
    selectedTopic: state.selectedTopic,
    hasWidgets,

    // Actions
    selectTopic,
    createWidget,
    updateWidget,
    deleteWidget,
    moveWidget,
    resizeWidget,
    refreshWidget,
    clearWorkspace,
  };
}

/**
 * Prompt suggestions organized by topic
 */
export const PROMPT_SUGGESTIONS: Record<WorkspaceTopic, string[]> = {
  Devices: [
    'List my cloud managed wireless devices',
    'How many managed devices do I have? Include stack members',
    'Which devices have been up for more than 24 hours',
    'Which switches have memory usage in a warning state',
    'Which switch has the highest CPU usage',
    'Which devices will be end of service before July 1 2026',
  ],
  Clients: [
    'How many clients are connected right now',
    'Which clients are consuming the most bandwidth',
    'Show roaming clients in the last 24 hours',
  ],
  Licensing: [
    'How many licenses are in use vs available',
    'Which sites are nearing license exhaustion',
    'Show licenses expiring in the next 90 days',
  ],
  Alerts: [
    'Show active critical alerts',
    'Which devices have recurring alerts',
    'Alerts opened in the last 24 hours',
  ],
};

/**
 * Topic colors for badges and indicators
 */
export const TOPIC_COLORS: Record<WorkspaceTopic, { bg: string; text: string; border: string }> = {
  Devices: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
  },
  Clients: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  Licensing: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  Alerts: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/20',
  },
};
