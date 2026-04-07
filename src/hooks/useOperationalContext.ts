import { useState, useEffect, useCallback } from 'react';

export type ContextMode = 'AI_INSIGHTS' | 'SITE' | 'AP' | 'CLIENT';

export type EnvironmentProfileId = 'AI_BASELINE' | 'RETAIL' | 'WAREHOUSE' | 'DISTRIBUTION' | 'HQ' | 'CAMPUS' | 'CUSTOM';

export interface EnvironmentProfile {
  id: EnvironmentProfileId;
  rfqiTarget: number;
  channelUtilizationPct: number;
  noiseFloorDbm: number;
  clientDensity: number;
  latencyP95Ms: number;
  retryRatePct: number;
}

export interface OperationalContext {
  mode: ContextMode;
  siteId: string | null;
  apId: string | null;
  clientId: string | null;
  timeRange: string;
  dateFrom: string | null;
  dateTo: string | null;
  timeCursor: number | null;
  cursorLocked: boolean;
  environmentProfile: EnvironmentProfile;
}

export const DEFAULT_PROFILES: Record<EnvironmentProfileId, EnvironmentProfile> = {
  AI_BASELINE: {
    id: 'AI_BASELINE',
    rfqiTarget: 75,
    channelUtilizationPct: 65,
    noiseFloorDbm: -85,
    clientDensity: 50,
    latencyP95Ms: 75,
    retryRatePct: 15,
  },
  RETAIL: {
    id: 'RETAIL',
    rfqiTarget: 80,
    channelUtilizationPct: 60,
    noiseFloorDbm: -85,
    clientDensity: 50,
    latencyP95Ms: 100,
    retryRatePct: 15,
  },
  WAREHOUSE: {
    id: 'WAREHOUSE',
    rfqiTarget: 70,
    channelUtilizationPct: 70,
    noiseFloorDbm: -80,
    clientDensity: 30,
    latencyP95Ms: 150,
    retryRatePct: 20,
  },
  DISTRIBUTION: {
    id: 'DISTRIBUTION',
    rfqiTarget: 65,
    channelUtilizationPct: 75,
    noiseFloorDbm: -80,
    clientDensity: 25,
    latencyP95Ms: 200,
    retryRatePct: 25,
  },
  HQ: {
    id: 'HQ',
    rfqiTarget: 85,
    channelUtilizationPct: 50,
    noiseFloorDbm: -90,
    clientDensity: 100,
    latencyP95Ms: 50,
    retryRatePct: 10,
  },
  CAMPUS: {
    id: 'CAMPUS',
    rfqiTarget: 75,
    channelUtilizationPct: 65,
    noiseFloorDbm: -85,
    clientDensity: 75,
    latencyP95Ms: 75,
    retryRatePct: 15,
  },
  CUSTOM: {
    id: 'CUSTOM',
    rfqiTarget: 80,
    channelUtilizationPct: 60,
    noiseFloorDbm: -85,
    clientDensity: 50,
    latencyP95Ms: 100,
    retryRatePct: 15,
  },
};

const STORAGE_KEY = 'aura_operational_context_v1';

const DEFAULT_CONTEXT: OperationalContext = {
  mode: 'AI_INSIGHTS',
  siteId: null,
  apId: null,
  clientId: null,
  timeRange: '24h',
  dateFrom: null,
  dateTo: null,
  timeCursor: null,
  cursorLocked: false,
  environmentProfile: DEFAULT_PROFILES.CAMPUS,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function loadState(): OperationalContext {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONTEXT, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_CONTEXT };
}

let state: OperationalContext = loadState();

function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function updateState(updates: Partial<OperationalContext>): void {
  state = { ...state, ...updates };
  saveState();
  notifyListeners();
}

export function getOperationalContext(): OperationalContext {
  return { ...state };
}

export function setOperationalContext(updates: Partial<OperationalContext>): void {
  updateState(updates);
}

export function useOperationalContext() {
  const [ctx, setCtx] = useState<OperationalContext>(() => getOperationalContext());

  useEffect(() => {
    const listener = () => setCtx(getOperationalContext());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setMode = useCallback((mode: ContextMode) => {
    const updates: Partial<OperationalContext> = { mode };
    if (mode === 'AI_INSIGHTS') {
      updates.siteId = null;
      updates.apId = null;
      updates.clientId = null;
    } else if (mode === 'SITE') {
      updates.apId = null;
      updates.clientId = null;
    } else if (mode === 'AP') {
      updates.clientId = null;
    }
    updateState(updates);
  }, []);

  const selectSite = useCallback((siteId: string | null) => {
    updateState({
      mode: 'SITE',
      siteId,
      apId: null,
      clientId: null,
    });
  }, []);

  const selectAP = useCallback((apId: string | null, siteId?: string | null) => {
    const updates: Partial<OperationalContext> = {
      mode: 'AP',
      apId,
      clientId: null,
    };
    if (siteId !== undefined) {
      updates.siteId = siteId;
    }
    updateState(updates);
  }, []);

  const selectClient = useCallback(
    (clientId: string | null, apId?: string | null, siteId?: string | null) => {
      const updates: Partial<OperationalContext> = {
        mode: 'CLIENT',
        clientId,
      };
      if (apId !== undefined) {
        updates.apId = apId;
      }
      if (siteId !== undefined) {
        updates.siteId = siteId;
      }
      updateState(updates);
    },
    []
  );

  const setTimeRange = useCallback((timeRange: string) => {
    const updates: Partial<OperationalContext> = { timeRange };
    const current = getOperationalContext();
    if (current.timeCursor !== null) {
      const now = Date.now();
      const rangeMs = parseTimeRange(timeRange);
      if (rangeMs !== null) {
        const rangeStart = now - rangeMs;
        if (current.timeCursor < rangeStart || current.timeCursor > now) {
          updates.timeCursor = null;
        }
      }
    }
    updateState(updates);
  }, []);

  const setTimeCursor = useCallback((ts: number | null) => {
    const current = getOperationalContext();
    if (!current.cursorLocked) {
      updateState({ timeCursor: ts });
    }
  }, []);

  const setTimeCursorFromHover = useCallback((ts: number | null) => {
    const current = getOperationalContext();
    if (!current.cursorLocked) {
      updateState({ timeCursor: ts });
    }
  }, []);

  const toggleCursorLock = useCallback(() => {
    const current = getOperationalContext();
    updateState({ cursorLocked: !current.cursorLocked });
  }, []);

  const setEnvironmentProfile = useCallback((profile: EnvironmentProfile) => {
    updateState({ environmentProfile: profile });
  }, []);

  const resetContext = useCallback(() => {
    updateState({ ...DEFAULT_CONTEXT });
  }, []);

  const updateContext = useCallback((updates: Partial<OperationalContext>) => {
    updateState(updates);
  }, []);

  return {
    ctx,
    setMode,
    selectSite,
    selectAP,
    selectClient,
    setTimeRange,
    setTimeCursor,
    setTimeCursorFromHover,
    toggleCursorLock,
    setEnvironmentProfile,
    resetContext,
    updateContext,
  };
}

function parseTimeRange(range: string): number | null {
  const match = range.match(/^(\d+)([hd])$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  return null;
}
