import { useState, useEffect, useCallback, useRef } from 'react';

export type TimelineScope = 'client-insights' | 'ap-insights';

interface TimeWindow {
  start: number | null;
  end: number | null;
}

interface TimelineState {
  currentTime: number | null;
  timeWindow: TimeWindow;
  isLocked: boolean;
}

// Module-level state storage per scope
const scopedState: Record<TimelineScope, TimelineState> = {
  'client-insights': {
    currentTime: null,
    timeWindow: { start: null, end: null },
    isLocked: false,
  },
  'ap-insights': {
    currentTime: null,
    timeWindow: { start: null, end: null },
    isLocked: false,
  },
};

// Listener management per scope
const listeners: Record<TimelineScope, Set<() => void>> = {
  'client-insights': new Set(),
  'ap-insights': new Set(),
};

// Notify all listeners for a specific scope
function notifyListeners(scope: TimelineScope): void {
  listeners[scope].forEach((listener) => listener());
}

// Get current state for a scope
function getState(scope: TimelineScope): TimelineState {
  return scopedState[scope];
}

// Update state for a scope and notify listeners
function setState(scope: TimelineScope, updates: Partial<TimelineState>): void {
  scopedState[scope] = { ...scopedState[scope], ...updates };
  notifyListeners(scope);
}

interface UseTimelineNavigationOptions {
  /**
   * Don't re-render this subscriber for cursor moves while unlocked. For a
   * component that only renders locked-cursor UI (a chart grid with a pinned
   * reference line), hover tracking then costs nothing: recharts' native
   * synced tooltip cursor is the live indicator, and heavy charts re-render
   * only on lock/unlock, window-drag, or data changes. Live readouts (the
   * timeline controls, the correlation strip) subscribe without this.
   */
  ignoreUnlockedCursorMoves?: boolean;
}

/**
 * Hook for correlated timeline navigation across charts
 * Provides synchronized cursor, time window selection, and lock functionality
 * State is scoped per page (client-insights vs ap-insights)
 */
export function useTimelineNavigation(
  scope: TimelineScope,
  options?: UseTimelineNavigationOptions
) {
  const [state, setLocalState] = useState<TimelineState>(() => getState(scope));
  const rafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const ignoreUnlockedCursorMoves = options?.ignoreUnlockedCursorMoves ?? false;

  // Subscribe to state changes
  useEffect(() => {
    const listener = () => {
      const next = getState(scope);
      setLocalState((prev) => {
        // While unlocked with the window untouched, the only thing that can
        // differ is the hover cursor — skip it for subscribers that opted out.
        if (
          ignoreUnlockedCursorMoves &&
          !next.isLocked &&
          !prev.isLocked &&
          prev.timeWindow === next.timeWindow
        ) {
          return prev;
        }
        return next;
      });
    };

    listeners[scope].add(listener);
    return () => {
      listeners[scope].delete(listener);
    };
  }, [scope, ignoreUnlockedCursorMoves]);

  // Set current time (throttled with requestAnimationFrame)
  const setCurrentTime = useCallback(
    (timestamp: number | null) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const currentState = getState(scope);
        // Skip identical values: recharts snaps the hover label to data
        // points, so most mousemove frames repeat the previous timestamp, and
        // publishing them re-rendered every chart on every frame.
        if (!currentState.isLocked && currentState.currentTime !== timestamp) {
          setState(scope, { currentTime: timestamp });
        }
        rafRef.current = null;
      });
    },
    [scope]
  );

  // Toggle lock state
  const toggleLock = useCallback(() => {
    const currentState = getState(scope);
    setState(scope, { isLocked: !currentState.isLocked });
  }, [scope]);

  // Start time window selection
  const startTimeWindow = useCallback(
    (timestamp: number) => {
      isDraggingRef.current = true;
      setState(scope, {
        timeWindow: { start: timestamp, end: timestamp },
      });
    },
    [scope]
  );

  // Update time window end during drag
  const updateTimeWindow = useCallback(
    (timestamp: number) => {
      if (isDraggingRef.current) {
        const currentState = getState(scope);
        if (currentState.timeWindow.start !== null && currentState.timeWindow.end !== timestamp) {
          setState(scope, {
            timeWindow: { ...currentState.timeWindow, end: timestamp },
          });
        }
      }
    },
    [scope]
  );

  // End time window selection
  const endTimeWindow = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Clear time window
  const clearTimeWindow = useCallback(() => {
    setState(scope, {
      timeWindow: { start: null, end: null },
    });
  }, [scope]);

  // Reset all timeline state
  const resetTimeline = useCallback(() => {
    setState(scope, {
      currentTime: null,
      timeWindow: { start: null, end: null },
      isLocked: false,
    });
  }, [scope]);

  // Soft reset - only clear time window, preserve lock and current time
  const softReset = useCallback(() => {
    setState(scope, {
      timeWindow: { start: null, end: null },
    });
  }, [scope]);

  // Sync timeline from another scope
  const syncFromScope = useCallback((sourceScope: TimelineScope) => {
    const sourceState = getState(sourceScope);
    setState(scope, {
      currentTime: sourceState.currentTime,
      timeWindow: sourceState.timeWindow,
      isLocked: sourceState.isLocked,
    });
  }, [scope]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
    // State
    currentTime: state.currentTime,
    timeWindow: state.timeWindow,
    isLocked: state.isLocked,

    // Actions
    setCurrentTime,
    toggleLock,
    startTimeWindow,
    updateTimeWindow,
    endTimeWindow,
    clearTimeWindow,
    resetTimeline,
    softReset,
    syncFromScope,
  };
}
