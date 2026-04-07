/**
 * useSiteContexts Hook
 *
 * Manages site context configurations with localStorage persistence.
 * Provides CRUD operations for context groups and their metrics.
 */

import { useState, useEffect, useCallback } from 'react';
import { SiteContext, DEFAULT_CONTEXTS } from '../types/siteContext';

const STORAGE_KEY = 'site_contexts';
const SELECTED_CONTEXT_KEY = 'selected_site_context';

export function useSiteContexts() {
  const [contexts, setContexts] = useState<SiteContext[]>([]);
  const [selectedContextId, setSelectedContextId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Load contexts from localStorage on mount
  useEffect(() => {
    loadContexts();
    loadSelectedContext();
  }, []);

  // Save contexts to localStorage whenever they change
  useEffect(() => {
    if (!isLoading && contexts.length > 0) {
      saveContexts();
    }
  }, [contexts, isLoading]);

  // Save selected context whenever it changes
  useEffect(() => {
    if (!isLoading) {
      saveSelectedContext();
    }
  }, [selectedContextId, isLoading]);

  const loadContexts = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SiteContext[];
        setContexts(parsed);
      } else {
        // Initialize with default contexts
        setContexts(DEFAULT_CONTEXTS);
      }
    } catch (error) {
      console.error('[useSiteContexts] Failed to load contexts:', error);
      setContexts(DEFAULT_CONTEXTS);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSelectedContext = () => {
    try {
      const stored = localStorage.getItem(SELECTED_CONTEXT_KEY);
      if (stored) {
        setSelectedContextId(stored);
      }
    } catch (error) {
      console.error('[useSiteContexts] Failed to load selected context:', error);
    }
  };

  const saveContexts = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(contexts));
    } catch (error) {
      console.error('[useSiteContexts] Failed to save contexts:', error);
    }
  };

  const saveSelectedContext = () => {
    try {
      localStorage.setItem(SELECTED_CONTEXT_KEY, selectedContextId);
    } catch (error) {
      console.error('[useSiteContexts] Failed to save selected context:', error);
    }
  };

  const addContext = useCallback((context: Omit<SiteContext, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newContext: SiteContext = {
      ...context,
      id: `custom-${Date.now()}`,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setContexts(prev => [...prev, newContext]);
    return newContext;
  }, []);

  const updateContext = useCallback((id: string, updates: Partial<SiteContext>) => {
    setContexts(prev => prev.map(ctx =>
      ctx.id === id
        ? { ...ctx, ...updates, updatedAt: new Date().toISOString() }
        : ctx
    ));
  }, []);

  const deleteContext = useCallback((id: string) => {
    setContexts(prev => prev.filter(ctx => ctx.id !== id));
    // If the deleted context was selected, reset to 'all'
    if (selectedContextId === id) {
      setSelectedContextId('all');
    }
  }, [selectedContextId]);

  const getContext = useCallback((id: string) => {
    return contexts.find(ctx => ctx.id === id);
  }, [contexts]);

  const selectContext = useCallback((id: string) => {
    setSelectedContextId(id);
  }, []);

  const resetToDefaults = useCallback(() => {
    setContexts(DEFAULT_CONTEXTS);
    setSelectedContextId('all');
  }, []);

  const selectedContext = selectedContextId === 'all'
    ? null
    : getContext(selectedContextId);

  return {
    contexts,
    selectedContextId,
    selectedContext,
    isLoading,
    addContext,
    updateContext,
    deleteContext,
    getContext,
    selectContext,
    resetToDefaults
  };
}
