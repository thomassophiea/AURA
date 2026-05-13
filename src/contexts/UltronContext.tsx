/**
 * UltronContext — Central React context for the Ultr0n AI copilot
 *
 * Manages:
 * - Full page-aware context merging (App.tsx base context + internal state)
 * - Conversation state (messages, isThinking, pendingPlan)
 * - Workspace open/close state (isOpen)
 * - Page analysis state (suggestedPrompts, pageInsights)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAppContext } from './AppContext';
import { agentService } from '../services/agentService';
import {
  createUltr0nSession,
  sendUltr0nMessage,
  queryUltr0nWireless,
} from '../services/ultr0nApiClient';
import type {
  AgentMessage,
  AuditEntry,
  APITimelineEntry,
  ExecutionPlan,
} from '../components/AgentCoworker/agentTypes';
import type { UltronAvailableAction, UltronInsight, UltronPageContext } from '../types/ultron';
import { ULTR0N_SUGGESTED_PROMPTS } from '../types/ultron';

// ============================================
// Provider Props
// ============================================

export interface UltronContextProviderProps {
  /** Built by App.tsx — route/siteId/siteName/timeRange/filters/userRole */
  pageContext: Partial<UltronPageContext>;
  children: React.ReactNode;
}

// ============================================
// Context Value Shape
// ============================================

export interface UltronContextValue {
  // Full merged context
  ultronContext: UltronPageContext;

  // Context updaters (for page components to call)
  updateUltronContext: (partial: Partial<UltronPageContext>) => void;
  setSelectedObject: (obj: unknown) => void;
  setSelectedRows: (rows: unknown[]) => void;
  setVisibleRows: (summary: UltronPageContext['visibleRowsSummary']) => void;
  setPageMetadata: (meta: Record<string, unknown>) => void;
  setAvailableActions: (actions: UltronAvailableAction[]) => void;
  setWirelessContext: (ctx: {
    clientMac?: string;
    apSerial?: string;
    apName?: string;
    ssid?: string;
  }) => void;
  resetUltronContext: () => void;

  // UI/workspace state
  isOpen: boolean;
  openUltr0n: () => void;
  closeUltr0n: () => void;
  toggleUltr0n: () => void;

  // Session/conversation state
  sessionId: string | null;
  messages: AgentMessage[];
  pendingPlan: ExecutionPlan | null;
  suggestedPrompts: string[];
  pageInsights: UltronInsight[];
  isThinking: boolean;
  wirelessStage: 'detecting' | 'planning' | 'fetching' | 'classifying' | 'generating' | null;
  auditEntries: AuditEntry[];
  apiTimeline: APITimelineEntry[];

  // Actions
  sendMessage: (message: string) => Promise<void>;
  confirmWirelessAction: (question: string, confirmationToken: string) => Promise<void>;
  refreshPageAnalysis: () => Promise<void>;
  clearConversation: () => void;
  approvePlan: (planId: string) => Promise<void>;
  rejectPlan: (planId: string) => void;
  rollbackPlan: (planId: string) => Promise<void>;
  refreshAuditAndTimeline: () => void;
}

// ============================================
// Context Creation
// ============================================

const UltronContext = createContext<UltronContextValue | null>(null);

// ============================================
// Provider
// ============================================

