/**
 * Theme Configuration
 * Supports: Default, Dark, Miami Vice (80s neon), Pirate, and MI5 themes
 */

export type ThemeMode = 'default' | 'dark' | 'synthwave' | 'pirate' | 'mi5' | 'kroger';

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
    displayName: 'Miami Vice',
    emoji: '🌴',
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
  },
  pirate: {
    name: 'pirate',
    displayName: 'Pirate',
    emoji: '🏴‍☠️',
    colors: {
      // Treasure gold primary - #D4AF37
      primary: '45 65% 52%', // #D4AF37 (treasure gold)
      primaryForeground: '20 45% 7%', // #1A0F0A (dark text on gold)
      // Deep crimson secondary - #8B0000
      secondary: '0 100% 27%', // #8B0000 (dark red)
      secondaryForeground: '38 56% 89%', // #F5E6D3 (bone white)
      // Dark wood background - #1A0F0A
      background: '20 45% 7%', // #1A0F0A (very dark brown)
      foreground: '38 56% 89%', // #F5E6D3 (weathered bone/cream)
      // Aged wood card surfaces - #2B1810
      card: '18 45% 13%', // #2B1810 (aged wood)
      cardForeground: '38 56% 89%', // #F5E6D3 (bone white)
      popover: '18 45% 13%', // #2B1810 (aged wood)
      popoverForeground: '38 56% 89%', // #F5E6D3
      // Muted brown
      muted: '25 40% 20%', // Dark brown
      mutedForeground: '38 45% 70%', // Light tan
      // Rusty red accent - #A52A2A
      accent: '0 59% 41%', // #A52A2A (rusty red/brown)
      accentForeground: '38 56% 89%', // #F5E6D3
      // Blood red destructive - #DC143C
      destructive: '348 83% 47%', // #DC143C (crimson)
      destructiveForeground: '38 56% 89%', // #F5E6D3
      // Rusty gold borders - #B8860B
      border: '43 89% 38%', // #B8860B (dark goldenrod)
      input: '18 45% 13%', // #2B1810 (aged wood input bg)
      ring: '45 65% 52%' // #D4AF37 (gold focus ring)
    }
  },
  mi5: {
    name: 'mi5',
    displayName: 'MI5',
    emoji: '🕵️',
    colors: {
      // Mission Impossible iconic red - #D30000
      primary: '0 100% 41%', // #D30000 (MI red)
      primaryForeground: '0 0% 100%', // #FFFFFF (white text on red)
      // Dark red secondary - #8B0000
      secondary: '0 100% 27%', // #8B0000 (dark red)
      secondaryForeground: '0 0% 91%', // #E8E8E8 (light gray)
      // Very dark background - #0A0A0A
      background: '0 0% 4%', // #0A0A0A (near black)
      foreground: '0 0% 91%', // #E8E8E8 (light gray)
      // Dark card surfaces - #1A1A1A
      card: '0 0% 10%', // #1A1A1A (dark gray)
      cardForeground: '0 0% 91%', // #E8E8E8
      popover: '0 0% 10%', // #1A1A1A
      popoverForeground: '0 0% 91%', // #E8E8E8
      // Muted dark gray
      muted: '0 0% 15%', // #262626
      mutedForeground: '0 0% 70%', // #B3B3B3
      // Steel blue accent - #4A90A4
      accent: '196 38% 47%', // #4A90A4 (steel blue)
      accentForeground: '0 0% 100%', // #FFFFFF
      // Bright red destructive - #FF0000
      destructive: '0 100% 50%', // #FF0000 (bright red)
      destructiveForeground: '0 0% 100%', // #FFFFFF
      // Red borders with opacity
      border: '0 100% 41%', // #D30000 (MI red)
      input: '0 0% 10%', // #1A1A1A (dark input bg)
      ring: '0 100% 41%' // #D30000 (red focus ring)
    }
  },
  kroger: {
    name: 'kroger',
    displayName: 'Kroger',
    emoji: '🛒',
    colors: {
      // Kroger brand blue - #0F3989
      primary: '217 83% 31%', // #0F3989 (Kroger brand blue)
      primaryForeground: '0 0% 100%', // #FFFFFF (white text on blue)
      // Dark gray buttons - #32373c
      secondary: '210 10% 23%', // #32373c (dark gray for buttons)
      secondaryForeground: '0 0% 100%', // #FFFFFF
      // Clean white background
      background: '0 0% 100%', // #FFFFFF (white)
      foreground: '0 0% 0%', // #000000 (black text)
      // Card surfaces - light gray - #F7F8F8
      card: '200 17% 98%', // #F7F8F8 (light gray)
      cardForeground: '0 0% 0%', // #000000
      popover: '0 0% 100%', // #FFFFFF
      popoverForeground: '0 0% 0%', // #000000
      // Muted light gray
      muted: '200 17% 98%', // #F7F8F8 (light gray)
      mutedForeground: '0 0% 29%', // #4A4A4A (medium gray)
      // Accent light blue - #64C2EA
      accent: '196 75% 66%', // #64C2EA (light blue)
      accentForeground: '0 0% 100%', // #FFFFFF
      // Destructive red
      destructive: '0 84.2% 60.2%', // Red
      destructiveForeground: '0 0% 100%', // #FFFFFF
      // Subtle borders
      border: '0 0% 92%', // Very subtle gray border
      input: '0 0% 100%', // #FFFFFF (white input bg)
      ring: '196 75% 66%' // #64C2EA (light blue focus ring)
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
  root.classList.remove('theme-default', 'theme-dark', 'theme-synthwave', 'theme-pirate', 'theme-mi5', 'theme-kroger');
  root.classList.add(`theme-${theme}`);
}

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem('theme') as ThemeMode;
  return stored && themes[stored] ? stored : 'default';
}
