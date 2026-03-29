# Sites & Site Groups Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the combined `ConfigureSites.tsx` page with two standalone pages (`SiteGroupsPage.tsx` and `SitesPage.tsx`) that match the Connected Clients / Access Points design language. Consolidate types, scaffold Site Variables, and remove dead code.

**Design Spec:** `docs/superpowers/specs/2026-03-28-sites-and-site-groups-refactor-design.md` (APPROVED)

**Architecture:** Clean-room build. Reference `TrafficStatsConnectedClients.tsx` and `AccessPoints.tsx` as the pattern to follow exactly.

**Tech Stack:** React 18, TypeScript, Radix UI (via shadcn), Tailwind CSS, `useCompoundSearch`, `useTableCustomization`, `DetailSlideOut`, `PageHeader`, `SearchFilterBar`.

---

### Task 1: Type Consolidation & Site Variables Scaffold

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/types/network.ts`
- Create: `src/types/siteVariables.ts`

- [ ] **Step 1: Extend SiteGroup in domain.ts**

Add the missing fields to the existing `SiteGroup` interface in `src/types/domain.ts`:

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

- [ ] **Step 2: Extend Site in domain.ts**

Replace the minimal `Site` interface with the full canonical version:

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

Preserve backward compatibility: keep `siteName`, `displayName` as optional aliases if they're used elsewhere. Grep the codebase for `site.siteName` and `site.displayName` — if referenced, add them as `@deprecated` optional fields.

- [ ] **Step 3: Remove SiteGroup from network.ts**

Delete the `SiteGroup` interface from `src/types/network.ts` (the one with `siteIds[]` and `color` fields). Search for any imports of `SiteGroup` from `network.ts` and redirect them to `domain.ts`. Fix any compile errors.

- [ ] **Step 4: Create siteVariables.ts**

Create `src/types/siteVariables.ts`:

```typescript
export type VariableType = 'string' | 'number' | 'ip' | 'subnet' | 'vlan' | 'hostname';
export type VariableScope = 'organization' | 'site_group' | 'site';
export type VariableSourceType = 'default' | 'override' | 'imported';

