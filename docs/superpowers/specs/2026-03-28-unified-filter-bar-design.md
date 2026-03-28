# UnifiedFilterBar Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Goal

Replace three inconsistent filtering patterns (FilterBar.tsx, ContextualInsightsSelector.tsx, ad-hoc local filters) with a single `UnifiedFilterBar` component used across the entire AURA app. The bar combines global dropdowns, a context-aware search input, a rich context selector with tabs, and a slot for page-specific filters.

## Decisions

| Decision | Choice |
|----------|--------|
| Approach | New component merging FilterBar + ContextualInsightsSelector |
| Search input | Always visible, context-aware placeholder per page |
| Page-specific filters | Inline same row after a divider |
| Context tabs | Full tabs (AI/Site/AP/Switch/Client) via popover, defaulting to page context |

## Layout

Single horizontal row, left-to-right:

```
[Search input] [Context selector ▾] [Environment ▾] [Time range ▾] │ [Page filter 1 ▾] [Page filter 2 ▾] [3 active ✕]
```

- **Search input**: Always visible. Flex-grows to fill available space (min 220px, max 320px). Context-aware placeholder text provided by each page.
- **Context selector**: Replaces the simple Site dropdown. Button shows the current mode icon + label (e.g., "AP" with radio icon). Clicking opens a popover with:
  - Tab row: AI Insights | Site | AP | Switch (Beta) | Client
  - Search input within the popover (searches items in the active tab)
  - Scrollable list with status indicators, item details, and selection checkmark
  - Default tab set by the page via `defaultContextTab` prop
