/**
 * Theme Configuration
 * Supports: Default, Dark, and EP1 themes
 */

import {
  STATUS_COLORS,
  STATUS_COLORS_LIGHT,
  EP1_CATEGORICAL,
  EP1_CATEGORICAL_LIGHT,
} from '../config/colorPalette';

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
    statusOffline?: string;
    statusNeutral?: string;

    // Tailwind-facing status tokens (`text-success` etc. read --success/--warning/--info).
    // These MUST agree with the status* values above — they are the same semantic
    // color exposed under the name the Tailwind @theme block maps.
    success?: string;
    successForeground?: string;
    warning?: string;
    warningForeground?: string;
    info?: string;
    infoForeground?: string;

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
  /** Chart series ramp — written as --chart-1..--chart-N by applyTheme. */
  charts?: readonly string[];
  emoji?: string;
}

export const themes: Record<ThemeMode, Theme> = {
  dev: {
    name: 'dev',
    displayName: 'Dev',
    emoji: '{}',
    colors: {
      // Ubiquiti-inspired dark (UniFi OS look) — near-black base #15161a
      primary: '#2E7DF7',          // Ubiquiti blue
      primaryForeground: '#ffffff',
      secondary: '#06AED4',        // muted cyan accent
      secondaryForeground: '#ffffff',
      background: '#15161a',
      foreground: 'rgba(255,255,255,0.92)',
      card: '#1c1d21',             // surface 1
      cardForeground: 'rgba(255,255,255,0.92)',
      popover: '#212226',          // surface 2
      popoverForeground: 'rgba(255,255,255,0.92)',
      muted: '#1c1d21',
      mutedForeground: 'rgba(255,255,255,0.58)',
      accent: '#2E7DF7',
      accentForeground: '#ffffff',
      destructive: '#E5484D',      // clean red, not dusty rose
      destructiveForeground: '#ffffff',
      border: 'rgba(255,255,255,0.08)',
      input: 'rgba(255,255,255,0.05)',
      ring: '#2E7DF7',
      // Semantic
      statusSuccess: '#12B76A',
      statusSuccessBg: '#0a1f14',
      statusWarning: '#F5A524',
      statusWarningBg: '#211a0a',
      statusError: '#E5484D',
      statusErrorBg: '#210b0c',
      statusInfo: '#2E7DF7',
      statusInfoBg: '#0b1a2e',
      statusOffline: '#6B7280',
      statusNeutral: '#8A8F98',
      success: '#12B76A',
      successForeground: '#ffffff',
      warning: '#F5A524',
      warningForeground: 'rgba(0,0,0,0.87)',
      info: '#2E7DF7',
      infoForeground: '#ffffff',
      // Sidebar
      navBackground: '#1c1d21',
      navText: 'rgba(255,255,255,0.92)',
      navTextMuted: 'rgba(255,255,255,0.58)',
      navItemHover: '#2E7DF7',
      navItemActive: '#2E7DF7',
      navBorder: 'rgba(255,255,255,0.08)',
    },
    // Ubiquiti-inspired chart ramp — blues/greens/ambers, no purple or pink.
    charts: [
      '#2E7DF7',
      '#06AED4',
      '#12B76A',
      '#F5A524',
      '#E5484D',
      '#4C92FF',
      '#84CC16',
      '#FF8A4C',
      '#38BDF8',
      '#94A3B8',
    ],
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
      destructive: '#d92317',
      destructiveForeground: '#f8fafc',
      border: '#e2e8f0',
      input: '#e2e8f0',
      ring: '#0f172a',
      // EP1 brand hues darkened for legibility on white — the EP1 base values measure
      // 1.85-3.3:1 here and fail. See STATUS_COLORS_LIGHT in config/colorPalette.
      statusSuccess: STATUS_COLORS_LIGHT.success,
      statusSuccessBg: '#f4faf2',
      statusWarning: STATUS_COLORS_LIGHT.warning,
      statusWarningBg: '#fbf8f1',
      statusError: STATUS_COLORS_LIGHT.critical,
      statusErrorBg: '#fbf1f1',
      statusInfo: STATUS_COLORS_LIGHT.info,
      statusInfoBg: '#f2f1fb',
      statusOffline: STATUS_COLORS_LIGHT.offline,
      statusNeutral: STATUS_COLORS_LIGHT.neutral,
      // Tailwind-facing mirrors — white text clears 4.8:1 on all four fills.
      success: STATUS_COLORS_LIGHT.success,
      successForeground: '#ffffff',
      warning: STATUS_COLORS_LIGHT.warning,
      warningForeground: '#ffffff',
      info: STATUS_COLORS_LIGHT.info,
      infoForeground: '#ffffff',
    },
    charts: EP1_CATEGORICAL_LIGHT.slice(0, 10),
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
      destructive: '#ed5f56',
      destructiveForeground: '#f8fafc',
      border: '#1e293b',
      input: '#1e1f2a',
      ring: '#cbd5e1',
      // EP1 brand hues at their base values — tuned for dark surfaces.
      statusSuccess: STATUS_COLORS.success,
      statusSuccessBg: '#13240f',
      statusWarning: STATUS_COLORS.warning,
      statusWarningBg: '#281e0b',
      statusError: STATUS_COLORS.critical,
      statusErrorBg: '#280d0b',
      statusInfo: STATUS_COLORS.info,
      statusInfoBg: '#0e0b28',
      statusOffline: STATUS_COLORS.offline,
      statusNeutral: STATUS_COLORS.neutral,
      // Navy text clears 4.9:1 on all four EP1 status fills.
      success: STATUS_COLORS.success,
      successForeground: '#1e1a46',
      warning: STATUS_COLORS.warning,
      warningForeground: '#1e1a46',
      info: STATUS_COLORS.info,
      infoForeground: '#1e1a46',
    },
    charts: EP1_CATEGORICAL.slice(0, 10),
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
      border: 'rgba(255,255,255,0.09)', // soft hairline (was #999cb3)
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
      borderDefault: 'rgba(255,255,255,0.11)', // structural hairline (was #4d4f63)
      borderSubtle: 'rgba(255,255,255,0.06)',  // was #3a3e5c
      borderFocus: '#8981e5',
      statusSuccess: '#75bf63',    // rgba(117,191,99) — template chart-3
      statusSuccessBg: '#1E3D1A',
      statusWarning: '#E5B85C',
      statusWarningBg: '#3D2E10',
      statusError: '#ed5f56',
      statusErrorBg: '#3D1A1E',
      statusInfo: '#8981e5',
      statusInfoBg: '#1e1a46',
      statusOffline: STATUS_COLORS.offline,
      statusNeutral: STATUS_COLORS.neutral,
      success: STATUS_COLORS.success,
      successForeground: '#1e1a46',
      warning: STATUS_COLORS.warning,
      warningForeground: '#1e1a46',
      info: STATUS_COLORS.info,
      infoForeground: '#1e1a46',
      tableHeaderBg: '#30344B',
      tableHeaderText: '#D7D9E6',
      tableHeaderBorder: 'rgba(255,255,255,0.08)',
      tableRowBg: '#2E3248',
      tableRowHover: '#3A3E58',
      tableRowSelected: '#3d3b6a',
      tableRowBorder: 'rgba(255,255,255,0.06)',
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
      navBorder: 'rgba(255,255,255,0.08)',
      formLabelText: '#D7D9E6',
      formLabelRequired: '#ed5f56',
      inputBg: 'transparent',
      inputBorder: 'rgba(255,255,255,0.12)',
      inputBorderHover: 'rgba(255,255,255,0.20)',
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
    },
    charts: EP1_CATEGORICAL.slice(0, 10),
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

  // Chart series ramp — theme-correct categorical colors for --chart-N consumers.
  (selectedTheme.charts ?? []).forEach((color, i) => {
    root.style.setProperty(`--chart-${i + 1}`, color);
  });

  // Store preference
  localStorage.setItem('theme', theme);

  // Add theme class for additional styling
  root.classList.remove('theme-default', 'theme-dark', 'theme-ep1', 'theme-dev');
  root.classList.add(`theme-${theme}`);
}

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem('theme') as ThemeMode;
  return stored && themes[stored] ? stored : 'default';
}