export interface VariableDefinition {
  id: string;
  name: string;
  token: string;
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

- [ ] **Step 5: Verify no compile errors**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Fix any type errors introduced by the changes. Pay special attention to files that import `Site` or `SiteGroup`.

- [ ] **Step 6: Commit**

```bash
git add src/types/domain.ts src/types/network.ts src/types/siteVariables.ts
git commit -m "refactor(types): consolidate SiteGroup/Site types, scaffold site variables"
```

---

### Task 2: Column Configuration Files

**Files:**
- Create: `src/config/siteGroupsTableColumns.tsx`
- Modify: `src/config/sitesTableColumns.tsx`

- [ ] **Step 1: Create siteGroupsTableColumns.tsx**

Create `src/config/siteGroupsTableColumns.tsx` following the exact pattern from `src/config/accessPointsTableColumns.tsx`:

```typescript
import { ColumnConfig } from '@/hooks/useTableCustomization';
import { SiteGroup } from '@/types/domain';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, AlertTriangle, HelpCircle } from 'lucide-react';

export const SITE_GROUPS_TABLE_COLUMNS: ColumnConfig<SiteGroup>[] = [
  {
    key: 'name',
    label: 'Name',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'name',
    defaultVisible: true,
    sortable: true,
    lockVisible: true,
    defaultWidth: 200,
    tooltip: 'Site group name',
  },
  {
    key: 'controllerPair',
    label: 'Controller Pair',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'controller_url',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 250,
    renderCell: (sg: SiteGroup) => (
      <div className="flex flex-col text-xs">
        <span>{sg.primary_controller || sg.controller_url}</span>
        {sg.secondary_controller && (
          <span className="text-muted-foreground">{sg.secondary_controller}</span>
        )}
      </div>
    ),
    tooltip: 'Primary and secondary controller addresses',
  },
  {
    key: 'siteCount',
    label: 'Site Count',
    category: 'basic',
    dataType: 'number',
    fieldPath: 'site_count',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 100,
    tooltip: 'Number of sites in this group',
    // renderCell handled in page component for navigation behavior
  },
  {
    key: 'connectionStatus',
    label: 'Status',
    category: 'status',
    dataType: 'string',
    fieldPath: 'connection_status',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 130,
    renderCell: (sg: SiteGroup) => {
      const statusConfig = {
        connected: { icon: Wifi, variant: 'default' as const, label: 'Connected', className: 'text-green-500' },
        disconnected: { icon: WifiOff, variant: 'destructive' as const, label: 'Disconnected', className: 'text-red-500' },
        error: { icon: AlertTriangle, variant: 'destructive' as const, label: 'Error', className: 'text-orange-500' },
        unknown: { icon: HelpCircle, variant: 'secondary' as const, label: 'Unknown', className: 'text-muted-foreground' },
      };
      const config = statusConfig[sg.connection_status] || statusConfig.unknown;
      const Icon = config.icon;
      return (
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.className}`} />
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
      );
    },
    tooltip: 'Controller connection status',
  },
  {
    key: 'region',
    label: 'Region',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'region',
    defaultVisible: true,
    sortable: true,
    defaultWidth: 120,
    tooltip: 'Geographic region',
  },
  {
    key: 'description',
    label: 'Description',
    category: 'basic',
    dataType: 'string',
    fieldPath: 'description',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 250,
    tooltip: 'Group description',
  },
  {
    key: 'lastConnected',
    label: 'Last Connected',
    category: 'status',
    dataType: 'date',
    fieldPath: 'last_connected_at',
    defaultVisible: false,
    sortable: true,
    defaultWidth: 160,
    tooltip: 'Last successful connection time',
  },
];
```

- [ ] **Step 2: Rewrite sitesTableColumns.tsx**

Replace the contents of `src/config/sitesTableColumns.tsx` with new column definitions for the `Site` type. Follow the same `ColumnConfig<Site>[]` pattern. Columns:

| Key | Label | Default Visible | Sortable | Notes |
|-----|-------|-----------------|----------|-------|
| name | Site Name | Yes (locked) | Yes | |
| siteGroupName | Site Group | Yes | Yes | |
| location | Location | Yes | Yes | |
| status | Status | Yes | Yes | Badge + icon (active/inactive/provisioning/error) |
| apCount | AP Count | Yes | Yes | Numeric center |
| clientCount | Client Count | Yes | Yes | Numeric center |
| country | Country | No | Yes | |
| timezone | Timezone | No | Yes | |
| tags | Tags | No | No | Badge list |

Read the existing `sitesTableColumns.tsx` first. Preserve any `renderCell` patterns that are reusable. Replace the type from local Site to `Site` from `domain.ts`.

- [ ] **Step 3: Verify imports compile**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/config/siteGroupsTableColumns.tsx src/config/sitesTableColumns.tsx
git commit -m "feat(config): add site groups columns, rewrite sites columns for new types"
```

---

### Task 3: SiteGroupsPage.tsx — Full Page Component

**Files:**
- Create: `src/components/SiteGroupsPage.tsx`

This is the core of the refactor. Build it by cloning the structure of `TrafficStatsConnectedClients.tsx` exactly, replacing Station-specific logic with SiteGroup logic.

- [ ] **Step 1: Create SiteGroupsPage.tsx scaffold**

Structure (follow Connected Clients pattern exactly):

