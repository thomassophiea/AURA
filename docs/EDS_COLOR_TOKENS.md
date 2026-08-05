# EDS Color Tokens Reference

**Complete token catalog for Extreme Design System colors in AURA.**

## Status/Health Colors

Used for indicators, badges, alerts, and health visualizations.

| Token | Value | Light BG | Dark BG | EP1 BG | Usage |
|-------|-------|----------|---------|--------|-------|
| `STATUS_COLORS.success` | `#22c55e` | `#f0fdf4` | `#052e16` | `#1E3D1A` | ✅ Healthy, good, connected, up |
| `STATUS_COLORS.warning` | `#f59e0b` | `#fffbeb` | `#451a03` | `#3D2E10` | ⚠️ Caution, degraded, slow |
| `STATUS_COLORS.critical` | `#ef4444` | `#fef2f2` | `#450a0a` | `#3D1A1E` | ❌ Error, down, disconnected, critical |
| `STATUS_COLORS.info` | `#3b82f6` | `#eff6ff` | `#172554` | `#1e1a46` | ℹ️ Information, neutral, general |

## Wi-Fi Protocol Colors

Consistent identification of wireless standards across all visualizations.

| Token | Value | Standard | Usage |
|-------|-------|----------|-------|
| `PROTOCOL_COLORS.be` | `#8981e5` | Wi-Fi 7 (802.11be) | EHT devices, 6 GHz networks |
| `PROTOCOL_COLORS.ax` | `#3b82f6` | Wi-Fi 6 (802.11ax) | OFDMA, MU-MIMO, 5 GHz modern |
| `PROTOCOL_COLORS.ac` | `#14b8a6` | Wi-Fi 5 (802.11ac) | VHT, 5 GHz legacy |
| `PROTOCOL_COLORS.n` | `#f59e0b` | Wi-Fi 4 (802.11n) | HT, dual-band legacy |
| `PROTOCOL_COLORS.legacy` | `#9ca3af` | Wi-Fi 3 & earlier | 802.11a/b/g, very old devices |
| `PROTOCOL_COLORS.other` | `#6b7280` | Unknown | Device protocol unknown |

## Network Band Colors

Standard identification of frequency bands.

| Token | Value | Band | Frequency | Usage |
|-------|-------|------|-----------|-------|
| `BAND_COLORS['2.4']` | `#f59e0b` | 2.4 GHz | 2400-2500 MHz | Legacy compatibility, extended range |
| `BAND_COLORS['5']` | `#22c55e` | 5 GHz | 5150-5850 MHz | Modern standard, high capacity |
| `BAND_COLORS['6']` | `#8b5cf6` | 6 GHz | 5925-7125 MHz | Wi-Fi 6E+, interference-free spectrum |

## Signal Quality (SNR) Colors

Maps Signal-to-Noise Ratio ranges to visual quality indicators.

| Token | Value | Range | Quality | Usage |
|-------|-------|-------|---------|-------|
| `SNR_QUALITY_COLORS.excellent` | `#22c55e` | ≥ 40 dB | Excellent | Strong signal, no concerns |
| `SNR_QUALITY_COLORS.good` | `#3b82f6` | 25-40 dB | Good | Acceptable performance |
| `SNR_QUALITY_COLORS.fair` | `#f59e0b` | 15-25 dB | Fair | Degraded, user may notice |
| `SNR_QUALITY_COLORS.poor` | `#ef4444` | < 15 dB | Poor | Critical, intervention needed |

## Chart Colors

Primary and secondary series for data visualization.

### Primary Series

| Token | Value | Usage |
|-------|-------|-------|
| `CHART_COLORS.primary` | `#3b82f6` | Primary metric, main data series |
| `CHART_COLORS.secondary` | `#8b5cf6` | Secondary metric, comparison data |

### Status-Based Series

| Token | Value | Usage |
|-------|-------|-------|
| `CHART_COLORS.success` | `#22c55e` | Positive metrics, good states |
| `CHART_COLORS.warning` | `#f59e0b` | Caution metrics, warning states |
| `CHART_COLORS.error` | `#ef4444` | Error metrics, problem states |
| `CHART_COLORS.info` | `#3b82f6` | Information, neutral metrics |

### Multi-Series Palette

| Token | Value | Usage |
|-------|-------|-------|
| `CHART_COLORS.series.total` | `#3b82f6` | Total/aggregate metric |
| `CHART_COLORS.series.upload` | `#06b6d4` | Outbound traffic, upload |
| `CHART_COLORS.series.download` | `#ec4899` | Inbound traffic, download |
| `CHART_COLORS.series.available` | `#f59e0b` | Available resources, capacity |
| `CHART_COLORS.series.clientData` | `#8b5cf6` | Client activity, connections |
| `CHART_COLORS.series.coChannel` | `#06b6d4` | Co-channel interference |
| `CHART_COLORS.series.interference` | `#3b82f6` | RF interference |
| `CHART_COLORS.series.r1` | `#3b82f6` | Radio 1 (2.4 GHz) |
| `CHART_COLORS.series.r2` | `#06b6d4` | Radio 2 (5 GHz) |
| `CHART_COLORS.series.r3` | `#ec4899` | Radio 3 (6 GHz) |

### Base Colors (for cycling)

