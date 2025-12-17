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
      // Miami Vice inspired - #FF2BD6 (primary pink neon)
      primary: '316 100% 58%', // #FF2BD6
      primaryForeground: '225 50% 7%', // #070A1A (dark text on pink)
      // Secondary with cyan neon
      secondary: '186 100% 50%', // #00E5FF (cyan neon)
      secondaryForeground: '225 44% 12%', // #0B1030
      // Deep space background - #070A1A
      background: '225 50% 7%', // #070A1A
      foreground: '216 100% 97%', // #F2F6FF (primary text)
      // Card surfaces - #0B1030, #101A46
      card: '225 44% 12%', // #0B1030 (surface1)
      cardForeground: '216 100% 97%', // #F2F6FF
      popover: '225 44% 12%', // #0B1030
      popoverForeground: '216 100% 97%', // #F2F6FF
      // Muted using surface2 - #101A46
      muted: '224 64% 17%', // #101A46 (surface2)
      mutedForeground: '216 100% 85%', // rgba(242, 246, 255, 0.78) - secondary text
      // Accent cyan
      accent: '186 100% 50%', // #00E5FF (cyan neon)
      accentForeground: '225 44% 12%', // #0B1030
      // Danger state - #FF3B6B
      destructive: '348 100% 62%', // #FF3B6B
      destructiveForeground: '216 100% 97%', // #F2F6FF
      // Border with cyan at 22% opacity - rgba(0, 229, 255, 0.22)
      border: '186 100% 50%', // #00E5FF base (opacity applied in CSS)
      input: '225 50% 7%', // #070A1A (dark input bg)
      ring: '316 100% 58%' // #FF2BD6 (pink focus ring at 70% opacity)
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