```typescript
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Server, Globe, Wifi, WifiOff, Building2 } from 'lucide-react';
import { SiteGroup } from '@/types/domain';
import { useCompoundSearch } from '@/hooks/useCompoundSearch';
import { useTableCustomization } from '@/hooks/useTableCustomization';
import { SITE_GROUPS_TABLE_COLUMNS } from '@/config/siteGroupsTableColumns';
import { PageHeader } from '@/components/PageHeader';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import { DetailSlideOut } from '@/components/DetailSlideOut';
// ... Card, Table, Badge, etc. from UI

interface SiteGroupsPageProps {
  onNavigateToSites?: (siteGroupId: string, siteGroupName: string) => void;
  onShowDetail?: (siteGroupId: string, siteGroupName: string) => void;
}

export default function SiteGroupsPage({ onNavigateToSites, onShowDetail }: SiteGroupsPageProps) {
```

- [ ] **Step 2: Implement state and hooks**

State variables (mirror Connected Clients):
```typescript
// Data
const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

// Search
const { query, setQuery, filterRows, hasActiveSearch, clearSearch, tokens } =
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

// Table customization
const columnCustomization = useTableCustomization({
  tableId: 'site-groups',
  columns: SITE_GROUPS_TABLE_COLUMNS,
  storageKey: 'siteGroupsVisibleColumns',
  enableViews: false,
  enablePersistence: true,
});

// Pagination
const [currentPage, setCurrentPage] = useState(1);
const [itemsPerPage, setItemsPerPage] = useState(25);

// Sort
const [sortField, setSortField] = useState<string>('name');
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

// Selection
const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
const [selectedGroup, setSelectedGroup] = useState<SiteGroup | null>(null);

// Detail panel
const [isDetailOpen, setIsDetailOpen] = useState(false);
```

- [ ] **Step 3: Implement data fetching**

Load site groups from `AppContext` (tenantService). The site groups are already in context from the controller selection flow.

```typescript
// Get site groups from AppContext
const { siteGroups: contextSiteGroups } = useContext(AppContext);
// or fetch via tenantService.getSiteGroups() on mount

useEffect(() => {
  const loadData = async () => {
    setLoading(true);
    try {
      // Site groups come from tenant context
      // Enrich with site counts via apiService.getSites()
      const sites = await apiService.getSites();
      const countMap = new Map<string, number>();
      sites.forEach(s => {
        const sgId = s.site_group_id || 'default';
        countMap.set(sgId, (countMap.get(sgId) || 0) + 1);
      });
      const enriched = contextSiteGroups.map(sg => ({
        ...sg,
        site_count: countMap.get(sg.id) || 0,
      }));
      setSiteGroups(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load site groups');
    } finally {
      setLoading(false);
    }
  };
  loadData();
}, [contextSiteGroups]);
```

Check the actual data source — read `App.tsx` and `AppContext` to see how site groups flow. The implementation may need to call `tenantService` directly or use the existing controller selection state.

- [ ] **Step 4: Implement metric cards**

Four gradient metric cards (match Connected Clients pattern):

| Card | Color | Value |
|------|-------|-------|
| Total Groups | Indigo/Violet | `filteredGroups.length` |
| Connected | Green | Count where `connection_status === 'connected'` |
| Disconnected | Red | Count where `connection_status !== 'connected'` |
| Total Sites | Blue | Sum of `site_count` |

Use the same gradient card component used in Connected Clients and Access Points. Read those pages to find the exact card markup (likely inline divs with gradient backgrounds and animated blur orbs).

- [ ] **Step 5: Implement table with sorting, pagination, row click**

Follow the Connected Clients table pattern:
1. Apply search filter: `filterRows(siteGroups)`
2. Apply sort
3. Apply pagination
4. Render table headers from `columnCustomization.visibleColumnConfigs`
5. Render rows with checkbox, data cells, row click handler
6. Site Count column: render as a clickable link that calls `onNavigateToSites(sg.id, sg.name)`
7. Row click opens detail slide-out

- [ ] **Step 6: Implement SiteGroupDetail inline**

For the detail slide-out, render a simple detail view (can be inline or a separate component `SiteGroupDetail.tsx`). Show:
- Name, description, region
- Controller pair (primary + secondary)
- Connection status with timestamp
- Site count (clickable → navigates to Sites)
- Tags (if present)

