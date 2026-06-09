/**
 * Theme Configuration
 * Supports: Default, Dark, and EP1 themes
 */

export type ThemeMode = 'default' | 'dark' | 'ep1' | 'dev';

export interface Theme {
  name: string;
  displayName: string;
  colors: {
    // Legacy tokens (maintained for backward compatibility)
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

    // Semantic tokens - Background
    backgroundDefault?: string;
    backgroundSecondary?: string;
    backgroundInverse?: string;

    // Semantic tokens - Surface
    surfacePrimary?: string;
    surfaceSecondary?: string;
    surfaceElevated?: string;

    // Semantic tokens - Brand
    brandPrimary?: string;
    brandPrimaryHover?: string;
    brandPrimaryActive?: string;
    brandSecondary?: string;
    brandSecondaryHover?: string;

    // Semantic tokens - Text
    textPrimary?: string;
    textSecondary?: string;
    textMuted?: string;
    textInverse?: string;
    textOnBrand?: string;

    // Semantic tokens - Border
    borderDefault?: string;
    borderSubtle?: string;
    borderFocus?: string;

    // Semantic tokens - Status
    statusSuccess?: string;
    statusSuccessBg?: string;
    statusWarning?: string;
    statusWarningBg?: string;
    statusError?: string;
    statusErrorBg?: string;
    statusInfo?: string;
    statusInfoBg?: string;

    // Semantic tokens - Table
    tableHeaderBg?: string;
    tableHeaderText?: string;
    tableHeaderBorder?: string;
    tableRowBg?: string;
    tableRowHover?: string;
    tableRowSelected?: string;
    tableRowBorder?: string;
    tableCellText?: string;
    tableCellMuted?: string;

    // Semantic tokens - Button
    buttonPrimaryBg?: string;
    buttonPrimaryHover?: string;
    buttonPrimaryActive?: string;
    buttonPrimaryText?: string;
    buttonSecondaryBg?: string;
    buttonSecondaryHover?: string;
    buttonSecondaryActive?: string;
    buttonSecondaryText?: string;
    buttonOutlineBorder?: string;
    buttonOutlineHoverBg?: string;

    // Semantic tokens - Navigation
    navBackground?: string;
    navText?: string;
    navTextMuted?: string;
    navItemHover?: string;
    navItemActive?: string;
    navBorder?: string;

    // Semantic tokens - Form
    formLabelText?: string;
    formLabelRequired?: string;
    inputBg?: string;
    inputBorder?: string;
    inputBorderHover?: string;
    inputBorderFocus?: string;
    inputText?: string;
    inputPlaceholder?: string;
    inputDisabledBg?: string;
    inputDisabledText?: string;
    inputErrorBorder?: string;
    inputErrorBg?: string;

    // Semantic tokens - Link
    linkDefault?: string;
    linkHover?: string;
    linkVisited?: string;
    linkActive?: string;
  };
  emoji?: string;
}

