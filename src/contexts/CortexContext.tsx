/**
 * CortexContext — Central React context for AURA's read-only investigation
 * pipeline (page-aware Q&A: tool-use loop + the deterministic wireless
 * diagnostic pipeline).
 *
 * Mutating WLAN configuration is a separate, real pipeline —
 * `useWirelessAssistant` (src/hooks/useWirelessAssistant.ts) driving
 * server/cortex/{wirelessIntentParser,wlanProvisioningEngine}.js — not this
 * context. The two used to be conflated here via a client-only "execution
 * plan" path (src/services/agentService.ts) that never worked: every write
 * it attempted sent requests to a literal `/unknown` URL. That path is
 * removed rather than fixed in place; see the migration matrix in
 * docs/AURA_NETWORK_INTELLIGENCE_MIGRATION_MATRIX.md.
 *
 * Manages:
 * - Full page-aware context merging (App.tsx base context + internal state)
 * - Conversation state (messages, isThinking)
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
import {
  createCortexSession,
  sendCortexMessage,
  queryCortexWireless,
  investigateWithCortex,
} from '../services/cortexApiClient';
import type { CortexEvidence } from '../services/cortexApiClient';
import type { AgentMessage } from '../components/AgentCoworker/agentTypes';
import type { CortexAvailableAction, CortexInsight, CortexPageContext } from '../types/cortex';
import { CORTEX_SUGGESTED_PROMPTS } from '../types/cortex';

/**
 * Model ids retired from the registry. A value persisted in a browser outlives
 * the code that created it, so `redq-shell` kept being sent long after it was
 * removed — and it is what produced "Model 'redq-shell' is not in the allowlist
 * for any configured provider" on every message. Discard and clear it so the
 * server simply uses its configured default.
 */
const RETIRED_MODEL_IDS = new Set([
  'redq-shell',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'mock',
]);

/**
 * The model is chosen server-side (CORTEX_LLM_PROVIDER / CORTEX_LLM_MODEL);
 * there is no longer a picker. This only forwards a value a previous build may
 * have stored, and drops it if that model no longer exists.
 */
function getSelectedCortexModel(): string | undefined {
  try {
    const stored = localStorage.getItem('cortex_model');
    if (!stored) return undefined;
    if (RETIRED_MODEL_IDS.has(stored)) {
      localStorage.removeItem('cortex_model');
      return undefined;
    }
    return stored;
  } catch {
    return undefined;
  }
}

// ============================================
// Provider Props
// ============================================

export interface CortexContextProviderProps {
  /** Built by App.tsx — route/siteId/siteName/timeRange/filters/userRole */
  pageContext: Partial<CortexPageContext>;
  children: React.ReactNode;
}

// ============================================
// Context Value Shape
// ============================================

export interface CortexContextValue {
  // Full merged context
  cortexContext: CortexPageContext;

  // Context updaters (for page components to call)
  updateCortexContext: (partial: Partial<CortexPageContext>) => void;
  setSelectedObject: (obj: unknown) => void;
  setSelectedRows: (rows: unknown[]) => void;
  setVisibleRows: (summary: CortexPageContext['visibleRowsSummary']) => void;
  setPageMetadata: (meta: Record<string, unknown>) => void;
  setAvailableActions: (actions: CortexAvailableAction[]) => void;
  setWirelessContext: (ctx: {
    clientMac?: string;
    apSerial?: string;
    apName?: string;
    ssid?: string;
  }) => void;
  resetCortexContext: () => void;

  // UI/workspace state
  isOpen: boolean;
  openCortex: () => void;
  closeCortex: () => void;

  // Session/conversation state
  sessionId: string | null;
  messages: AgentMessage[];
  suggestedPrompts: string[];
  /** Live agent step label while an investigation runs, else null. */
  cortexActivity: string | null;
  pageInsights: CortexInsight[];
  isThinking: boolean;
  wirelessStage: 'detecting' | 'planning' | 'fetching' | 'classifying' | 'generating' | null;

