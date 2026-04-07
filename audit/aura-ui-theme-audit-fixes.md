# AURA UI Theme Audit - Fixes Applied

**Date:** 2026-04-06
**Branch:** claude/strange-hofstadter
**Scope:** Production-grade UI audit across all ~250 components targeting cross-theme visual correctness

---

## Summary

A systematic audit was conducted to find and fix visual issues affecting all 4 themes (default/light, dark, ep1/purple, dev/Material). The main categories of issues were:

1. **Hardcoded dark-only background colors** — `bg-slate-900`, `bg-slate-800`, `from-slate-9`, `bg-white/5` used on standard card backgrounds (only visible in dark mode)
2. **Hardcoded primary action button colors** — `bg-violet-600 hover:bg-violet-700 text-white` across many components (bypasses theme primary color)
3. **Low-contrast idle state badge colors** — `text-gray-400` in light mode is too faint
4. **Missing table border wrappers** — bare `<Table>` without `rounded-md border` container in non-Card contexts
5. **Hover colors on card backgrounds** — `hover:bg-white/5` on dialog/card backgrounds (invisible in light mode)
6. **Warning badge contrast** — `bg-[color:var(--status-warning)] text-white` where warning is yellow in light mode

---

## Files Modified (this session)

### Color/Theme Fixes

| File | Issue | Fix |
|------|-------|-----|
| `src/components/ConnectedClients.tsx` | `getStatusBadgeClass()` returned `text-gray-400` for idle/unknown | Changed to `text-muted-foreground` + `bg-muted border-border` |
| `src/components/AccessPoints.tsx` | "Live Sync" badge used `bg-slate-900` (hardcoded dark) | Changed to `bg-[color:var(--status-success-bg)]` |
| `src/components/DashboardEnhanced.tsx` | 16+ hardcoded dark colors in AI analysis panel and stat cards | Replaced with `bg-muted`, `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary/10`, `text-primary` |
| `src/components/DashboardEnhanced.tsx` | SNR Quality panel `bg-slate-900/60 border-slate-700/50` | Changed to `bg-muted/50 border border-border` |
| `src/components/DashboardEnhanced.tsx` | CPU card `from-purple-500/10 border-purple-500/20` + `text-purple-400` | Changed to `bg-muted/50 border-border` + `text-primary` |
| `src/components/DashboardEnhanced.tsx` | CPU Progress bar `bg-purple-950/50` | Changed to default (removed override) |
| `src/components/RoamingTrail.tsx` | Roam badge `bg-purple-500 text-white` / `bg-blue-500 text-white` (light mode contrast) | Changed to `bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30` |
| `src/components/sle/SLERootCausePanel.tsx` | `hover:bg-white/5` on Dialog table rows (invisible in light mode) | Changed to `hover:bg-muted/50` |
| `src/components/AFCRadioHeightCalculator.tsx` | Warning badge `bg-[color:var(--status-warning)] text-white` (yellow bg, white text = fail) | Changed to `bg-warning/15 text-warning border-warning/30` |

### Button Standardization (hardcoded `bg-violet-600 hover:bg-violet-700 text-white`)

All replaced with `bg-primary hover:bg-primary/90 text-primary-foreground`:

- `src/components/ConfigurePolicy.tsx` (3 buttons: Create Template, Create Role, Save topology)
- `src/components/EventNotificationsConfig.tsx` (2 buttons: Save webhook, Save email)
- `src/components/CreateNetworkDialog.tsx` (1 button: Create Network)
- `src/components/AccessControlAAA.tsx` (1 button: Create Profile)
- `src/components/AccessControlRules.tsx` (1 button: Create Rule)
- `src/components/RFManagementTools.tsx` (1 button: Create Profile)
- `src/components/AFCPlanningTool.tsx` (2 buttons: Create AFC Plan, Apply Plan)
- `src/components/timeline/TimelineControls.tsx` (1 button: Locked state)
- `src/components/TimelineCursorControls.tsx` (`bg-purple-600 hover:bg-purple-700` → `bg-primary hover:bg-primary/90`)