- **Environment dropdown**: Globe icon + "All Environments" / Production / Lab / Staging
- **Time range dropdown**: Clock icon + "Last 15 minutes" through "Last 30 days" + Custom
- **Divider**: Thin vertical line (1px, #333) — only renders when `extraFilters` are provided
- **Page-specific filters**: Rendered via `extraFilters` prop. Styled with a subtle purple-tinted border to distinguish from global filters. Each page owns these filter states.
- **Active filter badge**: Shows count of non-default filters. "✕" resets all (global + triggers `onReset` callback for page filters).

On narrow viewports, the row wraps naturally via `flex-wrap`.

## Component API

```tsx
interface UnifiedFilterBarProps {
  // Search — always visible
  searchPlaceholder?: string;       // e.g. "Search APs by name, serial, model..."
  searchValue: string;
  onSearchChange: (value: string) => void;

  // Context selector
  defaultContextTab?: SelectorTab;  // 'ai-insights' | 'site' | 'access-point' | 'switch' | 'client'

  // Global filter visibility (all default true)
  showEnvironment?: boolean;
  showTimeRange?: boolean;

  // Page-specific filters — rendered inline after divider
  extraFilters?: React.ReactNode;

  // Reset callback for page-specific filters
  onResetPageFilters?: () => void;

  // Active page filter count (for badge)
  activePageFilterCount?: number;

  // Styling
  className?: string;
}
```

**File location:** `src/components/UnifiedFilterBar.tsx`

## State Management

### Global state (managed internally by UnifiedFilterBar)

Uses existing hooks — no new state infrastructure:

- **`useGlobalFilters`** — site, environment, timeRange, dateFrom, dateTo. Persisted to localStorage, debounced notifications, cross-component sync.
- **`useOperationalContext`** — mode, siteId, apId, clientId, timeCursor, cursorLocked, environmentProfile. Persisted to localStorage. Automatic child-selection cleanup on mode change.

### Local state (owned by each page)

- `searchTerm` — the text search value. Each page creates this via `useState` and passes it to UnifiedFilterBar. Filtering logic stays in the page component.
- Page-specific filter values (band, security, status, model, etc.) — owned by the page, rendered via `extraFilters` slot.

### Active filter count

UnifiedFilterBar computes global active filter count internally (non-default site + environment + timeRange). Pages pass `activePageFilterCount` for their extra filters. Badge shows the sum.

## Context Selector Popover

Absorbs the current `ContextualInsightsSelector` functionality:

- **Tabs**: AI Insights, Site, AP, Switch (Beta), Client
- **Default tab**: Set by page via `defaultContextTab`. AP page defaults to "access-point", Client page to "client", Dashboard to "site", Insights to "ai-insights".
- **Search within popover**: Each tab (except AI Insights) has a search input that filters the scrollable list.
- **Item display per tab**:
  - **Site**: Name, subtitle (site group), site count
  - **AP**: Name, status dot, model, IP, site, client count, uptime
  - **Switch**: Name, status dot, model, IP, port count
  - **Client**: Hostname, status dot, SSID, RSSI, AP name, IP
  - **AI Insights**: Static list (All Insights, Network Health, Anomaly Detection, Capacity Planning, Predictive Maintenance)
- **Selection**: Updates `useOperationalContext` — `selectSite()`, `selectAP()`, `selectClient()`, `setMode()`. Automatic child clearing on mode change.
- **"All" option**: Each tab has an "All Sites" / "All APs" / etc. option at the top with item count.

## Per-Page Integration

| Page | File | defaultContextTab | searchPlaceholder | extraFilters |
|------|------|-------------------|-------------------|--------------|
| Dashboard Enhanced | DashboardEnhanced.tsx | `site` | "Search widgets, metrics..." | — |
| Access Points | AccessPoints.tsx | `access-point` | "Search APs by name, serial, model, IP..." | Status, Model |
| Connected Clients | ConnectedClients.tsx | `client` | "Search by hostname, MAC, IP, AP, site..." | — |
| Network Insights Enhanced | NetworkInsightsEnhanced.tsx | `ai-insights` | "Search insights, anomalies..." | — |
| Network Insights | NetworkInsights.tsx | `ai-insights` | "Search insights..." | — |
| Network Insights Simplified | NetworkInsightsSimplified.tsx | `site` | "Search insights..." | — |
| SLE Dashboard | sle/SLEDashboard.tsx | `site` | "Search SLE metrics..." | — |
| Service Levels Enhanced | ServiceLevelsEnhanced.tsx | `site` | "Search service levels..." | — |
| Alerts & Events Enhanced | AlertsEventsEnhanced.tsx | `site` | "Search alerts, events..." | Severity, Category, Status |
| Configure Networks | ConfigureNetworks.tsx | `site` | "Search networks..." | Band, Security, Status |
| AP Upgrade Report | APsUpgradeReport.tsx | `access-point` | "Search APs, firmware..." | Upgrade Status |
| AFC Radio Height | AFCRadioHeightCalculator.tsx | `access-point` | "Search AP, building, floor..." | — |
| Anomaly Detector | AnomalyDetector.tsx | `site` | "Search anomalies..." | — |

## Deprecation Plan

### Delete

| File | Reason |
|------|--------|
| `src/components/FilterBar.tsx` | Fully replaced by UnifiedFilterBar |
| `src/components/ContextualInsightsSelector.tsx` | Context tabs absorbed into UnifiedFilterBar |

### Remove from pages

| File | What to remove |
|------|---------------|
| `src/components/AccessPoints.tsx` | Local `searchTerm`/`selectedSite`/`sites` state + inline search/site UI in CardHeader (lines ~2081-2113). Replace with UnifiedFilterBar. |
| `src/components/ConnectedClients.tsx` | Local `searchTerm`/`siteFilter`/`sites` state + inline search/site UI (lines ~817-845). Replace with UnifiedFilterBar. |
| `src/components/ConfigureNetworks.tsx` | Inline search + band/security/status dropdowns (lines ~988-1049). Replace with UnifiedFilterBar + extraFilters. |
| `src/components/APsUpgradeReport.tsx` | Inline status/site dropdowns (lines ~306-336). Replace with UnifiedFilterBar + extraFilters. |
| `src/components/AFCRadioHeightCalculator.tsx` | Inline search + site dropdown. Replace with UnifiedFilterBar. |

### Keep (used internally by UnifiedFilterBar)

| File | Reason |
|------|--------|
| `src/hooks/useGlobalFilters.ts` | Global filter state — used by UnifiedFilterBar internally |
| `src/hooks/useOperationalContext.ts` | Operational context state — used by context selector |
| `src/config/environmentProfiles.ts` | Profile configurations — used by environment selector |
| `src/components/ContextConfigModal.tsx` | Context configuration modal — still needed for "Customize" action |
| `src/components/EnvironmentProfileSelector.tsx` | May be integrated later but not deprecated in this phase |

## Testing Strategy

- Unit test UnifiedFilterBar in isolation: renders search, context selector, environment, time range, extra filters, active badge
- Test context selector popover: tab switching, search filtering, item selection, operational context updates
- Test global filter sync: changing site in UnifiedFilterBar updates all pages using `useGlobalFilters`
- Integration test: verify each page renders UnifiedFilterBar with correct props and filtering still works
- Visual regression: ensure no layout breakage on pages that previously had inline filters

## Migration Order

1. Build `UnifiedFilterBar` component
2. Integrate on Dashboard Enhanced (simplest — no extra filters, no local search to remove)
3. Integrate on Access Points (replace local search + site dropdown)
4. Integrate on Connected Clients (replace local search + site dropdown)
5. Integrate on remaining pages (Network Insights variants, SLE, Alerts, Config pages)
6. Delete deprecated FilterBar.tsx and ContextualInsightsSelector.tsx
7. Clean up unused imports across all migrated files