  // Actions
  sendMessage: (message: string) => Promise<void>;
  confirmWirelessAction: (question: string, confirmationToken: string) => Promise<void>;
  refreshPageAnalysis: () => Promise<void>;
  clearConversation: () => void;
  addFeedback: (msgId: string, feedback: 'up' | 'down') => void;
  toggleReasoning: (msgId: string) => void;
}

// ============================================
// Context Creation
// ============================================

const CortexContext = createContext<CortexContextValue | null>(null);

// ============================================
// Provider
// ============================================

export function CortexContextProvider({ pageContext, children }: CortexContextProviderProps) {
  const { organization } = useAppContext();

  // ---- Internal page-level state ----
  const [selectedObject, setSelectedObjectState] = useState<unknown>(undefined);
  const [selectedRows, setSelectedRowsState] = useState<unknown[]>([]);
  const [visibleRowsSummary, setVisibleRowsSummaryState] = useState<
    CortexPageContext['visibleRowsSummary'] | undefined
  >(undefined);
  const [pageMetadata, setPageMetadataState] = useState<Record<string, unknown>>({});
  const [availableActions, setAvailableActionsState] = useState<CortexAvailableAction[]>([]);

  // ---- Wireless entity context ----
  const [wirelessClientMac, setWirelessClientMac] = useState<string | undefined>(undefined);
  const [wirelessApSerial, setWirelessApSerial] = useState<string | undefined>(undefined);
  const [wirelessApName, setWirelessApName] = useState<string | undefined>(undefined);
  const [wirelessSsid, setWirelessSsid] = useState<string | undefined>(undefined);

  // ---- Workspace open/close ----
  const [isOpen, setIsOpen] = useState(false);

  // ---- Cortex investigation ----
  // The live activity label ("Looking up client…") so the panel can show what
  // the agent is doing instead of a spinner.
  const [cortexActivity, setCortexActivity] = useState<string | null>(null);
  // A ref mirror of `messages`, because the investigation callback is stable
  // (empty dep array) and must read the CURRENT transcript, not a closure over
  // whatever it was when the callback was created.
  const messagesRef = useRef<AgentMessage[]>([]);

  // ---- Session / conversation ----
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [isThinking, setIsThinking] = useState(false);
  const [wirelessStage, setWirelessStage] = useState<
    'detecting' | 'planning' | 'fetching' | 'classifying' | 'generating' | null
  >(null);

  // ---- Page analysis ----
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [pageInsights, setPageInsights] = useState<CortexInsight[]>([]);

  // ============================================
  // Merged full context
  // ============================================

  const cortexContext = useMemo<CortexPageContext>(
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
  const cortexContextRef = useRef<CortexPageContext>(cortexContext);
  useEffect(() => {
    cortexContextRef.current = cortexContext;
  }, [cortexContext]);

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
    setSuggestedPrompts(CORTEX_SUGGESTED_PROMPTS[pageType] ?? []);
    setPageInsights([]); // Phase 3 will call backend enrichment here
  }, []);

  // Run once on mount and whenever route changes
  useEffect(() => {
    void refreshPageAnalysis();
  }, [pageContext.route, refreshPageAnalysis]);

  // ============================================
  // sendMessage — read-only investigation
  // ============================================

  const runWirelessQuery = useCallback(
    async (message: string, confirmationToken?: string): Promise<boolean> => {
      setWirelessStage('detecting');
      const stageTimer = setTimeout(() => setWirelessStage('fetching'), 600);

      let wirelessAnswer;
      try {
        wirelessAnswer = await queryCortexWireless(
          message,
          cortexContextRef.current,
          confirmationToken,
          getSelectedCortexModel()
        );
      } catch (err) {
        clearTimeout(stageTimer);
        setWirelessStage(null);
        console.warn('[Cortex] wireless query failed, falling back to generic path:', err);
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

  /**
   * Stream an investigation from /api/cortex/investigate.
   *
   * Returns true when Cortex produced an answer (so sendMessage stops), false
   * when the endpoint is unavailable and the legacy paths should be tried.
   *
   * The distinction matters: "Cortex is disabled" or "no Gateway selected" are
   * setup problems the operator must see, and are reported rather than silently
   * falling back to a weaker pipeline that would answer without evidence.
   */
  const runCortexInvestigation = useCallback(
    async (message: string, ctx: CortexPageContext | undefined): Promise<boolean> => {
      const scope = {
        siteName: ctx?.siteName,
        ssid: ctx?.ssid,
        apSerial: ctx?.apSerial,
        mac: ctx?.clientMac,
      };

      // Only the last few turns: the agent re-derives evidence from tools each
      // time, so a long transcript adds tokens without adding facts.
      const history = messagesRef.current
        .slice(-6)
        .map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.content }));

      let answer: string | null = null;
      let evidence: CortexEvidence | null = null;
      let hardError: string | null = null;
      const activity: string[] = [];

      try {
        await investigateWithCortex(message, {
          scope,
          history,
          model: getSelectedCortexModel(),
          onActivity: (label) => {
            activity.push(label);
            setWirelessStage('fetching');
            setCortexActivity(label);
          },
          onAnswer: (text) => {
            answer = text;
          },
          onEvidence: (e) => {
            evidence = e;
          },
          onError: (msg) => {
            hardError = msg;
          },
        });
      } catch (err) {
        console.warn('[Cortex] investigation transport failed:', err);
        return false;
      } finally {
        setCortexActivity(null);
        setWirelessStage(null);
      }

      if (answer) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            role: 'agent',
            content: answer as string,
            timestamp: new Date(),
            cortexEvidence: evidence ?? undefined,
            cortexActivity: activity,
          } as AgentMessage,
        ]);
        return true;
      }

      if (hardError) {
        // Surfaced, not swallowed. An AI-service failure must never be
        // presented as a statement about the network.
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            role: 'agent',
            content: hardError as string,
            timestamp: new Date(),
            cortexEvidence: evidence ?? undefined,
          } as AgentMessage,
        ]);
        return true;
      }

      return false;
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
        // ── PRIMARY PATH: the evidence-backed investigation agent.
        //
        // It reads the Gateway as the calling user, records every retrieval in
        // an append-only ledger, and audits its own answer against that ledger.
        // The two older paths below are kept as fallbacks so a Cortex outage
        // degrades rather than breaks the panel — but they are never preferred,
        // because neither can distinguish an observation from an inference.
        const ctx = cortexContextRef.current;
        const investigated = await runCortexInvestigation(message, ctx);
        if (investigated) return;

        // The wireless pipeline is a scoped diagnostic path — only run it
        // when the user has a concrete client MAC or AP serial in scope
        // (i.e. we're on a client-detail or ap-detail page). For broad
        // questions, fall through to the tool-use loop which can hit any
        // controller endpoint via the read-only tool catalog.
        const hasScopedTarget = Boolean(ctx?.clientMac || ctx?.apSerial);
        if (hasScopedTarget) {
          const handled = await runWirelessQuery(message);
          if (handled) return;
        }

        let sid = sessionIdRef.current;
        if (!sid) {
          const { sessionId: newId } = await createCortexSession(cortexContextRef.current);
          sid = newId;
          setSessionId(newId);
          sessionIdRef.current = newId;
        }

        let reply;
        try {
          reply = await sendCortexMessage(
            sid,
            message,
            cortexContextRef.current,
            getSelectedCortexModel()
          );
        } catch (err) {
          // Session may have expired on the server (e.g. after a deploy).
          // Auto-recreate once and retry before giving up.
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('404') || msg.includes('Session not found')) {
            const { sessionId: freshId } = await createCortexSession(cortexContextRef.current);
            setSessionId(freshId);
            sessionIdRef.current = freshId;
            reply = await sendCortexMessage(
              freshId,
              message,
              cortexContextRef.current,
              getSelectedCortexModel()
            );
          } else {
            throw err;
          }
        }
        setMessages((prev) => [...prev, reply]);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[Cortex] sendMessage failed:', detail);
        const errorMsg: AgentMessage = {
          id: `agent-${Date.now()}`,
          role: 'agent',
          content: `Unable to get a response: ${detail}`,
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
    setMessages([]);
    setSessionId(null);
    sessionIdRef.current = null;
  }, []);

  const addFeedback = useCallback((msgId: string, feedback: 'up' | 'down') => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback } : m)));
  }, []);

  const toggleReasoning = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, showReasoning: !m.showReasoning } : m))
    );
  }, []);

  // ============================================
  // Workspace controls
  // ============================================

  const openCortex = useCallback(() => setIsOpen(true), []);
  const closeCortex = useCallback(() => setIsOpen(false), []);

  // ============================================
  // Context updaters
  // ============================================

  const setSelectedObject = useCallback((obj: unknown) => setSelectedObjectState(obj), []);
  const setSelectedRows = useCallback((rows: unknown[]) => setSelectedRowsState(rows), []);
  const setVisibleRows = useCallback(
    (summary: CortexPageContext['visibleRowsSummary']) => setVisibleRowsSummaryState(summary),
    []
  );
  const setPageMetadata = useCallback(
    (meta: Record<string, unknown>) => setPageMetadataState(meta),
    []
  );
  const setAvailableActions = useCallback(
    (actions: CortexAvailableAction[]) => setAvailableActionsState(actions),
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

  const resetCortexContext = useCallback(() => {
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

  const updateCortexContext = useCallback((_partial: Partial<CortexPageContext>) => {
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

  const value = useMemo<CortexContextValue>(
    () => ({
      cortexContext,
      updateCortexContext,
      setSelectedObject,
      setSelectedRows,
      setVisibleRows,
      setPageMetadata,
      setAvailableActions,
      setWirelessContext,
      resetCortexContext,
      isOpen,
      openCortex,
      closeCortex,
      sessionId,
      messages,
      suggestedPrompts,
      cortexActivity,
      pageInsights,
      isThinking,
      wirelessStage,
      sendMessage,
      confirmWirelessAction,
      refreshPageAnalysis,
      clearConversation,
      addFeedback,
      toggleReasoning,
    }),
    [
      cortexContext,
      updateCortexContext,
      setSelectedObject,
      setSelectedRows,
      setVisibleRows,
      setPageMetadata,
      setAvailableActions,
      setWirelessContext,
      resetCortexContext,
      isOpen,
      openCortex,
      closeCortex,
      sessionId,
      messages,
      suggestedPrompts,
    cortexActivity,
      cortexActivity,
      pageInsights,
      isThinking,
      wirelessStage,
      sendMessage,
      confirmWirelessAction,
      refreshPageAnalysis,
      clearConversation,
      addFeedback,
      toggleReasoning,
    ]
  );

  return <CortexContext.Provider value={value}>{children}</CortexContext.Provider>;
}

// ============================================
// Hooks
// ============================================

/**
 * Full access to CortexContext — for copilot components that need everything.
 * Must be used within CortexContextProvider.
 */
export function useCortexContext(): CortexContextValue {
  const ctx = useContext(CortexContext);
  if (!ctx) {
    throw new Error('useCortexContext must be used within CortexContextProvider');
  }
  return ctx;
}

/**
 * Lightweight hook — exposes only the fields needed by the Cortex workspace UI
 * (bar + conversation). Avoids re-rendering on unrelated state changes.
 */
export function useCortex(): Pick<
  CortexContextValue,
  | 'isOpen'
  | 'openCortex'
  | 'closeCortex'
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
    openCortex,
    closeCortex,
    sessionId,
    messages,
    suggestedPrompts,
    cortexActivity,
    pageInsights,
    isThinking,
    sendMessage,
    refreshPageAnalysis,
    clearConversation,
  } = useCortexContext();

  return {
    isOpen,
    openCortex,
    closeCortex,
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
