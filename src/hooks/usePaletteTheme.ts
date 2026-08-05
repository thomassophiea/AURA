import { useEffect, useState } from 'react';
import type { PaletteTheme } from '../config/colorPalette';

/**
 * The active theme, for picking contrast-correct palette values.
 *
 * EP1 brand colors are tuned for dark surfaces and fail contrast on white, so any
 * component painting a chart or status mark needs to know which surface it is on.
 * Pair this with `resolveStatusColor` / `resolveCategoricalColor` from
 * `config/colorPalette` rather than reading the token arrays directly.
 *
 * Reads `data-theme` off `<html>`, which `App.applyTheme` owns, and re-renders when it
 * changes. Going through the DOM rather than a context keeps this usable from any leaf
 * component without prop drilling or a provider.
 */

const THEME_ATTRIBUTE = 'data-theme';

function readTheme(): PaletteTheme {
  // Guard for non-DOM environments (tests, any future SSR).
  if (typeof document === 'undefined') return 'light';

  const value = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  switch (value) {
    case 'ep1':
    case 'dev':
    case 'dark':
      return value;
    default:
      // 'light', 'default', missing, or anything unrecognised — treat as a light surface.
      // Defaulting the other way would ship low-contrast marks onto white.
      return 'light';
  }
}

export function usePaletteTheme(): PaletteTheme {
  const [theme, setTheme] = useState<PaletteTheme>(readTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // The attribute may have changed between the initial render and this effect.
    setTheme(readTheme());

    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [THEME_ATTRIBUTE],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}
