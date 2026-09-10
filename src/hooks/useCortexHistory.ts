import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentMessage } from '../components/AgentCoworker/agentTypes';

/**
 * Cortex conversation history, stored in the operator's own browser.
 *
 * WHY localStorage AND NOT POSTGRES
 * ---------------------------------
 * A Cortex transcript is dense with personal and network data: client MAC
 * addresses, hostnames, usernames, IP addresses, role names and topology. AURA
 * already has a deliberate, default-OFF policy about keeping that server-side —
 * `MONITORING_PERSIST_CLIENT_IDENTIFIERS` is false unless explicitly enabled,
 * and enabling it additionally requires MONITORING_CLIENT_PSEUDONYM_SALT so the
 * identifiers are pseudonymised rather than stored raw.
 *
 * Writing raw transcripts to a shared database would create exactly the PII
 * surface that flag exists to gate, without the pseudonymisation the monitoring
 * path insists on. So history lives in the browser of the person who asked the
 * questions: it survives a reload, it never leaves their machine, and it is
 * theirs to delete.
 *
 * If durable, cross-device history is wanted later, the honest version is a
 * Postgres table behind that same policy flag with a retention window — not a
 * quiet upgrade of this.
 */

const STORAGE_KEY = 'cortex_history';

/** Keep history useful without letting it consume the ~5 MB localStorage quota. */
const MAX_CONVERSATIONS = 25;
const MAX_BYTES = 1_500_000;

export interface CortexConversation {
  id: string;
  /** Derived from the first question — the operator recognises their own words. */
  title: string;
  startedAt: string;
  updatedAt: string;
  messages: AgentMessage[];
}

/** `timestamp` is a Date on AgentMessage, so it needs reviving after JSON. */
function reviveMessages(raw: unknown): AgentMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => ({
    ...(m as AgentMessage),
    timestamp: new Date((m as { timestamp: string }).timestamp),
  }));
}

function read(): CortexConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => ({ ...c, messages: reviveMessages(c.messages) }));
  } catch {
    // Corrupt or unavailable storage must not break the panel.
    return [];
  }
}

function write(conversations: CortexConversation[]): CortexConversation[] {
  let pruned = conversations.slice(0, MAX_CONVERSATIONS);
  try {
    // Drop the oldest until it fits. An evidence ledger can be large, so a
    // conversation count alone is not a sufficient bound.
    while (pruned.length > 1 && JSON.stringify(pruned).length > MAX_BYTES) {
      pruned = pruned.slice(0, -1);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Quota exceeded or storage disabled (private window). Try once with a
    // single conversation, then give up quietly — losing history is annoying,
    // breaking the chat is not acceptable.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned.slice(0, 1)));
      return pruned.slice(0, 1);
    } catch {
      return pruned;
    }
  }
  return pruned;
}

/** A recognisable label from the operator's own first question. */
export function deriveTitle(messages: AgentMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const text = (firstUser?.content ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return 'Empty conversation';
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export interface UseCortexHistoryResult {
  conversations: CortexConversation[];
  /** Upsert the live conversation. No-op for an empty transcript. */
  save: (id: string, messages: AgentMessage[]) => void;
  load: (id: string) => AgentMessage[] | null;
  remove: (id: string) => void;
  clearAll: () => void;
}

export function useCortexHistory(): UseCortexHistoryResult {
  const [conversations, setConversations] = useState<CortexConversation[]>(() => read());
  // A ref so `save` can stay referentially stable — it is called from effects.
  const ref = useRef(conversations);
  useEffect(() => {
    ref.current = conversations;
  }, [conversations]);

  const save = useCallback((id: string, messages: AgentMessage[]) => {
    // An untouched conversation is not history. Requiring an answer as well as
    // a question keeps abandoned drafts out of the list.
    if (!messages.some((m) => m.role === 'agent')) return;

    const now = new Date().toISOString();
    const existing = ref.current.find((c) => c.id === id);
    const entry: CortexConversation = {
      id,
      title: existing?.title ?? deriveTitle(messages),
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      messages,
    };
    // Newest first, and the live conversation moves to the top as it grows.
    const next = [entry, ...ref.current.filter((c) => c.id !== id)];
    setConversations(write(next));
  }, []);

  const load = useCallback((id: string) => {
    const found = ref.current.find((c) => c.id === id);
    return found ? found.messages : null;
  }, []);

  const remove = useCallback((id: string) => {
    setConversations(write(ref.current.filter((c) => c.id !== id)));
  }, []);

  const clearAll = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    setConversations([]);
  }, []);

  return { conversations, save, load, remove, clearAll };
}