- [ ] **Step 7: Compose the full JSX**

Follow this exact order (matches Connected Clients):
```tsx
return (
  <div className="flex-1 space-y-4 p-4 md:p-6">
    <PageHeader
      title="Site Groups"
      subtitle={`Controller groups and site assignments${hasActiveSearch ? ` • ${filteredGroups.length} results` : ''}`}
      icon={Server}
      onRefresh={handleRefresh}
      refreshing={loading}
      actions={/* Customize Columns, Export buttons */}
    />

    {error && <Alert variant="destructive">...</Alert>}

    {/* Metric Cards */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 4 gradient metric cards */}
    </div>

    {/* Table Card */}
    <Card>
      <CardHeader>
        <SearchFilterBar
          query={query}
          onQueryChange={setQuery}
          resultCount={filteredGroups.length}
          totalCount={siteGroups.length}
          placeholder="Search site groups..."
        />
      </CardHeader>
      <CardContent>
        <Table>...</Table>
        <Pagination>...</Pagination>
      </CardContent>
    </Card>

    {/* Detail Slide-Out */}
    <DetailSlideOut
      isOpen={isDetailOpen}
      onClose={() => setIsDetailOpen(false)}
      title={selectedGroup?.name || 'Site Group Details'}
    >
      {selectedGroup && <SiteGroupDetailContent group={selectedGroup} />}
    </DetailSlideOut>
  </div>
);
```

- [ ] **Step 8: Verify the page renders**

Start dev server, navigate to the page, verify:
- Metric cards show correct counts
- Table renders with data
- Search works
- Row click opens detail
- Site count column is clickable

- [ ] **Step 9: Commit**

```bash
git add src/components/SiteGroupsPage.tsx src/components/SiteGroupDetail.tsx
git commit -m "feat(site-groups): add SiteGroupsPage with full table, search, detail panel"
```

---

### Task 4: SitesPage.tsx — Full Page Component

**Files:**
- Create: `src/components/SitesPage.tsx`

- [ ] **Step 1: Create SitesPage.tsx scaffold**

Clone structure from Connected Clients. Key differences from SiteGroupsPage:
- 5 metric cards instead of 4
- Cross-page filter support (receives `siteGroupFilter` prop)
- Different search fields
- Different columns

```typescript
interface SitesPageProps {
  siteGroupFilter?: { id: string; name: string } | null;
  onClearFilter?: () => void;
  onShowDetail?: (siteId: string, siteName: string) => void;
}

export default function SitesPage({ siteGroupFilter, onClearFilter, onShowDetail }: SitesPageProps) {
```

- [ ] **Step 2: Implement state and hooks**

Same pattern as SiteGroupsPage but with:
```typescript
const { query, setQuery, filterRows, hasActiveSearch, clearSearch, tokens } =
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

const columnCustomization = useTableCustomization({
  tableId: 'sites',
  columns: SITES_TABLE_COLUMNS,
  storageKey: 'sitesVisibleColumns',
  enableViews: false,
  enablePersistence: true,
});
```

- [ ] **Step 3: Implement data fetching**

```typescript
useEffect(() => {
  const loadSites = async () => {
    setLoading(true);
    try {
      const rawSites = await apiService.getSites();
      // Enrich with site_group_name from context
      // Enrich with ap_count, client_count from station data if available
      setSites(enrichedSites);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  };
  loadSites();
}, []);
```

- [ ] **Step 4: Implement cross-page filter**

When `siteGroupFilter` is provided:
1. Apply it as a pre-filter before compound search
2. Show a dismissible badge above the table: `Site Group: {name} ×`
3. Persist to sessionStorage key `sites-group-filter`
4. On dismiss, call `onClearFilter()` and clear sessionStorage

```typescript
const preFilteredSites = useMemo(() => {
  if (!siteGroupFilter) return sites;
  return sites.filter(s => s.site_group_id === siteGroupFilter.id);
}, [sites, siteGroupFilter]);

const filteredSites = filterRows(preFilteredSites);
```