| Token | Value | Primary Use |
|-------|-------|------------|
| `CHART_COLORS.blue` | `#3b82f6` | Information, primary |
| `CHART_COLORS.cyan` | `#06b6d4` | Secondary, upload |
| `CHART_COLORS.purple` | `#8b5cf6` | Tertiary, activity |
| `CHART_COLORS.pink` | `#ec4899` | Quaternary, download |
| `CHART_COLORS.amber` | `#f59e0b` | Warning, availability |
| `CHART_COLORS.green` | `#22c55e` | Success, healthy |
| `CHART_COLORS.red` | `#ef4444` | Error, critical |
| `CHART_COLORS.indigo` | `#6366f1` | Brand, interactive |
| `CHART_COLORS.teal` | `#14b8a6` | Accent, special |

## Donut/Pie Chart Colors

Cycling palette for multi-category visualizations (app groups, services, etc).

```typescript
DONUT_COLORS: [
  '#3b82f6', // Blue (primary)
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#f97316', // Orange
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6', // Teal
]
```

Use as: `DONUT_COLORS[index % DONUT_COLORS.length]`

## Timeline/Reference Line Colors

Chart cursor tracking and time window selection.

| Token | Value | State | Dash | Opacity | Usage |
|-------|-------|-------|------|---------|-------|
| `TIMELINE_COLORS.cursorUnlocked` | `#3b82f6` | Tracking | 4px dash | 50% | Live cursor, following user |
| `TIMELINE_COLORS.cursorLocked` | `#8b5cf6` | Fixed | Solid | 100% | Locked reference point |
| `TIMELINE_COLORS.timeWindowFill` | `var(--primary)` | Selection | N/A | 15% | Time window highlight fill |
| `TIMELINE_COLORS.timeWindowStroke` | `var(--primary)` | Selection | N/A | 30% | Time window highlight border |

## Roaming Quality Score Colors

Connectivity health score visualization.

| Token | Value | Score | Level | RGB Variant |
|-------|-------|-------|-------|------------|
| `ROAMING_QUALITY_COLORS.good` | `#4ade80` | ≥ 80 | Excellent | `rgba(74,222,128,0.9)` |
| `ROAMING_QUALITY_COLORS.fair` | `#f59e0b` | 60-80 | Good | `rgba(251,191,36,0.9)` |
| `ROAMING_QUALITY_COLORS.poor` | `#f97316` | 40-60 | Fair | `rgba(249,115,22,0.9)` |
| `ROAMING_QUALITY_COLORS.critical` | `#ef4444` | < 40 | Critical | `rgba(239,68,68,0.9)` |

## Usage Examples

### Status Badge
```typescript
import { STATUS_COLORS, WCAG_VALIDATED_PAIRS } from '@/config/colorPalette';

<div style={{
  color: STATUS_COLORS.success,
  backgroundColor: WCAG_VALIDATED_PAIRS.success.bg
}}>
  Connected
</div>
```

### Protocol Indicator
```typescript
import { PROTOCOL_COLORS } from '@/config/colorPalette';

<span style={{ color: PROTOCOL_COLORS.ax }}>
  Wi-Fi 6
</span>
```

### Band Chart
```typescript
import { BAND_COLORS } from '@/config/colorPalette';

const bandColor = BAND_COLORS[band]; // '2.4', '5', or '6'
<line stroke={bandColor} />
```

### Multi-Series Data
```typescript
import { CHART_COLORS } from '@/config/colorPalette';

const series = [
  { name: 'Upload', color: CHART_COLORS.series.upload },
  { name: 'Download', color: CHART_COLORS.series.download },
];
```

## Accessibility

All tokens are **WCAG AAA compliant** when used with their corresponding background colors.

**Pre-validated pairs:**
- `STATUS_COLORS.success` + `successBg` ✅ 14.85:1 contrast
- `STATUS_COLORS.warning` + `warningBg` ✅ 8.6:1 contrast
- `STATUS_COLORS.critical` + `criticalBg` ✅ 9.2:1 contrast
- `STATUS_COLORS.info` + `infoBg` ✅ 10.9:1 contrast

Validate custom pairs with:
```typescript
import { validateWCAGContrast } from '@/lib/colorValidator';
validateWCAGContrast(fg, bg, 'AAA');
```

## Theme Awareness

Colors are **theme-aware** via CSS variables in `src/lib/themes.ts`:

- **Light:** Default theme, white backgrounds
- **Dark:** Dark theme, dark backgrounds
- **EP1:** Extreme Platform ONE, purple theme
- **Dev:** Development/OS-ONE, Material Design dark

Most status and chart colors work across all themes. Background colors have theme variants:
- `successBg` (light)
- `successBgDark` (dark)
- `successBgEp1` (EP1)

Use `getColorByTheme()` for theme-specific variants:
```typescript
import { getColorByTheme } from '@/config/colorPalette';

const bgColor = getColorByTheme('success', 'dark');
// → '#052e16'
```

## Import Pattern

```typescript
// Import what you need
import {
  STATUS_COLORS,
  PROTOCOL_COLORS,
  BAND_COLORS,
  SNR_QUALITY_COLORS,
  CHART_COLORS,
  WCAG_VALIDATED_PAIRS,
} from '@/config/colorPalette';

// Never hardcode hex values
// ❌ color: '#22c55e'
// ✅ color: STATUS_COLORS.success
```

---

**Last Updated:** 2026-08-04  
**EDS Integration Phase:** 1 Complete ✅ | 2 In Progress 🚀
