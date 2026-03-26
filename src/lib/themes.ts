/**
 * Theme Configuration
 * Supports: Default, Dark, and EP1 themes
 */

export type ThemeMode = 'default' | 'dark' | 'ep1';

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
  ep1: {
    name: 'ep1',
    displayName: 'EP1',
    emoji: '⬡',
    colors: {
      // Legacy tokens mapped to EP1 palette
      primary: '#9C8FEF',
      primaryForeground: '#F9FAFF',
      secondary: '#323650',
      secondaryForeground: '#D7D9E6',
      background: '#191C2D',
      foreground: '#F4F5FA',
      card: '#2B2F45',
      cardForeground: '#F4F5FA',
      popover: '#2B2F45',
      popoverForeground: '#F4F5FA',
      muted: '#323650',
      mutedForeground: '#A6A9BE',
      accent: '#4A4469',
      accentForeground: '#F4F5FA',
      destructive: '#E06A75',
      destructiveForeground: '#F9FAFF',
      border: '#4B4F69',
      input: '#2F334B',
      ring: '#B5A9FF',
      // Semantic tokens
      backgroundDefault: '#191C2D',
      backgroundSecondary: '#1D2033',
      backgroundInverse: '#F4F5FA',
      surfacePrimary: '#2B2F45',
      surfaceSecondary: '#323650',
      surfaceElevated: '#343852',
      brandPrimary: '#9C8FEF',
      brandPrimaryHover: '#AA9CFF',
      brandPrimaryActive: '#8E7BF0',
      brandSecondary: '#7AA6FF',
      brandSecondaryHover: '#8FB6FF',
      textPrimary: '#F4F5FA',
      textSecondary: '#D7D9E6',
      textMuted: '#A6A9BE',
      textInverse: '#191C2D',
      textOnBrand: '#F9FAFF',
      borderDefault: '#4B4F69',
      borderSubtle: '#3E425B',
      borderFocus: '#B5A9FF',
      statusSuccess: '#77D36A',
      statusSuccessBg: '#1E3D1A',
      statusWarning: '#E5B85C',
      statusWarningBg: '#3D2E10',
      statusError: '#E06A75',
      statusErrorBg: '#3D1A1E',
      statusInfo: '#7AA6FF',
      statusInfoBg: '#1A2A3D',
      tableHeaderBg: '#30344B',
      tableHeaderText: '#D7D9E6',
      tableHeaderBorder: '#4B4F69',
      tableRowBg: '#2E3248',
      tableRowHover: '#3A3E58',
      tableRowSelected: '#474367',
      tableRowBorder: '#3E425B',
      tableCellText: '#F4F5FA',
      tableCellMuted: '#A6A9BE',
      buttonPrimaryBg: '#9588E8',
      buttonPrimaryHover: '#A396F4',
      buttonPrimaryActive: '#8E7BF0',
      buttonPrimaryText: '#F9FAFF',
      buttonSecondaryBg: 'transparent',
      buttonSecondaryHover: '#383C56',
      buttonSecondaryActive: '#4B476D',
      buttonSecondaryText: '#D9DBE7',
      buttonOutlineBorder: '#8E82E8',
      buttonOutlineHoverBg: '#383C56',
      navBackground: '#2C3047',
      navText: '#F4F5FA',
      navTextMuted: '#A6A9BE',
      navItemHover: '#383C56',
      navItemActive: '#4D4A70',
      navBorder: '#4B4F69',
      formLabelText: '#D7D9E6',
      formLabelRequired: '#E06A75',
      inputBg: '#2F334B',
      inputBorder: '#707493',
      inputBorderHover: '#9B9EB2',
      inputBorderFocus: '#B5A9FF',
      inputText: '#F4F5FA',
      inputPlaceholder: '#9B9EB2',
      inputDisabledBg: '#252840',
      inputDisabledText: '#7C8098',
      inputErrorBorder: '#E06A75',
      inputErrorBg: '#3D1A1E',
      linkDefault: '#9C8FEF',
      linkHover: '#AA9CFF',
      linkVisited: '#7B6FD4',
      linkActive: '#8E7BF0'
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
