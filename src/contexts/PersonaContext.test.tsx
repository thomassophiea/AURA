import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import {
  PersonaProvider,
  usePersonaContext,
  useIsDevTheme,
  readStoredPersona,
  PERSONA_STORAGE_KEY,
} from './PersonaContext';
import type { PersonaId } from '@/config/personaDefinitions';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeWrapper(theme: string, persona: PersonaId = 'super-user') {
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) => (
    <PersonaProvider theme={theme} activePersona={persona} setActivePersona={vi.fn()}>
      {children}
    </PersonaProvider>
  );
}

describe('readStoredPersona', () => {
  it('returns super-user when nothing is stored', () => {
    expect(readStoredPersona()).toBe('super-user');
  });

  it('returns the stored value when it is a valid persona id', () => {
    localStorage.setItem(PERSONA_STORAGE_KEY, 'netops');
    expect(readStoredPersona()).toBe('netops');
  });

  it('falls back to super-user when stored value is not a valid persona', () => {
    localStorage.setItem(PERSONA_STORAGE_KEY, 'made-up');
    expect(readStoredPersona()).toBe('super-user');
  });
});

describe('usePersonaContext', () => {
  it('throws when called outside a provider', () => {
    expect(() => renderHook(() => usePersonaContext())).toThrow(
      /must be used within PersonaProvider/i
    );
  });

  it('exposes activePersona + setActivePersona + helpers', () => {
    const { result } = renderHook(() => usePersonaContext(), {
      wrapper: makeWrapper('default', 'netops'),
    });
    expect(result.current.activePersona).toBe('netops');
    expect(typeof result.current.setActivePersona).toBe('function');
    expect(typeof result.current.isPageAllowed).toBe('function');
    expect(typeof result.current.filterItems).toBe('function');
  });

  it('isPageAllowed returns true for super-user (no filtering)', () => {
    const { result } = renderHook(() => usePersonaContext(), {
      wrapper: makeWrapper('dev', 'super-user'),
    });
    expect(result.current.isPageAllowed('any-page')).toBe(true);
  });

  it('isPageAllowed only filters when theme = dev AND persona ≠ super-user', () => {
    const dev = renderHook(() => usePersonaContext(), {
      wrapper: makeWrapper('dev', 'service-catalog'),
    });
    // service-catalog persona has only a few pages
    expect(dev.result.current.isPageAllowed('made-up-page')).toBe(false);
    expect(dev.result.current.isPageAllowed('workspace')).toBe(true);

    const nonDev = renderHook(() => usePersonaContext(), {
      wrapper: makeWrapper('default', 'service-catalog'),
    });
    // No filtering when theme isn't dev
    expect(nonDev.result.current.isPageAllowed('made-up-page')).toBe(true);
  });

  it('filterItems strips items whose id is not in the persona allowlist', () => {
    const { result } = renderHook(() => usePersonaContext(), {
      wrapper: makeWrapper('dev', 'service-catalog'),
    });
    const items = [
      { id: 'workspace', label: 'Workspace' },
      { id: 'made-up', label: 'Junk' },
    ];
    expect(result.current.filterItems(items)).toEqual([{ id: 'workspace', label: 'Workspace' }]);
  });

  it('isDevTheme is true only for theme = "dev"', () => {
    const dev = renderHook(() => usePersonaContext(), {
      wrapper: makeWrapper('dev'),
    });
    const light = renderHook(() => usePersonaContext(), {
      wrapper: makeWrapper('default'),
    });
    expect(dev.result.current.isDevTheme).toBe(true);
    expect(light.result.current.isDevTheme).toBe(false);
  });
});

describe('useIsDevTheme', () => {
  it('returns false outside a provider (does not throw)', () => {
    const { result } = renderHook(() => useIsDevTheme());
    expect(result.current).toBe(false);
  });

  it('returns true inside a dev-theme provider', () => {
    const { result } = renderHook(() => useIsDevTheme(), {
      wrapper: makeWrapper('dev'),
    });
    expect(result.current).toBe(true);
  });
});

describe('PersonaProvider rendering', () => {
  it('renders children', () => {
    const { container } = render(
      <PersonaProvider theme="default" activePersona="super-user" setActivePersona={vi.fn()}>
        <div data-testid="child">hi</div>
      </PersonaProvider>
    );
    expect(container.querySelector('[data-testid="child"]')!.textContent).toBe('hi');
  });
});
