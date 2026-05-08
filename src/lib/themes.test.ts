import { describe, it, expect, beforeEach, vi } from 'vitest';
import { themes, applyTheme, getStoredTheme } from './themes';

beforeEach(() => {
  // Fresh in-memory localStorage stub per test.
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
  // Reset documentElement classes between tests.
  document.documentElement.className = '';
});

describe('themes registry', () => {
  it('exposes the four supported theme modes', () => {
    expect(themes.default).toBeDefined();
    expect(themes.dark).toBeDefined();
    expect(themes.ep1).toBeDefined();
    expect(themes.dev).toBeDefined();
  });

  it('every theme has a name and a colors record', () => {
    for (const [mode, theme] of Object.entries(themes)) {
      expect(theme.name, `${mode}.name`).toBeTruthy();
      expect(theme.colors, `${mode}.colors`).toBeTypeOf('object');
      expect(Object.keys(theme.colors).length).toBeGreaterThan(0);
    }
  });
});

describe('applyTheme', () => {
  it('writes CSS variables onto the documentElement style', () => {
    applyTheme('dark');
    // Pick one color key and confirm the kebab-cased CSS var is set.
    const oneKey = Object.keys(themes.dark.colors)[0];
    const cssVar = `--${oneKey.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    const expected = themes.dark.colors[oneKey as keyof (typeof themes.dark)['colors']];
    expect(document.documentElement.style.getPropertyValue(cssVar)).toBe(expected);
  });

  it('persists the chosen theme to localStorage', () => {
    applyTheme('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('replaces any existing theme-* class on the documentElement', () => {
    document.documentElement.classList.add('theme-default', 'something-else');
    applyTheme('ep1');
    expect(document.documentElement.classList.contains('theme-default')).toBe(false);
    expect(document.documentElement.classList.contains('theme-ep1')).toBe(true);
    // unrelated classes are not touched
    expect(document.documentElement.classList.contains('something-else')).toBe(true);
  });
});

describe('getStoredTheme', () => {
  it('returns "default" when no theme persisted', () => {
    expect(getStoredTheme()).toBe('default');
  });

  it('returns a recognized theme value when persisted', () => {
    localStorage.setItem('theme', 'dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('returns "default" when localStorage holds an unrecognized value', () => {
    localStorage.setItem('theme', 'made-up');
    expect(getStoredTheme()).toBe('default');
  });
});
