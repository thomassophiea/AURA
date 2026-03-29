# AURA Theme Audit

Generated: 2026-03-28 | Plan 4 — Task 4

---

## Summary

The app uses a four-theme system (light, ep1, dev, synthwave) managed via `src/lib/themes.ts` and CSS variables in `src/index.css`. Tailwind is configured with shadcn/ui semantic tokens (`bg-background`, `text-foreground`, `bg-card`, etc.).

**Overall assessment: GOOD.** The codebase consistently uses Tailwind semantic tokens. A few light-mode-only patterns were found and fixed.

---

## Hardcoded Colors

### In className Attributes (Tailwind)

| File | Pattern | Issue | Fixed |
|------|---------|-------|-------|
| `RFManagementTools.tsx:259` | `bg-green-100 text-green-800` / `bg-gray-100 text-gray-800` | Light-mode-only — breaks dark mode | YES → `bg-green-500/15 text-green-600 dark:text-green-400` / `bg-muted text-muted-foreground` |
| `ConfigureAdvanced.tsx:965` | Same pattern for status badge | Light-mode-only | YES → same fix as above |
| `figma/ImageWithFallback.tsx:17` | `bg-gray-100` on error fallback container | Light-mode-only | YES → `bg-muted` |

### In SVG / Chart Properties (Not Tailwind)

| File | Pattern | Issue |
|------|---------|-------|
| `ClientInsights.tsx:162-175` | Hex color palette for Recharts `stroke` and `fill` | Acceptable — SVG attributes must use hex/named colors; these are chart series colors not background colors |
| `RFQualityWidgetAnchored.tsx:343` | `stopColor` for SVG gradient | Acceptable — SVG `<stop>` elements require inline style hex |
| Multiple components | `bg-gradient-to-br from-violet-500` etc. | Status-semantic gradient patterns — consistent across the app, intentional design |

### `bg-white` Instances

| File | Line | Context | Action |
|------|------|---------|--------|
| `WifiQRCodeDialog.tsx:158` | QR code container | INTENTIONAL — QR codes require white background to be scannable by all readers | No change |
| `mobile/MobileNetworksList.tsx:285` | Mobile QR code container | Same reason | No change |

---

## Dark Mode Gaps

### Fixed

- 3 Badge components using `bg-green-100/bg-gray-100` (light shades) now use `bg-muted` / `bg-green-500/15` which work in both themes

### Verified Acceptable

- `white/X` (opacity variants like `bg-white/10`, `text-white/80`) — these are used on dark gradient card overlays and are intentional, providing contrast against dark backgrounds
- `SLE` components use `bg-white/15`, `text-white/80` on dark gradient cards — correct usage

### Remaining Concerns (Not Fixed — Low Impact)

| Pattern | Count | Files | Notes |
|---------|-------|-------|-------|
| `bg-gray-500/15`, `bg-gray-500` | 4 | ConnectedClients, DashboardEnhanced, AccessControlRules, LogsViewer | Used as neutral status indicators. The `/15` opacity variants work in dark mode. Solid `bg-gray-500` is on indicator dots — acceptable (gray is intentionally neutral in all themes) |

---

## Gradient Consistency

161 gradient class uses found across components. Patterns analyzed:

| Pattern | Usage | Consistency |
|---------|-------|-------------|
| `bg-gradient-to-br from-{color}-500 to-{color}-600` | Icon badges on metric cards | Consistent — violet, emerald, blue, amber per semantic meaning |
| `bg-gradient-to-br from-card to-card/50` | Card backgrounds | Consistent across pages |
| `bg-gradient-to-r from-{color}-600 bg-clip-text text-transparent` | Metric value text | Consistent |
| `from-violet-500 to-purple-500` | AP-related metrics | Consistent |
| `from-emerald-500 to-green-500` | Health/uptime metrics | Consistent |
| `from-blue-500 to-cyan-500` | Radio/connectivity metrics | Consistent |
| `from-amber-500 to-orange-500` | Warning/mode metrics | Consistent |

**Assessment:** Gradient usage is semantically consistent. Same gradient means same category across pages. No inconsistencies found requiring fixes.

---

## CSS Custom Properties

`src/index.css` defines all theme variables as CSS custom properties (`--background`, `--foreground`, `--card`, `--primary`, etc.) with separate blocks for each theme. All shadcn/ui components use these via `hsl(var(--token))` — no hardcoded HSL values in component files.

---

## Fixes Applied

| File | Change |
|------|--------|
| `RFManagementTools.tsx` | Badge: `bg-green-100 text-green-800` → `bg-green-500/15 text-green-600 dark:text-green-400`; `bg-gray-100 text-gray-800` → `bg-muted text-muted-foreground` |
| `ConfigureAdvanced.tsx` | Same fix for status badge |
| `figma/ImageWithFallback.tsx` | `bg-gray-100` → `bg-muted` |
