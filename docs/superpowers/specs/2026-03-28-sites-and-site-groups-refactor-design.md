# Sites and Site Groups Refactor Design

**Date:** 2026-03-28
**Status:** Approved
**Approach:** Clean-room build (Approach B)

## Summary

Refactor the Sites and Site Groups experience so it matches the design language and interaction model of Connected Clients and Access Points. Replace the combined `ConfigureSites.tsx` page with two standalone pages (`SiteGroupsPage.tsx` and `SitesPage.tsx`), consolidate conflicting type definitions, remove the manual color-coded grouping concept, and scaffold the Site Variables data model.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Manual color-coded SiteGroup concept | Remove entirely | Site Groups are strictly controller pairs. Eliminates type collision. |
| Page structure | Two separate pages | Consistent with Connected Clients / AP pattern. Each entity gets full real estate. |
| Nav ordering | Site Groups first, then Sites | Mirrors the hierarchy: Organization → Site Groups → Sites. |
| Drill-down behavior | Row click → detail slide-out; site count click → filtered Sites page | Matches existing row-click pattern while providing direct navigation shortcut. |
| Site Variables scope | Data model + placeholder UI | Locks in types, reserves UI slot in Site detail. No API backing yet. |
| Site detail slide-out | Lean: Overview, Stats, Variables placeholder | Quick glance — no tabs, no secondary nav. |
| Metric cards | Both pages | Consistent with every other AURA page. At-a-glance status. |
| Architecture approach | Clean-room build | Existing ConfigureSites has too many baked-in assumptions for incremental refactor. |

## Design Constraints

- No secondary/nested left navigation panels inside page content areas. The sidebar is the single source of navigation.
- No custom search UX deviations. Both pages use `useCompoundSearch` and `SearchFilterBar`.
- No manual site grouping concept (color-coded groups, `siteIds[]` arrays).

---

## 1. Type Consolidation & Data Model

### Problem

Three competing `Site`/`SiteGroup` definitions exist:
- `domain.ts` — SiteGroup as controller pair (has `controller_url`)
- `network.ts` — SiteGroup as manual color-coded grouping (has `siteIds[]`, `color`)
- `ConfigureSites.tsx` — local Site interface with UI-specific fields

### Solution

**Remove:** `SiteGroup` from `network.ts` and the local interface from `ConfigureSites.tsx`.

**Canonical SiteGroup** (extend `domain.ts`):

```typescript
export interface SiteGroup {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  controller_url: string;
  controller_port?: number;
  primary_controller?: string;
  secondary_controller?: string;
  connection_status: 'connected' | 'disconnected' | 'error' | 'unknown';
  last_connected_at?: string;
  is_default: boolean;
  region?: string;
  tags?: string[];
  site_count?: number;
  created_at?: string;
  updated_at?: string;
  xiq_authenticated?: boolean;
  xiq_region?: string;
}
```

**Canonical Site** (extend `domain.ts`):

```typescript
export interface Site {
  id: string;
  name: string;
  site_group_id: string;
  site_group_name?: string;
  org_id?: string;
  location?: string;
  country?: string;
  timezone?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'provisioning' | 'error';
  ap_count?: number;
  client_count?: number;
  network_count?: number;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}
```

**Site Variables types** (new file `src/types/siteVariables.ts`):

```typescript
export type VariableType = 'string' | 'number' | 'ip' | 'subnet' | 'vlan' | 'hostname';
export type VariableScope = 'organization' | 'site_group' | 'site';
export type VariableSourceType = 'default' | 'override' | 'imported';

export interface VariableDefinition {
  id: string;
  name: string;
  token: string;                  // e.g., "employee_vlan"
  description?: string;
  type: VariableType;
  default_value?: string;
  validation_rules?: {
    pattern?: string;
    min?: number;
    max?: number;
    required?: boolean;
  };
  scope: VariableScope;
  created_at?: string;
  updated_at?: string;
}

export interface SiteVariableValue {
  id: string;
  site_id: string;
  variable_id: string;
  token: string;
  value: string;
  source_type: VariableSourceType;
  updated_at?: string;
  updated_by?: string;
}
```

Token syntax: `{{variable_name}}` — only letters, numbers, underscores allowed.

Reserved CSV import/export format:
```
Variable,Value
{{employee_vlan}},110
{{guest_vlan}},210
```

---

## 2. Page Structure & Layout

Both pages follow the Connected Clients / Access Points pattern exactly:

```
PageHeader (title + subtitle left, toolbar right)
  → Toolbar: Refresh, Customize Columns, Export
Metric Cards (gradient, hover scale, animated blur orbs)
Filter Badges (dismissible, when cross-page filter active)
Table Card
  → CardHeader: SearchFilterBar (compound search + result count)
  → CardContent: Table with sticky checkbox column, sortable headers, clickable rows
  → Pagination: items per page selector + page navigation
DetailSlideOut (right-side panel on row click)
```

### Site Groups Page

