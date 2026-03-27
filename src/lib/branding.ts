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
  dev: {
    name: 'AURA',
    fullName: 'AURA Mobility Core',
    tagline: 'Autonomous Unified Radio Agent',
    logo: '/logo.svg',
    icon: '/favicon.ico'
  },
  default: {
    name: 'AURA',
    fullName: 'AURA Mobility Core',
    tagline: 'Autonomous Unified Radio Agent',
    logo: '/logo.svg',
    icon: '/favicon.ico'
  },
  dark: {
    name: 'AURA',
    fullName: 'AURA Mobility Core',
    tagline: 'Autonomous Unified Radio Agent',
    logo: '/logo.svg',
    icon: '/favicon.ico'
  },
  ep1: {
    name: 'AURA',
    fullName: 'AURA Mobility Core',
    tagline: 'Autonomous Unified Radio Agent',
    // NOTE: No EP1 logo asset exists yet.
    // To add EP1-specific branding, add assets at:
    //   public/branding/ep1/logo.svg
    //   public/branding/ep1/icon.png
    // and update these paths accordingly.
    logo: '/logo.svg',
    icon: '/favicon.ico'
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
    const handleThemeChange = () => {
      // Read from both keys; aura-theme-preference is authoritative
      const preferred = localStorage.getItem('aura-theme-preference');
      const legacy = localStorage.getItem('theme');
      const raw = preferred || legacy || 'default';
      const theme = getStoredTheme();
      // If preferred key holds a recognized ThemeMode use that, else fall back
      const resolvedTheme: ThemeMode =
        raw === 'ep1' ? 'ep1' :
        raw === 'dev' ? 'dev' :
        raw === 'dark' ? 'dark' :
        'default';
      setCurrentBranding(getBranding(resolvedTheme));
    };

    window.addEventListener('storage', handleThemeChange);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme') {
          handleThemeChange();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    return () => {
      window.removeEventListener('storage', handleThemeChange);
      observer.disconnect();
    };
  }, []);

  return currentBranding;
}
