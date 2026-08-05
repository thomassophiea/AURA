# EDS Color Validator — Phase 2

**Status:** Phase 1 Complete ✅ | Phase 2 In Progress 🚀

## Overview

Phase 2 of EDS integration adds **validation & accessibility** tools to ensure all colors in AURA comply with Extreme Design System tokens and meet WCAG AAA accessibility standards.

## Tools Available

### 1. Color Compliance Checker

```typescript
import { getColorCompliance, isEDSCompliant } from '@/lib/colorValidator';

// Check if a color is EDS-compliant
getColorCompliance('#22c55e') // → 'STATUS_COLORS.success'
getColorCompliance('#ffffff') // → null (not EDS token)

// Boolean check
isEDSCompliant('#22c55e') // → true
isEDSCompliant('#ffffff') // → false
```

### 2. WCAG Contrast Validator

```typescript
import { validateWCAGContrast, getContrastRatio } from '@/lib/colorValidator';

// Validate contrast ratio
const result = validateWCAGContrast(
  STATUS_COLORS.success,      // foreground
  STATUS_COLORS.successBg,    // background
  'AAA'                        // WCAG level
);

// result: { pass: true, ratio: 14.85, required: 7, level: 'AAA' }

// Get raw contrast ratio
getContrastRatio('#ef4444', '#fef2f2') // → 9.2
```

### 3. Pre-Validated Color Pairs

```typescript
import { WCAG_VALIDATED_PAIRS } from '@/lib/colorValidator';

// Use pre-validated pairs (guaranteed WCAG AAA compliant)
const successColors = WCAG_VALIDATED_PAIRS.success;
// { fg: '#22c55e', bg: '#f0fdf4', darkBg: '#052e16' }
```

## EDS Color Tokens

All colors must use these tokens:

### Status Colors
- `STATUS_COLORS.success` — Healthy/good states (#22c55e)
- `STATUS_COLORS.warning` — Caution/warning states (#f59e0b)
- `STATUS_COLORS.critical` — Error/critical states (#ef4444)
- `STATUS_COLORS.info` — Information states (#3b82f6)

### Wi-Fi Protocol
- `PROTOCOL_COLORS.be` — Wi-Fi 7 (#8981e5)
- `PROTOCOL_COLORS.ax` — Wi-Fi 6 (#3b82f6)
- `PROTOCOL_COLORS.ac` — Wi-Fi 5 (#14b8a6)
- `PROTOCOL_COLORS.n` — Wi-Fi 4 (#f59e0b)
- `PROTOCOL_COLORS.legacy` — Legacy (#9ca3af)

### Network Bands
- `BAND_COLORS['2.4']` — 2.4 GHz (#f59e0b)
- `BAND_COLORS['5']` — 5 GHz (#22c55e)
- `BAND_COLORS['6']` — 6 GHz (#8b5cf6)

### Chart Colors
- `CHART_COLORS.success` — Green (#22c55e)
- `CHART_COLORS.warning` — Amber (#f59e0b)
- `CHART_COLORS.error` — Red (#ef4444)
- `CHART_COLORS.info` — Blue (#3b82f6)
- Plus 10+ series colors for multi-series visualizations

See [`src/config/colorPalette.ts`](../src/config/colorPalette.ts) for complete token list.

## Compliance Checklist

### For New Components

- ✅ All colors must come from `colorPalette.ts`
- ✅ No hardcoded hex values allowed (`#ffffff`, `#000000`, etc.)
- ✅ Use semantic tokens: `STATUS_COLORS.success` instead of `#22c55e`
- ✅ Validate contrast with `validateWCAGContrast()` if custom pairing
- ✅ Test in all 4 themes: Light, Dark, EP1, Dev

### For Existing Components

- ✅ Replace hardcoded colors with token imports
- ✅ Use `getColorCompliance()` to find matching tokens
- ✅ Test contrast validation with `validateWCAGContrast()`
- ✅ Update Tailwind colors to use CSS variables when needed

## WCAG AAA Standard

All AURA colors must pass **WCAG AAA** (7:1 contrast ratio for normal text).

**Pre-validated pairs** (guaranteed compliant):
```typescript
// All of these are WCAG AAA compliant
WCAG_VALIDATED_PAIRS.success    // #22c55e on #f0fdf4
WCAG_VALIDATED_PAIRS.warning    // #f59e0b on #fffbeb
WCAG_VALIDATED_PAIRS.critical   // #ef4444 on #fef2f2
WCAG_VALIDATED_PAIRS.info       // #3b82f6 on #eff6ff
```

### Testing Your Colors

```typescript
import { validateWCAGContrast } from '@/lib/colorValidator';

// Test a custom color pair
const result = validateWCAGContrast('#yourFg', '#yourBg', 'AAA');
if (!result.pass) {
  console.warn(`⚠️ Contrast ratio ${result.ratio}:1 fails AAA (need ${result.required}:1)`);
}
```

## Common Violations

❌ **Hardcoded hex values:**
```typescript
// DON'T DO THIS
<div style={{ color: '#ef4444' }}>Error</div>
```

✅ **Use token imports:**
```typescript
// DO THIS
import { STATUS_COLORS } from '@/config/colorPalette';
<div style={{ color: STATUS_COLORS.critical }}>Error</div>
```

❌ **Arbitrary color mixing:**
```typescript
// DON'T DO THIS
validateWCAGContrast('#abc123', '#def456') // Custom pairs may fail
```

✅ **Use pre-validated pairs:**
```typescript
// DO THIS
const { fg, bg } = WCAG_VALIDATED_PAIRS.warning;
```

## Migration Guide

### Step 1: Find Non-Compliant Colors
```bash
grep -r "#[0-9A-F]" src --include="*.tsx" | grep -v colorPalette
```

### Step 2: Match to EDS Token
```typescript
import { getColorCompliance } from '@/lib/colorValidator';
const token = getColorCompliance('#22c55e');
// → 'STATUS_COLORS.success'
```

### Step 3: Replace in Code
```typescript
// Before
<div style={{ backgroundColor: '#22c55e' }}>Good</div>

// After
import { STATUS_COLORS } from '@/config/colorPalette';
<div style={{ backgroundColor: STATUS_COLORS.success }}>Good</div>
```

## Accessibility Testing

### In Tests
```typescript
import { validateWCAGContrast } from '@/lib/colorValidator';

it('should meet WCAG AAA contrast', () => {
  const result = validateWCAGContrast(
    STATUS_COLORS.critical,
    STATUS_COLORS.criticalBg,
    'AAA'
  );
  expect(result.pass).toBe(true);
});
```

### In Components
```typescript
// Add data attribute for contrast testing
<div 
  data-testid="critical-alert"
  style={{ 
    color: STATUS_COLORS.critical,
    backgroundColor: STATUS_COLORS.criticalBg 
  }}
>
  Error
</div>
```

## Next Steps (Phase 3-4)

- 🎨 **Phase 3:** Automation tools for theme switching & CSS variable generation
- 🤖 **Phase 4:** Intelligence — ML-based color suggestions, design trend analysis

## References

- [EDS Color Tokens Reference](./EDS_COLOR_TOKENS.md)
- [Color Palette Config](../src/config/colorPalette.ts)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Contrast Ratio Checker](https://webaim.org/resources/contrastchecker/)

## Questions?

- Check the [colorValidator](../src/lib/colorValidator.ts) source for all utilities
- Review [color usage examples](../src/components/APInsights.tsx) in existing components