**Metric cards (4):**
| Card | Color | Source |
|------|-------|--------|
| Total Groups | Indigo/Violet | `siteGroups.length` |
| Connected | Green | Count where `connection_status === 'connected'` |
| Disconnected | Red | Count where `connection_status !== 'connected'` |
| Total Sites | Blue | Sum of all `site_count` values |

**Table columns:**
| Column | Key | Sortable | Default Visible |
|--------|-----|----------|-----------------|
| Checkbox | `select` | No | Yes (locked) |
| Name | `name` | Yes | Yes |
| Controller Pair | `controllerPair` | Yes | Yes |
| Site Count | `siteCount` | Yes | Yes |
| Status | `connectionStatus` | Yes | Yes |
| Region | `region` | Yes | Yes |
| Description | `description` | Yes | No |

Site Count column renders as a clickable link that navigates to the Sites page with a pre-applied filter.

### Sites Page

**Metric cards (5):**
| Card | Color | Source |
|------|-------|--------|
| Total Sites | Indigo/Violet | `sites.length` (filtered if filter active) |
| Active | Green | Count where `status === 'active'` |
| Inactive | Red | Count where `status !== 'active'` |
| Total APs | Blue | Sum of `ap_count` |
| Total Clients | Purple | Sum of `client_count` |

**Table columns:**
| Column | Key | Sortable | Default Visible |
|--------|-----|----------|-----------------|
| Checkbox | `select` | No | Yes (locked) |
| Site Name | `name` | Yes | Yes |
| Site Group | `siteGroupName` | Yes | Yes |
| Location | `location` | Yes | Yes |
| Status | `status` | Yes | Yes |
| AP Count | `apCount` | Yes | Yes |
| Client Count | `clientCount` | Yes | Yes |
| Country | `country` | Yes | No |
| Timezone | `timezone` | Yes | No |
| Tags | `tags` | No | No |

---

## 3. Navigation & Routing

### Sidebar

Replace single "Sites & Site Groups" entry with two entries:

```
Configure
  Site Groups        (icon: Server)
  Sites              (icon: Building2)
  Networks
  Policy
  AAA Policies
  Guest
  Advanced
```

### Route IDs

| Route ID | Component | File |
|----------|-----------|------|
| `configure-site-groups` | `SiteGroupsPage` | `src/components/SiteGroupsPage.tsx` |
| `configure-sites` | `SitesPage` | `src/components/SitesPage.tsx` |

### Cross-page Navigation

Clicking a site count in the Site Groups table:
1. Calls `onNavigateToSites(siteGroupId, siteGroupName)`
2. Sets `currentPage = 'configure-sites'` in App.tsx
3. Passes `siteGroupFilter: { id, name }` as prop to SitesPage
4. SitesPage shows a dismissible filter badge
5. Filter persisted to sessionStorage for refresh survival
6. Dismissing the badge clears the filter and shows all sites

### Detail Slide-outs

| Trigger | Component | Content |
|---------|-----------|---------|
| Site Group row click | `SiteGroupDetail` | Name, description, region, controller pair, connection status, timestamp, site count with link |
| Site row click | `SiteDetail` | Overview (name, location, description, parent Site Group, status), Stats (AP/client/network counts), Variables placeholder |

---

## 4. Component Architecture & File Structure

### New Files

```
src/
├── components/
│   ├── SiteGroupsPage.tsx          # Full page component
│   ├── SitesPage.tsx               # Full page component
│   └── SiteGroupDetail.tsx         # Detail slide-out
├── config/
│   ├── siteGroupsTableColumns.tsx  # SITE_GROUPS_TABLE_COLUMNS
│   └── sitesTableColumns.tsx       # SITES_TABLE_COLUMNS (replace contents)
└── types/
    └── siteVariables.ts            # VariableDefinition, SiteVariableValue
```

### Modified Files

| File | Change |
|------|--------|
| `src/types/domain.ts` | Extend `SiteGroup` and `Site` with new fields |
| `src/types/network.ts` | Remove `SiteGroup` interface |
| `src/components/Sidebar.tsx` | Two nav items replacing one |
| `src/components/App.tsx` | Two route cases, `siteGroupFilter` state, remove old handler |
| `src/components/SiteDetail.tsx` | Refactor to lean layout with Variables placeholder |

### Deleted Files

| File | Reason |
|------|--------|
| `src/components/ConfigureSites.tsx` | Replaced by two new pages |
| `src/components/SiteGroupManagementDialog.tsx` | Manual grouping concept removed |
| `src/components/SitesOverview.tsx` | Replaced by SitesPage |

### Shared Components Used (No Changes)

- `PageHeader` — title + toolbar
- `SearchFilterBar` — compound search + result count
- `useCompoundSearch` — tokenized AND search hook
- `useTableCustomization` — column management + saved views
- `ExportButton` — CSV/JSON/Print export
- `ColumnCustomizationDialog` — column visibility UI
- `DetailSlideOut` — right-side panels