- [ ] **Step 5: Implement metric cards**

Five gradient cards:
| Card | Color | Value |
|------|-------|-------|
| Total Sites | Indigo/Violet | `filteredSites.length` |
| Active | Green | Count where `status === 'active'` |
| Inactive | Red | Count where `status !== 'active'` |
| Total APs | Blue | Sum of `ap_count` |
| Total Clients | Purple | Sum of `client_count` |

Use `grid-cols-2 lg:grid-cols-5` for the 5-card grid.

- [ ] **Step 6: Implement table with sorting, pagination, row click**

Same pattern as SiteGroupsPage. Row click calls `onShowDetail(site.id, site.name)` which opens the Site detail slide-out via App.tsx.

- [ ] **Step 7: Compose full JSX**

Same structure as SiteGroupsPage with additions:
- Filter badge (between metric cards and table card)
- 5 metric cards instead of 4

- [ ] **Step 8: Commit**

```bash
git add src/components/SitesPage.tsx
git commit -m "feat(sites): add SitesPage with cross-page filter, search, detail panel"
```

---

### Task 5: Refactor SiteDetail.tsx

**Files:**
- Modify: `src/components/SiteDetail.tsx`

- [ ] **Step 1: Read current SiteDetail.tsx**

Understand the current implementation. It loads site state, AP counts, and client counts.

- [ ] **Step 2: Refactor to lean layout**

Replace the current multi-card layout with three scrollable sections (no tabs):

**Overview:**
- Name + status badge
- Location, country, timezone
- Parent Site Group (with name, clickable)
- Description

**Stats:**
- Compact metric row: AP count, Client count, Network count
- Use small inline badges or grid, not full cards

**Variables (placeholder):**
```tsx
<div className="flex flex-col items-center justify-center py-8 text-center">
  <Variable className="h-10 w-10 text-muted-foreground mb-3" />
  <h4 className="text-sm font-medium">Site Variables</h4>
  <p className="text-xs text-muted-foreground mt-1">
    Site-level variables will appear here. This feature is coming soon.
  </p>
</div>
```

- [ ] **Step 3: Verify detail panel renders correctly**

Open a site detail from the Sites page, verify all three sections render.

- [ ] **Step 4: Commit**

```bash
git add src/components/SiteDetail.tsx
git commit -m "refactor(site-detail): lean layout with overview, stats, variables placeholder"
```

---

### Task 6: Routing & Navigation Wiring

**Files:**
- Modify: `src/components/App.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

Replace the single `configure-sites` entry with two entries:

```typescript
const configureItems = [
  { id: 'configure-site-groups', label: 'Site Groups', icon: Server },
  { id: 'configure-sites', label: 'Sites', icon: Building2 },
  { id: 'configure-networks', label: 'Networks', icon: Network },
  // ... rest unchanged
];
```

- [ ] **Step 2: Update App.tsx routing**

Add `siteGroupFilter` state:
```typescript
const [siteGroupFilter, setSiteGroupFilter] = useState<{ id: string; name: string } | null>(null);
```

Add navigation handler:
```typescript
const handleNavigateToSites = (siteGroupId: string, siteGroupName: string) => {
  setSiteGroupFilter({ id: siteGroupId, name: siteGroupName });
  setCurrentPage('configure-sites');
};
```

Add SiteGroupDetail handler:
```typescript
const handleShowSiteGroupDetail = (siteGroupId: string, siteGroupName: string) => {
  setDetailPanel({ isOpen: true, type: 'site-group', data: { siteGroupId, siteGroupName } });
};
```

Update `renderPage()`:
```typescript
case 'configure-site-groups':
  return (
    <SiteGroupsPage
      onNavigateToSites={handleNavigateToSites}
      onShowDetail={handleShowSiteGroupDetail}
    />
  );
case 'configure-sites':
  return (
    <SitesPage
      siteGroupFilter={siteGroupFilter}
      onClearFilter={() => setSiteGroupFilter(null)}
      onShowDetail={handleShowSiteDetail}
    />
  );
