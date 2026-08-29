/**
 * The caller's AURA identity (username, role) from the session cookie.
 *
 * Absence of a session is not an error: environments without the identity
 * layer (no database, pre-identity API clients) behave exactly as before, so
 * the hook defaults to full capability until a session says otherwise —
 * enforcement lives on the server, this hook only shapes the UI.
 */

import { useEffect, useState } from 'react';

export interface AuraSessionUser {
  username: string;
  role: 'viewer' | 'operator' | 'admin';
  source: 'controller' | 'sso';
}

interface AuraSessionState {
  user: AuraSessionUser | null;
  loaded: boolean;
}

let cached: AuraSessionUser | null | undefined;

export async function fetchAuraSession(force = false): Promise<AuraSessionUser | null> {
  if (!force && cached !== undefined) return cached;
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' });
    cached = resp.ok ? ((await resp.json()).user ?? null) : null;
  } catch {
    cached = null;
  }
  return cached ?? null;
}

export function clearAuraSessionCache(): void {
  cached = undefined;
}

export function useAuraSession(): AuraSessionState & {
  /** False only when a session exists and its role is viewer. */
  canOperate: boolean;
  isAdmin: boolean;
} {
  const [state, setState] = useState<AuraSessionState>({ user: null, loaded: false });

  useEffect(() => {
    let cancelled = false;
    fetchAuraSession().then((user) => {
      if (!cancelled) setState({ user, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const role = state.user?.role;
  return {
    ...state,
    canOperate: role === undefined || role === 'operator' || role === 'admin',
    isAdmin: role === undefined ? true : role === 'admin',
  };
}
