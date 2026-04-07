import { useState, useEffect, useCallback } from 'react';
import { applyTheme as applyThemeColors, ThemeMode } from '../lib/themes';

type Theme = 'light' | 'dark' | 'synthwave' | 'ep1' | 'system';

const STORAGE_KEY = 'aura-theme-preference';
const DARK_OVERLAY_THEMES = ['synthwave', 'pirate', 'mi5', 'ep1'] as const;

// Map from user-facing theme to base ThemeMode for legacy token application
const BASE_THEME_MAP: Record<string, ThemeMode> = {
  light: 'default',
  dark: 'dark',
  synthwave: 'dark',
  ep1: 'ep1',
  pirate: 'dark',
  mi5: 'dark',
  system: 'dark',
};

function applyThemeToDOM(newTheme: string) {
  const root = document.documentElement;
  const isDarkOverlay = DARK_OVERLAY_THEMES.includes(newTheme as typeof DARK_OVERLAY_THEMES[number]);

  const baseTheme = BASE_THEME_MAP[newTheme] ?? 'dark';
  applyThemeColors(baseTheme);

  root.classList.remove('light', 'dark', 'synthwave', 'pirate', 'mi5', 'ep1');
  document.body.classList.remove('light', 'dark', 'synthwave', 'pirate', 'mi5', 'ep1');

  if (isDarkOverlay) {
    root.classList.add('dark', newTheme);
    document.body.classList.add('dark', newTheme);
  } else {
    root.classList.add(newTheme);
    document.body.classList.add(newTheme);
  }

  root.setAttribute('data-theme', newTheme);
}

function resolveTheme(theme: Theme): 'light' | 'dark' | 'synthwave' | 'ep1' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'synthwave' || stored === 'ep1' || stored === 'system') {
      return stored;
    }
    const legacyTheme = localStorage.getItem('theme');
    if (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'synthwave' || legacyTheme === 'ep1' || legacyTheme === 'system') {
      return legacyTheme;
    }
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark' | 'synthwave' | 'ep1'>(() => resolveTheme(theme));

  const applyTheme = useCallback((newTheme: Theme) => {
    const resolved = resolveTheme(newTheme);
    applyThemeToDOM(resolved);
    setResolvedTheme(resolved);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(STORAGE_KEY, newTheme);
    localStorage.setItem('theme', newTheme);
    setThemeState(newTheme);
    applyTheme(newTheme);
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    const next: Theme =
      theme === 'light' ? 'dark' :
      theme === 'dark' ? 'synthwave' :
      theme === 'synthwave' ? 'ep1' :
      theme === 'ep1' ? 'system' :
      'light';
    setTheme(next);
  }, [theme, setTheme]);

  useEffect(() => {
    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === 'dark' || resolvedTheme === 'synthwave' || resolvedTheme === 'ep1'
  };
}
