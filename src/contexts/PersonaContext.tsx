import { createContext, useContext, useMemo, useCallback, type ReactNode } from 'react';
import { PERSONA_MAP, type PersonaId } from '@/config/personaDefinitions';

export interface PersonaContextValue {
  activePersona: PersonaId;
  setActivePersona: (id: PersonaId) => void;
  isPageAllowed: (pageId: string) => boolean;
  filterItems: <T extends { id: string }>(items: T[]) => T[];
  /** True when the "dev" theme is active (enables NVO badges in production) */
  isDevTheme: boolean;
}

export const PERSONA_STORAGE_KEY = 'aura-dev-persona';

export function readStoredPersona(): PersonaId {
  const stored = localStorage.getItem(PERSONA_STORAGE_KEY);
  if (stored && PERSONA_MAP.has(stored as PersonaId)) {
    return stored as PersonaId;
  }
  return 'super-user';
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

interface PersonaProviderProps {
  theme: string;
  activePersona: PersonaId;
  setActivePersona: (id: PersonaId) => void;
  children: ReactNode;
}

/** Derives filtering helpers from persona + theme. State is owned by the parent (App.tsx). */
export function PersonaProvider({ theme, activePersona, setActivePersona, children }: PersonaProviderProps) {
  const isDevFiltering = theme === 'dev' && activePersona !== 'super-user';

  const allowedPages = useMemo(() => {
    if (!isDevFiltering) return null;
    const def = PERSONA_MAP.get(activePersona);
    return def ? new Set(def.allowedPages) : null;
  }, [isDevFiltering, activePersona]);

  const isPageAllowed = useCallback((pageId: string): boolean => {
    if (!allowedPages) return true;
    return allowedPages.has(pageId);
  }, [allowedPages]);

  const filterItems = useCallback(<T extends { id: string }>(items: T[]): T[] => {
    if (!allowedPages) return items;
    return items.filter(item => allowedPages.has(item.id));
  }, [allowedPages]);

  const value = useMemo<PersonaContextValue>(() => ({
    activePersona,
    setActivePersona,
    isPageAllowed,
    filterItems,
    isDevTheme: theme === 'dev',
  }), [activePersona, setActivePersona, isPageAllowed, filterItems, theme]);

  return (
    <PersonaContext.Provider value={value}>
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersonaContext(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersonaContext must be used within PersonaProvider');
  return ctx;
}

/** Safe hook — returns false when used outside PersonaProvider (e.g. in tests). */
export function useIsDevTheme(): boolean {
  return useContext(PersonaContext)?.isDevTheme ?? false;
}
