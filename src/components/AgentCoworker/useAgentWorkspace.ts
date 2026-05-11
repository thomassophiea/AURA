import { useState, useCallback, useEffect } from 'react';
import type { WorkspaceMode, WorkspaceSize, ActivePanel } from './agentTypes';

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
  activePanel: ActivePanel;
  inputValue: string;
  isListening: boolean;
  pendingPlanId: string | null;
}

export interface AgentWorkspaceActions {
  open: () => void;
  minimize: () => void;
  pin: () => void;
  dismiss: () => void;
  setSize: (s: WorkspaceSize) => void;
  setActivePanel: (p: ActivePanel) => void;
  setInput: (v: string) => void;
  startListening: () => void;
  stopListening: () => void;
  setPendingPlan: (id: string | null) => void;
  toggle: () => void;
}

export function useAgentWorkspace(): AgentWorkspaceState & AgentWorkspaceActions {
  const prefs = loadPrefs();
  const [mode, setMode] = useState<WorkspaceMode>(prefs.mode === 'pinned' ? 'pinned' : 'idle');
  const [size, setSize] = useState<WorkspaceSize>(prefs.size);
  const [activePanel, setActivePanel] = useState<ActivePanel>('conversation');
  const [inputValue, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [pendingPlanId, setPendingPlan] = useState<string | null>(null);

  useEffect(() => {
    savePrefs({ size, mode });
  }, [size, mode]);

  const open = useCallback(() => setMode('open'), []);
  const minimize = useCallback(() => setMode('minimized'), []);
  const pin = useCallback(() => setMode('pinned'), []);
  const dismiss = useCallback(() => setMode('idle'), []);
  const startListening = useCallback(() => setIsListening(true), []);
  const stopListening = useCallback(() => setIsListening(false), []);

  const toggle = useCallback(() => {
    setMode((m) => (m === 'idle' || m === 'minimized' ? 'open' : 'idle'));
  }, []);

  return {
    mode,
    size,
    activePanel,
    inputValue,
    isListening,
    pendingPlanId,
    open,
    minimize,
    pin,
    dismiss,
    toggle,
    setSize,
    setActivePanel,
    setInput,
    startListening,
    stopListening,
    setPendingPlan,
  };
}