### Table Border Wrappers (added `<div className="rounded-md border">` wrapper)

- `src/components/ConfigureAdvanced.tsx` — CoS profiles table (no wrapper)
- `src/components/ConfigureAdvanced.tsx` — Rate limiters table (no wrapper)
- `src/components/ConfigureAdvanced.tsx` — AP profiles table (no wrapper)
- `src/components/ConfigureAdvanced.tsx` — IoT profiles table (no wrapper)
- `src/components/ConfigureAdvanced.tsx` — Meshpoints table (no wrapper)
- `src/components/ConfigureAdvanced.tsx` — MAC filter list table (conditional, no wrapper)
- `src/components/ConfigureAdvanced.tsx` — Location services table (no wrapper)

---

## Verified as Intentional (No Changes)

- **SLE components** (`SLEBlock`, `SLETimeline`, `SLEClassifierTree`, `SLERadialMap`, `SLEWaterfall`, `SLEScoreGauge`) — All use `bg-white/`, `text-white/` on colored gradient backgrounds via `STATUS_GRADIENTS` inline styles. Component comments confirm this design.
- **`badge-gradient-*` icon containers** (across `AccessPointDetail`, `DashboardEnhanced`, `ConnectedClients`, etc.) — `text-white` inside colored gradient divs is correct.
- **AFCRadioHeightCalculator gradient banner** — `bg-gradient-to-r from-violet-600 to-indigo-600` header with `text-white` is intentional.
- **SynthwaveMusicPlayer** — Dark themed overlay, `text-white` is intentional.
- **ContextConfigModal "Recommended" badge** — `bg-gradient-to-r from-purple-500 to-blue-500 text-white` is intentional.
- **PWAInstallPrompt CTA button** — `bg-gradient-to-r from-indigo-500 to-purple-600 text-white` is intentional.
- **DashboardEnhanced severity badges** — `bg-red-600/bg-amber-500/bg-teal-600 text-white` for event severity (sufficient contrast on saturated colors).

---

## Theme Compatibility Patterns Applied

| Pattern | Before (broken in light) | After (theme-aware) |
|---------|--------------------------|---------------------|
| Panel backgrounds | `bg-slate-900/60` | `bg-muted/50` |
| Panel borders | `border-slate-700/50` | `border-border` |
| Progress bar tracks | `bg-slate-800`, `bg-purple-950/50` | `bg-muted` (default) |
| Icon containers | `bg-purple-500/20 text-purple-400` | `bg-primary/10 text-primary` |
| Muted text | `text-purple-300/50`, `text-purple-300/70` | `text-muted-foreground` |
| Gradient text | `text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-cyan-300` | `text-foreground` |
| Hover rows | `hover:bg-white/5` | `hover:bg-muted/50` |
| Primary buttons | `bg-violet-600 hover:bg-violet-700 text-white` | `bg-primary hover:bg-primary/90 text-primary-foreground` |
| Status badges (idle) | `text-gray-400` | `text-muted-foreground` |
| Status badge bg | `bg-slate-900 text-[success-color]` | `bg-[status-success-bg] text-[status-success]` |

---

## Remaining Known Gaps

- `DashboardEnhanced.tsx` still has `dark:bg-gradient-to-br dark:from-slate-900 dark:via-purple-950/50 dark:to-slate-900` on the AI panel outer container (this is now conditionally dark-only, so light mode shows `bg-card` instead — acceptable)
- Tables inside `<CardContent>` without a `rounded-md border` wrapper (e.g., `AccessControlGroups`, `AccessControlRules`, `AdministratorsManagement`) — when inside a Card, the Card itself provides the visual container; these are acceptable
- Inline `style={{ background: STATUS_GRADIENTS[sle.status] }}` on SLE blocks is intentional architectural decision for the SLE visualization system