export function UltronContextProvider({ pageContext, children }: UltronContextProviderProps) {
  const { organization } = useAppContext();

  // ---- Internal page-level state ----
  const [selectedObject, setSelectedObjectState] = useState<unknown>(undefined);
  const [selectedRows, setSelectedRowsState] = useState<unknown[]>([]);
  const [visibleRowsSummary, setVisibleRowsSummaryState] = useState<
    UltronPageContext['visibleRowsSummary'] | undefined
  >(undefined);
  const [pageMetadata, setPageMetadataState] = useState<Record<string, unknown>>({});
  const [availableActions, setAvailableActionsState] = useState<UltronAvailableAction[]>([]);

  // ---- Wireless entity context ----
  const [wirelessClientMac, setWirelessClientMac] = useState<string | undefined>(undefined);
  const [wirelessApSerial, setWirelessApSerial] = useState<string | undefined>(undefined);
  const [wirelessApName, setWirelessApName] = useState<string | undefined>(undefined);
  const [wirelessSsid, setWirelessSsid] = useState<string | undefined>(undefined);

  // ---- Workspace open/close ----
  const [isOpen, setIsOpen] = useState(false);

  // ---- Session / conversation ----
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pendingPlan, setPendingPlan] = useState<ExecutionPlan | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [wirelessStage, setWirelessStage] = useState<
    'detecting' | 'planning' | 'fetching' | 'classifying' | 'generating' | null
  >(null);

  // ---- Page analysis ----
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [pageInsights, setPageInsights] = useState<UltronInsight[]>([]);

  // ---- Audit / timeline (derived from agentService) ----
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [apiTimeline, setApiTimeline] = useState<APITimelineEntry[]>([]);

  // ============================================
  // Merged full context
  // ============================================

  const ultronContext = useMemo<UltronPageContext>(
    () => ({
      route: pageContext.route ?? '',
      pageName: pageContext.pageName ?? '',
      pageType: pageContext.pageType ?? 'unknown',
      orgId: organization?.id,
      orgName: organization?.name,
      siteId: pageContext.siteId,
      siteName: pageContext.siteName,
      userRole: pageContext.userRole,
      permissions: pageContext.permissions,
      timeRange: pageContext.timeRange,
      filters: pageContext.filters,
      sorting: pageContext.sorting,
      selectedObject,
      selectedRows,
      visibleRowsSummary,
      pageMetadata,
      availableActions,
      clientMac: wirelessClientMac,
      apSerial: wirelessApSerial,
      apName: wirelessApName,
      ssid: wirelessSsid,
    }),
    [
      pageContext.route,
      pageContext.pageName,
      pageContext.pageType,
      pageContext.siteId,
      pageContext.siteName,
      pageContext.userRole,
      pageContext.permissions,
      pageContext.timeRange,
      pageContext.filters,
      pageContext.sorting,
      organization,
      selectedObject,
      selectedRows,
      visibleRowsSummary,
      pageMetadata,
      availableActions,
      wirelessClientMac,
      wirelessApSerial,
      wirelessApName,
      wirelessSsid,
    ]
  );

  // Stable refs to avoid stale closures in async callbacks
  const ultronContextRef = useRef<UltronPageContext>(ultronContext);
  useEffect(() => {
    ultronContextRef.current = ultronContext;
  }, [ultronContext]);

  const pageContextRef = useRef(pageContext);
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  // ============================================
  // Auto-reset on route change
  // ============================================

  const prevRouteRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const newRoute = pageContext.route;
    if (newRoute === prevRouteRef.current) return;
    prevRouteRef.current = newRoute;

    // Reset all page-scoped state
    setSelectedObjectState(undefined);
    setSelectedRowsState([]);
    setVisibleRowsSummaryState(undefined);
    setPageMetadataState({});
    setAvailableActionsState([]);
    setPageInsights([]);

    // Clear prompts now; refreshPageAnalysis (triggered below) will populate them.
    setSuggestedPrompts([]);
  }, [pageContext.route]);

  // ============================================
  // refreshPageAnalysis (Phase 1)
  // ============================================

  const refreshPageAnalysis = useCallback(async () => {
    const pageType = pageContextRef.current.pageType ?? 'unknown';
    setSuggestedPrompts(ULTR0N_SUGGESTED_PROMPTS[pageType] ?? []);
    setPageInsights([]); // Phase 3 will call backend enrichment here
  }, []);

  // Run once on mount and whenever route changes
  useEffect(() => {
    void refreshPageAnalysis();
  }, [pageContext.route, refreshPageAnalysis]);

  // ============================================
  // sendMessage (Phase 1)
  // ============================================

  const runWirelessQuery = useCallback(
    async (message: string, confirmationToken?: string): Promise<boolean> => {
      setWirelessStage('detecting');
      const stageTimer = setTimeout(() => setWirelessStage('fetching'), 600);

      let wirelessAnswer;
      try {
        wirelessAnswer = await queryUltr0nWireless(
          message,
          ultronContextRef.current,
          confirmationToken
        );
      } catch (err) {
        clearTimeout(stageTimer);
        setWirelessStage(null);
        console.warn('[Ultr0n] wireless query failed, falling back to generic path:', err);
        return false;
      }

      clearTimeout(stageTimer);
      setWirelessStage(null);

      if (wirelessAnswer === null) return false;

      const agentMsg: AgentMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: wirelessAnswer.narrative || '',
        timestamp: new Date(),
        wirelessAnswer,
      };
      setMessages((prev) => [...prev, agentMsg]);
      return true;
    },
    []
  );

  const sendMessage = useCallback(
    async (message: string) => {
      const userMsg: AgentMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);

      try {
        // Try wireless pipeline first
        const handled = await runWirelessQuery(message);
        if (handled) return;

        const intent = await agentService.parseIntent(message);

        if (intent) {
          const plan = await agentService.buildExecutionPlan(intent);
          const agentMsg: AgentMessage = {
            id: `agent-${Date.now()}`,
            role: 'agent',
            content: `I've built an execution plan for: **${plan.title}**\n\nThis will affect ${plan.impactedObjects.map((o) => o.name).join(', ')}. Review the plan and approve to proceed.`,
            timestamp: new Date(),
            executionPlan: plan,
            reasoning: `Detected write intent: "${intent.action}" targeting ${intent.targetType}. Built ${plan.steps.length}-step plan.`,
          };
          setMessages((prev) => [...prev, agentMsg]);
          setPendingPlan(plan);
          return;
        }

        let sid = sessionIdRef.current;
        if (!sid) {
          const { sessionId: newId } = await createUltr0nSession(ultronContextRef.current);
          sid = newId;
          setSessionId(newId);
          sessionIdRef.current = newId;
        }

        const reply = await sendUltr0nMessage(sid, message, ultronContextRef.current);
        setMessages((prev) => [...prev, reply]);
      } catch {
        const errorMsg: AgentMessage = {
          id: `agent-${Date.now()}`,
          role: 'agent',
          content: 'Unable to get a response. Please check your connection and try again.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsThinking(false);
      }
    },
    [runWirelessQuery]
  );

  const confirmWirelessAction = useCallback(
    async (question: string, confirmationToken: string) => {
      setIsThinking(true);
      try {
        await runWirelessQuery(question, confirmationToken);
      } catch {
        const errorMsg: AgentMessage = {
          id: `agent-${Date.now()}`,
          role: 'agent',
          content: 'Unable to execute the action. Please check your connection and try again.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsThinking(false);
      }
    },
    [runWirelessQuery]
  );

  // ============================================
  // clearConversation
  // ============================================

  const clearConversation = useCallback(() => {
    agentService.clearHistory();
    setMessages([]);
    setPendingPlan(null);
    setSessionId(null);
    sessionIdRef.current = null;
  }, []);

  // ============================================
  // Plan actions
  // ============================================

  const approvePlan = useCallback(async (planId: string) => {
    try {
      const result = await agentService.executeApprovedPlan(planId);
      setAuditEntries(agentService.getAuditHistory());
      setApiTimeline(agentService.getAPITimeline());
      if (result.success) {
        setPendingPlan(null);
      } else {
        setPendingPlan((prev) =>
          prev?.id === planId ? { ...prev, status: 'failed' as const } : prev
        );
      }
    } catch {
      setPendingPlan((prev) =>
        prev?.id === planId ? { ...prev, status: 'failed' as const } : prev
      );
    }
  }, []);

  const rejectPlan = useCallback((planId: string) => {
    agentService.rejectPlan(planId);
    setPendingPlan(null);
    setAuditEntries(agentService.getAuditHistory());
  }, []);

  const rollbackPlan = useCallback(async (planId: string) => {
    await agentService.rollbackOperation(planId);
    setPendingPlan(null);
    setAuditEntries(agentService.getAuditHistory());
  }, []);

  // ============================================
  // Audit / timeline refresh
  // ============================================

  const refreshAuditAndTimeline = useCallback(() => {
    setAuditEntries(agentService.getAuditHistory());
    setApiTimeline(agentService.getAPITimeline());
  }, []);

  // ============================================
  // Workspace controls
  // ============================================

  const openUltr0n = useCallback(() => setIsOpen(true), []);
  const closeUltr0n = useCallback(() => setIsOpen(false), []);
  const toggleUltr0n = useCallback(() => setIsOpen((prev) => !prev), []);

  // ============================================
  // Context updaters
  // ============================================

  const setSelectedObject = useCallback((obj: unknown) => setSelectedObjectState(obj), []);
  const setSelectedRows = useCallback((rows: unknown[]) => setSelectedRowsState(rows), []);
  const setVisibleRows = useCallback(
    (summary: UltronPageContext['visibleRowsSummary']) => setVisibleRowsSummaryState(summary),
    []
  );
  const setPageMetadata = useCallback(
    (meta: Record<string, unknown>) => setPageMetadataState(meta),
    []
  );
  const setAvailableActions = useCallback(
    (actions: UltronAvailableAction[]) => setAvailableActionsState(actions),
    []
  );

  const setWirelessContext = useCallback(
    (ctx: { clientMac?: string; apSerial?: string; apName?: string; ssid?: string }) => {
      if ('clientMac' in ctx) setWirelessClientMac(ctx.clientMac);
      if ('apSerial' in ctx) setWirelessApSerial(ctx.apSerial);
      if ('apName' in ctx) setWirelessApName(ctx.apName);
      if ('ssid' in ctx) setWirelessSsid(ctx.ssid);
    },
    []
  );

  const resetUltronContext = useCallback(() => {
    setSelectedObjectState(undefined);
    setSelectedRowsState([]);
    setVisibleRowsSummaryState(undefined);
    setPageMetadataState({});
    setAvailableActionsState([]);
    setWirelessClientMac(undefined);
    setWirelessApSerial(undefined);
    setWirelessApName(undefined);
    setWirelessSsid(undefined);
  }, []);

  const updateUltronContext = useCallback((_partial: Partial<UltronPageContext>) => {
    if ('selectedObject' in _partial) setSelectedObjectState(_partial.selectedObject);
    if ('selectedRows' in _partial) setSelectedRowsState(_partial.selectedRows ?? []);
    if ('visibleRowsSummary' in _partial) setVisibleRowsSummaryState(_partial.visibleRowsSummary);
    if ('pageMetadata' in _partial) setPageMetadataState(_partial.pageMetadata ?? {});
    if ('availableActions' in _partial) setAvailableActionsState(_partial.availableActions ?? []);
    if ('clientMac' in _partial) setWirelessClientMac(_partial.clientMac);
    if ('apSerial' in _partial) setWirelessApSerial(_partial.apSerial);
    if ('apName' in _partial) setWirelessApName(_partial.apName);
    if ('ssid' in _partial) setWirelessSsid(_partial.ssid);
  }, []);

  // ============================================
  // Stable context value
  // ============================================

  const value = useMemo<UltronContextValue>(
    () => ({
      ultronContext,
      updateUltronContext,
      setSelectedObject,
      setSelectedRows,
      setVisibleRows,
      setPageMetadata,
      setAvailableActions,
      setWirelessContext,
      resetUltronContext,
      isOpen,
      openUltr0n,
      closeUltr0n,
      toggleUltr0n,
      sessionId,
      messages,
      pendingPlan,
      suggestedPrompts,
      pageInsights,
      isThinking,
      wirelessStage,
      auditEntries,
      apiTimeline,
      sendMessage,
      confirmWirelessAction,
      refreshPageAnalysis,
      clearConversation,
      approvePlan,
      rejectPlan,
      rollbackPlan,
      refreshAuditAndTimeline,
    }),
    [
      ultronContext,
      updateUltronContext,
      setSelectedObject,
      setSelectedRows,
      setVisibleRows,
      setPageMetadata,
      setAvailableActions,
      setWirelessContext,
      resetUltronContext,
      isOpen,
      openUltr0n,
      closeUltr0n,
      toggleUltr0n,
      sessionId,
      messages,
      pendingPlan,
      suggestedPrompts,
      pageInsights,
      isThinking,
      wirelessStage,
      auditEntries,
      apiTimeline,
      sendMessage,
      confirmWirelessAction,
      refreshPageAnalysis,
      clearConversation,
      approvePlan,
      rejectPlan,
      rollbackPlan,
      refreshAuditAndTimeline,
    ]
  );

  return <UltronContext.Provider value={value}>{children}</UltronContext.Provider>;
}

