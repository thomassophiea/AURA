import { useState, useEffect, useCallback } from 'react';
import { applyTheme as applyThemeColors } from '../lib/themes';

type Theme = 'light' | 'dark' | 'synthwave' | 'system';

const STORAGE_KEY = 'aura-theme-preference';
const DARK_OVERLAY_THEMES = ['synthwave', 'pirate', 'mi5'] as const;

function applyThemeToDOM(newTheme: string) {
  const root = document.documentElement;
  const isDarkOverlay = DARK_OVERLAY_THEMES.includes(newTheme as typeof DARK_OVERLAY_THEMES[number]);
  
  applyThemeColors(newTheme === 'light' ? 'default' : 'dark');
  
  root.classList.remove('light', 'dark', 'synthwave', 'pirate', 'mi5');
  document.body.classList.remove('light', 'dark', 'synthwave', 'pirate', 'mi5');
  
  if (isDarkOverlay) {
    root.classList.add('dark', newTheme);
    document.body.classList.add('dark', newTheme);
  } else {
    root.classList.add(newTheme);
    document.body.classList.add(newTheme);
  }
  
  root.setAttribute('data-theme', newTheme);
}

function resolveTheme(theme: Theme): 'light' | 'dark' | 'synthwave' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'synthwave' || stored === 'system') {
      return stored;
    }
    const legacyTheme = localStorage.getItem('theme');
    if (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'synthwave' || legacyTheme === 'system') {
      return legacyTheme;
    }
    return 'system';
  });
  
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark' | 'synthwave'>(() => resolveTheme(theme));
  
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
      theme === 'synthwave' ? 'system' :
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
    isDark: resolvedTheme === 'dark' || resolvedTheme === 'synthwave'
  };
}
