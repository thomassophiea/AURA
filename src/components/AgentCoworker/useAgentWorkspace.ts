import { useState, useCallback, useEffect } from 'react';
import type { WorkspaceMode, WorkspaceSize } from './agentTypes';

const STORAGE_KEY = 'agent-workspace-prefs';

interface WorkspacePrefs {
  size: WorkspaceSize;
  mode: WorkspaceMode;
}

function loadPrefs(): WorkspacePrefs {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return { size: 'standard', mode: 'idle' };
}

function savePrefs(prefs: WorkspacePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export interface AgentWorkspaceState {
  mode: WorkspaceMode;
  size: WorkspaceSize;
}

export interface AgentWorkspaceActions {
  open: () => void;
  minimize: () => void;
  pin: () => void;
  dismiss: () => void;
  setSize: (s: WorkspaceSize) => void;
  toggle: () => void;
}

/**
 * Shell-only preferences (open/closed/pinned, panel width). The single
 * unified workflow view has no tabs or sub-panels left to remember — see
 * WirelessAssistantPanel for the AURA workflow's own state (useWirelessAssistant).
 */
export function useAgentWorkspace(): AgentWorkspaceState & AgentWorkspaceActions {
  const prefs = loadPrefs();
  const [mode, setMode] = useState<WorkspaceMode>(prefs.mode === 'pinned' ? 'pinned' : 'idle');
  const [size, setSize] = useState<WorkspaceSize>(prefs.size);

  useEffect(() => {
    savePrefs({ size, mode });
  }, [size, mode]);

  const open = useCallback(() => setMode('open'), []);
  const minimize = useCallback(() => setMode('minimized'), []);
  const pin = useCallback(() => setMode('pinned'), []);
  const dismiss = useCallback(() => setMode('idle'), []);

  const toggle = useCallback(() => {
    setMode((m) => (m === 'idle' || m === 'minimized' ? 'open' : 'idle'));
  }, []);

  return { mode, size, open, minimize, pin, dismiss, toggle, setSize };
}
