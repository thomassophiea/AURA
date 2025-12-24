/**
 * Branding Configuration
 * Provides theme-specific branding (names, logos, etc.)
 */

import { ThemeMode } from './themes';

export interface BrandConfig {
  name: string;
  fullName: string;
  tagline?: string;
  logo: string;
  icon: string;
}

export const branding: Record<ThemeMode, BrandConfig> = {
  default: {
    name: 'AURA',
    fullName: 'Extreme Platform ONE | AURA',
    tagline: 'Autonomous Unified Radio Agent',
    logo: '/logo.svg',
    icon: '/favicon.ico'
  },
  dark: {
    name: 'AURA',
    fullName: 'Extreme Platform ONE | AURA',
    tagline: 'Autonomous Unified Radio Agent',
    logo: '/logo.svg',
    icon: '/favicon.ico'
  },
  synthwave: {
    name: 'AURA',
    fullName: 'Extreme Platform ONE | AURA',
    tagline: 'Autonomous Unified Radio Agent',
    logo: '/logo.svg',
    icon: '/favicon.ico'
  },
  pirate: {
    name: 'AURA',
    fullName: 'Extreme Platform ONE | AURA',
    tagline: 'Autonomous Unified Radio Agent',
    logo: '/logo.svg',
    icon: '/favicon.ico'
  },
  mi5: {
    name: 'AURA',
    fullName: 'Extreme Platform ONE | AURA',
    tagline: 'Autonomous Unified Radio Agent',
    logo: '/logo.svg',
    icon: '/favicon.ico'
  },
  kroger: {
    name: 'Kroger',
    fullName: 'Kroger Network Management',
    tagline: 'Fresh for Everyone',
    logo: '/branding/kroger/logo.svg',
    icon: '/branding/kroger/icon.png'
  }
};

/**
 * Get branding configuration for current theme
 */
export function getBranding(theme: ThemeMode): BrandConfig {
  return branding[theme] || branding.default;
}

/**
 * Hook to use branding in React components
 */
import { useState, useEffect } from 'react';
import { getStoredTheme } from './themes';

export function useBranding(): BrandConfig {
  const [currentBranding, setCurrentBranding] = useState<BrandConfig>(() => {
    const theme = getStoredTheme();
    return getBranding(theme);
  });

  useEffect(() => {
    // Listen for theme changes
    const handleThemeChange = () => {
      const theme = getStoredTheme();
      setCurrentBranding(getBranding(theme));
    };

    // Listen for storage changes (theme updates from other tabs)
    window.addEventListener('storage', handleThemeChange);

    // Also listen for manual theme changes in same tab
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          handleThemeChange();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      window.removeEventListener('storage', handleThemeChange);
      observer.disconnect();
    };
  }, []);

  return currentBranding;
}
