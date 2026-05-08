import { describe, it, expect } from 'vitest';
import { branding, getBranding } from './branding';

describe('branding map', () => {
  it('has entries for the four supported theme modes', () => {
    expect(branding.dev).toBeDefined();
    expect(branding.default).toBeDefined();
    expect(branding.dark).toBeDefined();
    expect(branding.ep1).toBeDefined();
  });

  it('every entry has the required name / fullName / logo / icon fields', () => {
    for (const [mode, cfg] of Object.entries(branding)) {
      expect(cfg.name, `${mode}.name`).toBeTruthy();
      expect(cfg.fullName, `${mode}.fullName`).toBeTruthy();
      expect(cfg.logo, `${mode}.logo`).toBeTruthy();
      expect(cfg.icon, `${mode}.icon`).toBeTruthy();
    }
  });
});

describe('getBranding', () => {
  it('returns the matching theme entry', () => {
    expect(getBranding('dev')).toBe(branding.dev);
    expect(getBranding('dark')).toBe(branding.dark);
    expect(getBranding('ep1')).toBe(branding.ep1);
    expect(getBranding('default')).toBe(branding.default);
  });

  it('falls back to default for an unknown theme', () => {
    // We force a string into ThemeMode for the unknown case.
    expect(getBranding('made-up' as unknown as Parameters<typeof getBranding>[0])).toBe(
      branding.default
    );
  });
});
