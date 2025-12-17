/**
 * Theme Configuration
 * Supports: Default, Dark, and Synthwave (80s neon) themes
 */

export type ThemeMode = 'default' | 'dark' | 'synthwave';

export interface Theme {
  name: string;
  displayName: string;
  colors: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    border: string;
    input: string;
    ring: string;
  };
  emoji?: string;
}

export const themes: Record<ThemeMode, Theme> = {
  default: {
    name: 'default',
    displayName: 'Default',
    emoji: '🌐',
    colors: {
      primary: '222.2 47.4% 11.2%',
      primaryForeground: '210 40% 98%',
      secondary: '210 40% 96.1%',
      secondaryForeground: '222.2 47.4% 11.2%',
      background: '0 0% 100%',
      foreground: '222.2 47.4% 11.2%',
      card: '0 0% 100%',
      cardForeground: '222.2 47.4% 11.2%',
      popover: '0 0% 100%',
      popoverForeground: '222.2 47.4% 11.2%',
      muted: '210 40% 96.1%',
      mutedForeground: '215.4 16.3% 46.9%',
      accent: '210 40% 96.1%',
      accentForeground: '222.2 47.4% 11.2%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '210 40% 98%',
      border: '214.3 31.8% 91.4%',
      input: '214.3 31.8% 91.4%',
      ring: '222.2 47.4% 11.2%'
    }
  },
  dark: {
    name: 'dark',
    displayName: 'Dark',
    emoji: '🌙',
    colors: {
      primary: '210 40% 98%',
      primaryForeground: '222.2 47.4% 11.2%',
      secondary: '217.2 32.6% 17.5%',
      secondaryForeground: '210 40% 98%',
      background: '222.2 84% 4.9%',
      foreground: '210 40% 98%',
      card: '222.2 84% 4.9%',
      cardForeground: '210 40% 98%',
      popover: '222.2 84% 4.9%',
      popoverForeground: '210 40% 98%',
      muted: '217.2 32.6% 17.5%',
      mutedForeground: '215 20.2% 65.1%',
      accent: '217.2 32.6% 17.5%',
      accentForeground: '210 40% 98%',
      destructive: '0 62.8% 30.6%',
      destructiveForeground: '210 40% 98%',
      border: '217.2 32.6% 17.5%',
      input: '217.2 32.6% 17.5%',
      ring: '212.7 26.8% 83.9%'
    }
  },
  synthwave: {
    name: 'synthwave',
    displayName: 'Synthwave',
    emoji: '🌆',
    colors: {
      // Hot pink primary (neon magenta)
      primary: '328 100% 54%', // #FF006E
      primaryForeground: '0 0% 100%',
      // Deep purple secondary
      secondary: '276 100% 25%', // Dark purple
      secondaryForeground: '328 100% 70%', // Light pink
      // Deep purple background with dark tint
      background: '265 100% 8%', // Very dark purple, almost black
      foreground: '180 100% 90%', // Light cyan
      // Card with purple gradient feel
      card: '270 50% 12%', // Dark purple card
      cardForeground: '180 100% 90%',
      popover: '270 60% 10%',
      popoverForeground: '180 100% 90%',
      // Muted purple
      muted: '276 60% 20%',
      mutedForeground: '280 40% 70%',
      // Cyan accent
      accent: '186 100% 50%', // Electric cyan #00D9FF
      accentForeground: '270 100% 10%',
      // Hot pink destructive
      destructive: '348 100% 60%',
      destructiveForeground: '0 0% 100%',
      // Neon pink borders
      border: '328 100% 40%',
      input: '276 60% 20%',
      ring: '328 100% 54%' // Hot pink ring
    }
  }
};

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  const selectedTheme = themes[theme];

  // Apply CSS variables
  Object.entries(selectedTheme.colors).forEach(([key, value]) => {
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssVar, value);
  });

  // Store preference
  localStorage.setItem('theme', theme);

  // Add theme class for additional styling
  root.classList.remove('theme-default', 'theme-dark', 'theme-synthwave');
  root.classList.add(`theme-${theme}`);
}

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem('theme') as ThemeMode;
  return stored && themes[stored] ? stored : 'default';
}