```

Add lazy imports at top:
```typescript
const SiteGroupsPage = lazy(() => import('./SiteGroupsPage'));
const SitesPage = lazy(() => import('./SitesPage'));
```

Update detail panel rendering to handle `type: 'site-group'`.

- [ ] **Step 3: Wire the detail panel for site-group type**

In the DetailSlideOut rendering section of App.tsx, add:
```typescript
{detailPanel.type === 'site-group' && (
  <SiteGroupDetail
    siteGroupId={detailPanel.data.siteGroupId}
    siteGroupName={detailPanel.data.siteGroupName}
  />
)}
```

- [ ] **Step 4: Verify navigation flows**

Test:
1. Click "Site Groups" in sidebar → SiteGroupsPage renders
2. Click "Sites" in sidebar → SitesPage renders (no filter)
3. Click site count in Site Groups table → navigates to Sites with filter badge
4. Dismiss filter badge → shows all sites
5. Click row in either table → detail slide-out opens
6. Close detail → returns to table

- [ ] **Step 5: Commit**

```bash
git add src/components/App.tsx src/components/Sidebar.tsx
git commit -m "feat(routing): wire Site Groups and Sites pages with cross-page navigation"
```

---

### Task 7: Cleanup & Deletion

**Files:**
- Delete: `src/components/ConfigureSites.tsx`
- Delete: `src/components/SiteGroupManagementDialog.tsx` (if exists)
- Delete: `src/components/SitesOverview.tsx` (if exists)
- Modify: Any files that import the deleted components

- [ ] **Step 1: Search for references to deleted components**

```bash
grep -rn "ConfigureSites\|SiteGroupManagementDialog\|SitesOverview" src/ --include="*.tsx" --include="*.ts"
```

Remove or redirect all imports and references.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/ConfigureSites.tsx
rm -f src/components/SiteGroupManagementDialog.tsx
rm -f src/components/SitesOverview.tsx
```

- [ ] **Step 3: Verify no broken imports**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Fix any remaining references.

- [ ] **Step 4: Verify cleanup is complete**

```bash
grep -rn "siteIds\|color.*group" src/types/ --include="*.ts"
grep -rn "SiteGroupManagementDialog\|ConfigureSites\|SitesOverview" src/ --include="*.tsx" --include="*.ts"
```

Both should return nothing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(cleanup): remove ConfigureSites, SiteGroupManagementDialog, SitesOverview"
```

---

### Task 8: Acceptance Verification & Push

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Must pass with zero errors.

- [ ] **Step 2: Run lint**

```bash
npx eslint src/components/SiteGroupsPage.tsx src/components/SitesPage.tsx src/components/SiteDetail.tsx src/config/siteGroupsTableColumns.tsx src/config/sitesTableColumns.tsx src/types/siteVariables.ts
```

Fix any lint errors.

- [ ] **Step 3: Visual verification checklist**

Start the dev server and verify all 16 acceptance criteria from the design spec:

1. ✅ Two standalone pages: Configure → Site Groups and Configure → Sites
2. ✅ Both pages match Connected Clients / Access Points design language
3. ✅ Site Groups represent controller pairs only
4. ✅ Multiple Site Groups supported with site counts
5. ✅ Sites show parent Site Group in table and detail
6. ✅ Cross-page navigation with dismissible badge
7. ✅ Compound tokenized AND search on both pages
8. ✅ Column customization with persistence
9. ✅ Gradient metric cards on both pages
10. ✅ Detail slide-outs for both entities
11. ✅ Site detail includes Variables placeholder
12. ✅ VariableDefinition and SiteVariableValue types defined
13. ✅ Token syntax documented
14. ✅ No secondary left navigation panels
15. ✅ Old components deleted
16. ✅ Type consolidation complete

- [ ] **Step 4: Commit final adjustments and push**

```bash
git push
```