---

## 5. Search & Filtering

Both pages use `useCompoundSearch` — tokenized AND search, persisted to sessionStorage.

### Site Groups Search Fields

```typescript
useCompoundSearch<SiteGroup>({
  storageKey: 'site-groups-search',
  fields: [
    sg => sg.name,
    sg => sg.description,
    sg => sg.primary_controller,
    sg => sg.secondary_controller,
    sg => sg.region,
    sg => sg.connection_status,
  ],
});
```

### Sites Search Fields

```typescript
useCompoundSearch<Site>({
  storageKey: 'sites-search',
  fields: [
    s => s.name,
    s => s.site_group_name,
    s => s.location,
    s => s.country,
    s => s.status,
    s => s.tags?.join(' '),
  ],
});
```

### Cross-page Filter

When navigating from Site Groups → Sites via site count click:
1. `siteGroupFilter` passed as state through App.tsx
2. Applied as pre-filter before compound search
3. Displayed as dismissible badge: `Site Group: US-East Campus ×`
4. Persisted to sessionStorage for refresh survival
5. Clearing the badge resets to all sites

---

## 6. Data Fetching & State

### Data Sources

| Data | Source | Existing? |
|------|--------|-----------|
| Site Groups | `AppContext` via `tenantService.getSiteGroups()` | Yes |
| Sites | `apiService.getSites()` with fallback chain | Yes |
| AP/client counts | `apiService.getStations()` via `siteMapping` service | Yes |

### Computed Metrics

- Site counts per Site Group: client-side grouping by `site_group_id`
- AP/client counts per site: from station correlation (existing service)
- Metric card totals: aggregated from loaded data, not separate API calls

### State Management

No new contexts. Each page manages local state for:
- Search query (via `useCompoundSearch`, sessionStorage)
- Column config (via `useTableCustomization`, localStorage)
- Sort field + direction
- Current page + items per page
- Selected rows (multi-select)
- Detail slide-out open/closed + selected item

Cross-page filter state passed through App.tsx and persisted to sessionStorage.

---

## 7. Site Detail Slide-Out

Opens on Site row click. Uses `DetailSlideOut` component.

### Sections (no tabs, scrollable)

**Overview:**
- Name, location, description
- Parent Site Group (with link)
- Status indicator
- Country, timezone

**Stats:**
- AP count, client count, network count
- Displayed as compact metric row

**Variables (placeholder):**
- Empty state with icon, title ("Site Variables"), description ("Site-level variables will appear here. This feature is coming soon.")
- Standard empty state pattern matching other AURA pages

---

## 8. Site Variables Data Model (Scaffold)

Types defined in `src/types/siteVariables.ts`. No API calls, no services, no UI beyond the placeholder.

### Token Syntax

- Format: `{{variable_name}}`
- Allowed characters: letters, numbers, underscores
- Examples: `{{employee_vlan}}`, `{{guest_subnet}}`, `{{site_name}}`

### Resolution Hierarchy

```
Organization → Site Group → Site → resolve variables at Site
```

### Future Import/Export Format (Reserved)

CSV format:
```
Variable,Value
{{employee_vlan}},110
{{guest_vlan}},210
```

UI placement: Site Variables section in Site detail or centralized under `Configure → Variables`.

---

## 9. Cleanup

### Code Removed from Existing Files

| File | Removal |
|------|---------|
| `src/types/network.ts` | `SiteGroup` interface, `siteIds[]`, `color` references |
| `src/components/App.tsx` | Old `configure-sites` route case, `handleShowSiteDetail` |
| `src/config/sitesTableColumns.tsx` | Replace contents with new column definitions |

### Verification

After refactor:
- No references to `SiteGroupManagementDialog` anywhere
- No references to `ConfigureSites` anywhere
- No references to `SitesOverview` anywhere
- No `SiteGroup` in `network.ts`
- No local `Site` interface in any page component
- `grep -r "siteIds\|color.*group" src/types/` returns nothing

---

## Acceptance Criteria

1. Two standalone pages: Configure → Site Groups and Configure → Sites
2. Both pages match Connected Clients / Access Points design language exactly
3. Site Groups represent controller pairs only — no manual grouping
4. Multiple Site Groups supported with site counts
5. Sites show parent Site Group in table and detail
6. Cross-page navigation: site count click → filtered Sites page with dismissible badge
7. Compound tokenized AND search on both pages via `useCompoundSearch`
8. Column customization via `useTableCustomization` with persistence
9. Gradient metric cards on both pages
10. Detail slide-outs for both entities
11. Site detail includes Variables placeholder section
12. `VariableDefinition` and `SiteVariableValue` types defined
13. Token syntax `{{variable_name}}` documented and enforced
14. No secondary left navigation panels inside page content
15. All old components (`ConfigureSites`, `SiteGroupManagementDialog`, `SitesOverview`) deleted
16. Type consolidation complete — single source of truth in `domain.ts`