// ============================================
// Hooks
// ============================================

/**
 * Full access to UltronContext — for copilot components that need everything.
 * Must be used within UltronContextProvider.
 */
export function useUltronContext(): UltronContextValue {
  const ctx = useContext(UltronContext);
  if (!ctx) {
    throw new Error('useUltronContext must be used within UltronContextProvider');
  }
  return ctx;
}

/**
 * Lightweight hook — exposes only the fields needed by the Ultr0n workspace UI
 * (bar + conversation). Avoids re-rendering on unrelated state changes.
 */
export function useUltr0n(): Pick<
  UltronContextValue,
  | 'isOpen'
  | 'openUltr0n'
  | 'closeUltr0n'
  | 'toggleUltr0n'
  | 'sessionId'
  | 'messages'
  | 'suggestedPrompts'
  | 'pageInsights'
  | 'isThinking'
  | 'sendMessage'
  | 'refreshPageAnalysis'
  | 'clearConversation'
> {
  const {
    isOpen,
    openUltr0n,
    closeUltr0n,
    toggleUltr0n,
    sessionId,
    messages,
    suggestedPrompts,
    pageInsights,
    isThinking,
    sendMessage,
    refreshPageAnalysis,
    clearConversation,
  } = useUltronContext();

  return {
    isOpen,
    openUltr0n,
    closeUltr0n,
    toggleUltr0n,
    sessionId,
    messages,
    suggestedPrompts,
    pageInsights,
    isThinking,
    sendMessage,
    refreshPageAnalysis,
    clearConversation,
  };
}