export const themes: Record<ThemeMode, Theme> = {
  dev: {
    name: 'dev',
    displayName: 'Dev',
    emoji: '{}',
    colors: {
      // OS-ONE Material Design Dark — base surface #121212
      primary: '#BB86FC',          // Material violet 200
      primaryForeground: 'rgba(0,0,0,0.87)',
      secondary: '#03DAC5',        // Material teal 200
      secondaryForeground: 'rgba(0,0,0,0.87)',
      background: '#121212',
      foreground: 'rgba(255,255,255,0.87)',
      card: '#1d1d1d',             // surface 1dp
      cardForeground: 'rgba(255,255,255,0.87)',
      popover: '#212121',          // surface 2dp
      popoverForeground: 'rgba(255,255,255,0.87)',
      muted: '#1d1d1d',
      mutedForeground: 'rgba(255,255,255,0.60)',
      accent: '#BB86FC',
      accentForeground: 'rgba(0,0,0,0.87)',
      destructive: '#CF6679',      // Material error
      destructiveForeground: 'rgba(0,0,0,0.87)',
      border: 'rgba(255,255,255,0.12)',
      input: 'rgba(255,255,255,0.05)',
      ring: '#BB86FC',
      // Semantic
      statusSuccess: '#81C784',
      statusSuccessBg: '#0a1f0c',
      statusWarning: '#FFB74D',
      statusWarningBg: '#1f150a',
      statusError: '#CF6679',
      statusErrorBg: '#1f0a0d',
      statusInfo: '#03DAC5',
      statusInfoBg: '#031f1e',
      // Sidebar
      navBackground: '#1d1d1d',
      navText: 'rgba(255,255,255,0.87)',
      navTextMuted: 'rgba(255,255,255,0.60)',
      navItemHover: '#BB86FC',
      navItemActive: '#BB86FC',
      navBorder: 'rgba(255,255,255,0.12)',
    }
  },
  default: {
    name: 'default',
    displayName: 'Default',
    emoji: '🌐',
    colors: {
      primary: '#0f172a',
      primaryForeground: '#f8fafc',
      secondary: '#f1f5f9',
      secondaryForeground: '#0f172a',
      background: '#ffffff',
      foreground: '#0f172a',
      card: '#ffffff',
      cardForeground: '#0f172a',
      popover: '#ffffff',
      popoverForeground: '#0f172a',
      muted: '#f1f5f9',
      mutedForeground: '#64748b',
      accent: '#f1f5f9',
      accentForeground: '#0f172a',
      destructive: '#ef4444',
      destructiveForeground: '#f8fafc',
      border: '#e2e8f0',
      input: '#e2e8f0',
      ring: '#0f172a',
      statusSuccess: '#16a34a',
      statusSuccessBg: '#f0fdf4',
      statusWarning: '#d97706',
      statusWarningBg: '#fffbeb',
      statusError: '#dc2626',
      statusErrorBg: '#fef2f2',
      statusInfo: '#2563eb',
      statusInfoBg: '#eff6ff',
    }
  },
  dark: {
    name: 'dark',
    displayName: 'Dark',
    emoji: '🌙',
    colors: {
      primary: '#f8fafc',
      primaryForeground: '#0f172a',
      secondary: '#1e293b',
      secondaryForeground: '#f8fafc',
      background: '#1e1f2a',
      foreground: '#f8fafc',
      card: '#1e1f2a',
      cardForeground: '#f8fafc',
      popover: '#1e1f2a',
      popoverForeground: '#f8fafc',
      muted: '#1e1f2a',
      mutedForeground: '#94a3b8',
      accent: '#1e293b',
      accentForeground: '#f8fafc',
      destructive: '#7f1d1d',
      destructiveForeground: '#f8fafc',
      border: '#1e293b',
      input: '#1e1f2a',
      ring: '#cbd5e1',
      statusSuccess: '#4ade80',
      statusSuccessBg: '#052e16',
      statusWarning: '#fbbf24',
      statusWarningBg: '#451a03',
      statusError: '#f87171',
      statusErrorBg: '#450a0a',
      statusInfo: '#60a5fa',
      statusInfoBg: '#172554',
    }
  },
  ep1: {
    name: 'ep1',
    displayName: 'EP1',
    emoji: '⬡',
    colors: {
      // Exact Extreme Platform ONE template values
      primary: '#8981e5',          // rgba(137,129,229) — interactive purple
      primaryForeground: '#1e1a46', // rgba(30,26,70) — dark navy on purple
      secondary: 'transparent',
      secondaryForeground: '#aba3fb', // rgba(171,163,251)
      background: '#1e1f2a',       // rgba(30,31,42)
      foreground: '#f8f8fb',       // rgba(248,248,251)
      card: '#2d2f3e',             // rgba(45,47,62)
      cardForeground: '#f8f8fb',
      popover: '#2d2f3e',
      popoverForeground: '#f8f8fb',
      muted: '#2d2f3e',            // kept for table/row UX (template: transparent)
      mutedForeground: '#babcce',  // rgba(186,188,206)
      accent: '#8981e5',           // same as primary — hover states
      accentForeground: '#1e1a46',
      destructive: '#ed5f56',      // rgba(237,95,86)
      destructiveForeground: '#f8f8fb',
      border: '#999cb3',           // rgba(153,156,179)
      input: 'transparent',
      ring: '#8981e5',
      // Semantic tokens — template-matched
      backgroundDefault: '#1e1f2a',
      backgroundSecondary: '#1D2033',
      backgroundInverse: '#f8f8fb',
      surfacePrimary: '#2d2f3e',
      surfaceSecondary: '#323650',
      surfaceElevated: '#343852',
      brandPrimary: '#8981e5',
      brandPrimaryHover: '#aba3fb',
      brandPrimaryActive: '#7b74d4',
      brandSecondary: '#aba3fb',
      brandSecondaryHover: '#c4beff',
      textPrimary: '#f8f8fb',
      textSecondary: '#D7D9E6',
      textMuted: '#babcce',
      textInverse: '#1e1a46',
      textOnBrand: '#1e1a46',
      borderDefault: '#4d4f63',    // sidebar-border
      borderSubtle: '#3a3e5c',
      borderFocus: '#8981e5',
      statusSuccess: '#75bf63',    // rgba(117,191,99) — template chart-3
      statusSuccessBg: '#1E3D1A',
      statusWarning: '#E5B85C',
      statusWarningBg: '#3D2E10',
      statusError: '#ed5f56',
      statusErrorBg: '#3D1A1E',
      statusInfo: '#8981e5',
      statusInfoBg: '#1e1a46',
      tableHeaderBg: '#30344B',
      tableHeaderText: '#D7D9E6',
      tableHeaderBorder: '#4d4f63',
      tableRowBg: '#2E3248',
      tableRowHover: '#3A3E58',
      tableRowSelected: '#3d3b6a',
      tableRowBorder: '#3a3e5c',
      tableCellText: '#f8f8fb',
      tableCellMuted: '#babcce',
      buttonPrimaryBg: '#8981e5',
      buttonPrimaryHover: '#aba3fb',
      buttonPrimaryActive: '#7b74d4',
      buttonPrimaryText: '#1e1a46',
      buttonSecondaryBg: 'transparent',
      buttonSecondaryHover: '#8981e5',
      buttonSecondaryActive: '#7b74d4',
      buttonSecondaryText: '#aba3fb',
      buttonOutlineBorder: '#8981e5',
      buttonOutlineHoverBg: '#8981e5',
      navBackground: '#2d2f3e',
      navText: '#f8f8fb',
      navTextMuted: '#babcce',
      navItemHover: '#8981e5',
      navItemActive: '#8981e5',
      navBorder: '#4d4f63',
      formLabelText: '#D7D9E6',
      formLabelRequired: '#ed5f56',
      inputBg: 'transparent',
      inputBorder: '#4d4f63',
      inputBorderHover: '#999cb3',
      inputBorderFocus: '#8981e5',
      inputText: '#f8f8fb',
      inputPlaceholder: '#babcce',
      inputDisabledBg: '#252840',
      inputDisabledText: '#7C8098',
      inputErrorBorder: '#ed5f56',
      inputErrorBg: '#3D1A1E',
      linkDefault: '#8981e5',
      linkHover: '#aba3fb',
      linkVisited: '#7b74d4',
      linkActive: '#7b74d4'
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
  root.classList.remove('theme-default', 'theme-dark', 'theme-ep1');
  root.classList.add(`theme-${theme}`);
}

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem('theme') as ThemeMode;
  return stored && themes[stored] ? stored : 'default';
}
