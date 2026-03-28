# AURA Full Audit — Plan 1: Discovery & Swagger Mapping

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse the Swagger spec, map every page/feature to its API calls, build the inventory artifacts that all subsequent audit plans depend on.

**Architecture:** Read-only analysis pass. No code changes. Produces 4 markdown artifacts in `/audit/` that serve as the source of truth for Plans 2-5. Uses a Node.js script to parse the Swagger JSON programmatically, then manual codebase inspection to map features to endpoints.

**Tech Stack:** Node.js (script for Swagger parsing), grep/search for codebase mapping, Markdown for output artifacts.

**Swagger file:** `public/swagger.json` (OpenAPI 3.0, 243 paths, 328 methods, 37 tags, version 1.25.1)

**Decomposition note:** This is Plan 1 of 5. Subsequent plans:
- Plan 2: API Audit — Monitor & Dashboard Pages (depends on this plan's output)
- Plan 3: API Audit — Configure & System Pages (depends on this plan's output)
- Plan 4: Cross-Cutting Quality (Security, Accessibility, Theme, Performance, Service Worker)
- Plan 5: Final Reporting (compiles findings from Plans 1-4)

---

### Task 1: Create the audit directory and scaffold artifact files

**Files:**
- Create: `audit/aura-route-inventory.md`
- Create: `audit/aura-swagger-endpoint-catalog.md`
- Create: `audit/aura-component-inventory.md`
- Create: `audit/aura-feature-endpoint-matrix.md`

- [ ] **Step 1: Create audit directory**

```bash
mkdir -p audit
```

- [ ] **Step 2: Create scaffold for all 4 artifacts**

Create `audit/aura-route-inventory.md`:
```markdown
# AURA Route Inventory

Generated: 2026-03-28
Source: App.tsx, Sidebar.tsx

## Routes

| Route ID | Component | File | Lazy? | Error Boundary? | Section |
|----------|-----------|------|-------|-----------------|---------|

## Detail Panels

| Type | Component | Trigger |
|------|-----------|---------|

## Modal/Dialog Workflows

| Dialog | Triggered From | Purpose |
|--------|----------------|---------|
```

Create `audit/aura-swagger-endpoint-catalog.md`:
```markdown
# AURA Swagger Endpoint Catalog

Generated: 2026-03-28
Source: public/swagger.json (v1.25.1)
Total Paths: 243 | Total Methods: 328 | Tags: 37

## Endpoints by Tag

### [Tag Name]

| Method | Path | OperationId | Summary | Params | Response |
|--------|------|-------------|---------|--------|----------|
```

Create `audit/aura-component-inventory.md`:
```markdown
# AURA Component Inventory

Generated: 2026-03-28

## Service Files (src/services/)

| File | Purpose | Makes HTTP Calls? | Endpoints Used |
|------|---------|-------------------|----------------|

## Hooks (src/hooks/)

| File | Purpose | Calls Service? |
|------|---------|----------------|

## Shared UI Components (src/components/ui/)

| File | Purpose |
|------|---------|

## Feature Components (src/components/)

| File | Purpose | Page/Route | API Dependencies |
|------|---------|------------|------------------|
```

Create `audit/aura-feature-endpoint-matrix.md`:
```markdown
# AURA Feature-to-Endpoint Matrix

Generated: 2026-03-28

## Matrix

| Page | Feature/Widget | Component | Current API Call(s) | Swagger Path | Method | Fields Used | Status |
|------|---------------|-----------|---------------------|--------------|--------|-------------|--------|
```

- [ ] **Step 3: Commit scaffold**

```bash
git add audit/
git commit -m "chore(audit): scaffold audit artifact files"
```

---

### Task 2: Parse Swagger and build endpoint catalog

**Files:**
- Create: `scripts/parse-swagger.js`
- Modify: `audit/aura-swagger-endpoint-catalog.md`

- [ ] **Step 1: Write the Swagger parser script**

Create `scripts/parse-swagger.js`:
```javascript
/**
 * Parses public/swagger.json and outputs a structured markdown catalog
 * grouped by tag, with method, path, operationId, summary, params, and response info.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swagger = JSON.parse(readFileSync(path.join(__dirname, '..', 'public', 'swagger.json'), 'utf-8'));

const endpoints = [];

for (const [pathStr, methods] of Object.entries(swagger.paths)) {
  for (const [method, spec] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
    const tags = spec.tags || ['Untagged'];
    const params = (spec.parameters || []).map(p => `${p.name} (${p.in}${p.required ? ', required' : ''})`).join(', ');
    const hasBody = !!spec.requestBody;
    const responses = Object.keys(spec.responses || {}).join(', ');

    for (const tag of tags) {
      endpoints.push({
        tag,
        method: method.toUpperCase(),
        path: pathStr,
        operationId: spec.operationId || '-',
        summary: (spec.summary || '-').replace(/\|/g, '\\|'),
        params: params || (hasBody ? '[request body]' : '-'),
        responses,
      });
    }
  }
}

// Group by tag
const byTag = {};
for (const ep of endpoints) {
  if (!byTag[ep.tag]) byTag[ep.tag] = [];
  byTag[ep.tag].push(ep);
}

// Sort tags alphabetically
const sortedTags = Object.keys(byTag).sort();

// Build markdown
let md = `# AURA Swagger Endpoint Catalog\n\n`;
md += `Generated: ${new Date().toISOString().split('T')[0]}\n`;
md += `Source: public/swagger.json (v${swagger.info.version})\n`;
md += `Total Paths: ${Object.keys(swagger.paths).length} | Total Methods: ${endpoints.length} | Tags: ${sortedTags.length}\n\n`;
md += `---\n\n`;

// Summary table of tags
md += `## Tag Summary\n\n`;
md += `| Tag | Endpoint Count | Methods |\n`;
md += `|-----|---------------|--------|\n`;
for (const tag of sortedTags) {
  const eps = byTag[tag];
  const methods = [...new Set(eps.map(e => e.method))].join(', ');
  md += `| ${tag} | ${eps.length} | ${methods} |\n`;
}
md += `\n---\n\n`;

// Detailed tables per tag
md += `## Endpoints by Tag\n\n`;
for (const tag of sortedTags) {
  const eps = byTag[tag];
  // Sort: GET first, then by path
  eps.sort((a, b) => {
    const methodOrder = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
    const diff = (methodOrder[a.method] || 5) - (methodOrder[b.method] || 5);
    return diff !== 0 ? diff : a.path.localeCompare(b.path);
  });

  md += `### ${tag}\n\n`;
  md += `| Method | Path | OperationId | Summary | Params | Responses |\n`;
  md += `|--------|------|-------------|---------|--------|-----------|\n`;
  for (const ep of eps) {
    md += `| ${ep.method} | \`${ep.path}\` | ${ep.operationId} | ${ep.summary} | ${ep.params} | ${ep.responses} |\n`;
  }
  md += `\n`;
}

// Unused endpoint detection helper: list all GET endpoints
md += `---\n\n`;
md += `## All GET Endpoints (for unused endpoint detection)\n\n`;
md += `| Path | OperationId | Tag | Summary |\n`;
md += `|------|-------------|-----|---------|\n`;
const getEndpoints = endpoints.filter(e => e.method === 'GET').sort((a, b) => a.path.localeCompare(b.path));
// Deduplicate by path
const seen = new Set();
for (const ep of getEndpoints) {
  if (seen.has(ep.path)) continue;
  seen.add(ep.path);
  md += `| \`${ep.path}\` | ${ep.operationId} | ${ep.tag} | ${ep.summary} |\n`;
}

writeFileSync(path.join(__dirname, '..', 'audit', 'aura-swagger-endpoint-catalog.md'), md, 'utf-8');
console.log(`Wrote ${endpoints.length} endpoints across ${sortedTags.length} tags to audit/aura-swagger-endpoint-catalog.md`);
```

- [ ] **Step 2: Run the parser**

```bash
node scripts/parse-swagger.js
```

Expected output: `Wrote 328 endpoints across 37 tags to audit/aura-swagger-endpoint-catalog.md`

- [ ] **Step 3: Verify the output**

Open `audit/aura-swagger-endpoint-catalog.md` and confirm:
- Tag Summary table has 37 rows
- Each tag has a detailed endpoint table
- GET endpoints list at the bottom is populated
- No malformed markdown (escaped pipes, no broken rows)

- [ ] **Step 4: Commit**

```bash
git add scripts/parse-swagger.js audit/aura-swagger-endpoint-catalog.md
git commit -m "chore(audit): parse Swagger and generate endpoint catalog"
```

---

### Task 3: Build the route inventory

**Files:**
- Modify: `audit/aura-route-inventory.md`
- Read: `src/App.tsx`, `src/components/Sidebar.tsx`

- [ ] **Step 1: Extract all routes from App.tsx**

Read `src/App.tsx` and find every `currentPage === '...'` conditional. For each, record:
- Route ID (the string)
- Component rendered
- Source file path
- Whether it's lazy-loaded (`const X = lazy(...)`)
- Whether it's wrapped in `ErrorBoundary`

Populate the Routes table in `audit/aura-route-inventory.md`:

```markdown
## Routes

| Route ID | Component | File | Lazy? | Error Boundary? | Section |
|----------|-----------|------|-------|-----------------|---------|
| workspace | Workspace | src/components/Workspace.tsx | No | No | Navigation |
| service-levels | DashboardEnhanced | src/components/DashboardEnhanced.tsx | No | No | Navigation |
| sle-dashboard | SLEDashboard | src/components/SLEDashboard.tsx | Yes | No | Navigation |
| app-insights | AppInsights | src/components/AppInsights.tsx | Yes | No | Navigation |
| connected-clients | TrafficStatsConnectedClients | src/components/TrafficStatsConnectedClients.tsx | Yes | No | Navigation |
| access-points | AccessPoints | src/components/AccessPoints.tsx | Yes | No | Navigation |
| report-widgets | ReportWidgets | src/components/ReportWidgets.tsx | Yes | No | Navigation |
| configure-sites | ConfigureSites | src/components/ConfigureSites.tsx | Yes | No | Configure |
| configure-networks | ConfigureNetworks | src/components/ConfigureNetworks.tsx | Yes | No | Configure |
| configure-policy | ConfigurePolicy | src/components/ConfigurePolicy.tsx | Yes | No | Configure |
| configure-aaa-policies | ConfigureAAAPolicies | src/components/ConfigureAAAPolicies.tsx | Yes | No | Configure |
| configure-guest | ConfigureGuest | src/components/ConfigureGuest.tsx | Yes | No | Configure |
| configure-advanced | ConfigureAdvanced | src/components/ConfigureAdvanced.tsx | Yes | No | Configure |
| configure-adoption-rules | ConfigureAdoptionRules | src/components/ConfigureAdoptionRules.tsx | Yes | No | Configure |
| system-backup | SystemBackupManager | src/components/SystemBackupManager.tsx | No | Yes | System |
| license-dashboard | LicenseDashboard | src/components/LicenseDashboard.tsx | No | Yes | System |
| firmware-manager | APFirmwareManager | src/components/APFirmwareManager.tsx | No | Yes | System |
| network-diagnostics | NetworkDiagnostics | src/components/NetworkDiagnostics.tsx | No | Yes | System |
| event-alarm-dashboard | EventAlarmDashboard | src/components/EventAlarmDashboard.tsx | No | Yes | System |
| security-dashboard | SecurityDashboard | src/components/SecurityDashboard.tsx | No | Yes | System |
| pci-report | PCIReport | src/components/PCIReport.tsx | Yes | No | System |
| guest-management | GuestManagement | src/components/GuestManagement.tsx | No | Yes | System |
| tools | Tools | src/components/Tools.tsx | Yes | No | Tools |
| administration | Administration | src/components/Administration.tsx | Yes | No | Tools |
| api-test | ApiTestTool | src/components/ApiTestTool.tsx | Yes | No | Tools |
| api-documentation | ApiDocumentation | src/components/ApiDocumentation.tsx | Yes | No | Tools |
| help | HelpPage | src/components/HelpPage.tsx | Yes | No | Tools |
```

- [ ] **Step 2: Extract detail panels**

Find all detail panel types in App.tsx (the `detailType` state and panel rendering). Document in the Detail Panels section:

```markdown
## Detail Panels

| Type | Component | File | Triggered By |
|------|-----------|------|--------------|
| access-point | AccessPointDetail | src/components/AccessPointDetail.tsx | AP row click in AccessPoints page |
| client | ClientDetail | src/components/ClientDetail.tsx | Client row click in Connected Clients page |
| site | SiteDetail | src/components/SiteDetail.tsx | Site row click in ConfigureSites page |
```

- [ ] **Step 3: Extract modal/dialog workflows**

Search for all `Dialog` and `Sheet` components used across page components. For each, record the triggering component and purpose. Add to Modal/Dialog Workflows section.

Search pattern:
```bash
grep -rn "Dialog\|Sheet" src/components/ --include="*.tsx" | grep -v "ui/" | grep -v "import" | grep "open="
```

- [ ] **Step 4: Commit**

```bash
git add audit/aura-route-inventory.md
git commit -m "chore(audit): build complete route inventory"
```

---

### Task 4: Build the component inventory

**Files:**
- Modify: `audit/aura-component-inventory.md`
- Read: `src/services/*.ts`, `src/hooks/*.ts`, `src/components/ui/*.tsx`

- [ ] **Step 1: Inventory all service files**

For each file in `src/services/`, read the file and determine:
- Purpose (one line)
- Whether it makes HTTP calls (fetch, apiService, supabase)
- Which endpoints it calls (list the paths or method names)

Populate the Service Files table. Focus on files that make external calls — those are audit targets.

Key files to inspect carefully:
- `src/services/api.ts` — the main API service (271 methods, 9500+ lines)
- `src/services/tenantService.ts` — Supabase-based org/controller management
- `src/services/xiqService.ts` — XIQ integration
- `src/services/traffic.ts` — traffic analytics
- `src/services/sleDataCollection.ts` — SLE data collection
- `src/services/workspaceDataService.ts` — workspace widget data

- [ ] **Step 2: Inventory all hooks**

For each file in `src/hooks/`, determine:
- Purpose
- Whether it calls a service method

Populate the Hooks table.

- [ ] **Step 3: Inventory shared UI components**

List all files in `src/components/ui/` with a one-line purpose. These are the reusable primitives.

- [ ] **Step 4: Inventory feature components**

For each major feature component (page-level components, detail panels, significant widgets), determine:
- Purpose
- Which page/route it belongs to
- API dependencies (which service methods it calls directly)

This does NOT need to cover every small component — focus on the 27 route components, 3 detail panels, and any component that directly calls `apiService` or a service method.

- [ ] **Step 5: Identify dead code candidates**

Search for components that are:
- Not imported anywhere (`grep -rn "import.*ComponentName" src/`)
- Not referenced in App.tsx routing
- Not referenced in any other component

Add a "Dead Code Candidates" section to the inventory.

- [ ] **Step 6: Commit**

```bash
git add audit/aura-component-inventory.md
git commit -m "chore(audit): build component inventory with dead code candidates"
```

---

### Task 5: Build the feature-to-endpoint matrix

**Files:**
- Modify: `audit/aura-feature-endpoint-matrix.md`
- Read: All 27 page components, `src/services/api.ts`

This is the core deliverable of Plan 1. For each page, enumerate every widget/feature and map it to its API call(s), then cross-reference to Swagger.

- [ ] **Step 1: Map Monitor & Dashboard pages**

For each page below, read the component source and find every `apiService.methodName()` call or direct `fetch()` call. Cross-reference each method to its endpoint in `src/services/api.ts`, then match that endpoint to a Swagger path.

Pages to map:
1. **Workspace** (`src/components/Workspace.tsx`) — widgets, data sources
2. **Contextual Insights / DashboardEnhanced** (`src/components/DashboardEnhanced.tsx`) — cards, charts, metrics
3. **Service Levels / SLEDashboard** (`src/components/SLEDashboard.tsx`) — SLE widgets, classifiers
4. **App Insights** (`src/components/AppInsights.tsx`) — application analytics, traffic charts
5. **Connected Clients** (`src/components/TrafficStatsConnectedClients.tsx`) — client table, traffic stats
6. **Access Points** (`src/components/AccessPoints.tsx`) — AP table, cable health, mesh
7. **Report Widgets** (`src/components/ReportWidgets.tsx`) — report cards, charts

For each feature found, add a row to the matrix:

```markdown
| Connected Clients | Client Table | TrafficStatsConnectedClients | apiService.getStations() | /v1/stations | GET | hostName, macAddress, ipAddress, ... | TBD |
```

- [ ] **Step 2: Map Configure pages**

Pages to map:
1. **Sites & Site Groups** (`src/components/ConfigureSites.tsx`)
2. **Networks** (`src/components/ConfigureNetworks.tsx`)
3. **Policy** (`src/components/ConfigurePolicy.tsx`)
4. **AAA Policies** (`src/components/ConfigureAAAPolicies.tsx`)
5. **Guest** (`src/components/ConfigureGuest.tsx`)
6. **Advanced** (`src/components/ConfigureAdvanced.tsx`)
7. **Adoption Rules** (`src/components/ConfigureAdoptionRules.tsx`)

- [ ] **Step 3: Map System pages**

Pages to map:
1. **Backup & Storage** (`src/components/SystemBackupManager.tsx`)
2. **License Management** (`src/components/LicenseDashboard.tsx`)
3. **Firmware Manager** (`src/components/APFirmwareManager.tsx`)
4. **Network Diagnostics** (`src/components/NetworkDiagnostics.tsx`)
5. **Events & Alarms** (`src/components/EventAlarmDashboard.tsx`)
6. **Security** (`src/components/SecurityDashboard.tsx`)
7. **PCI DSS Report** (`src/components/PCIReport.tsx`)
8. **Guest Access** (`src/components/GuestManagement.tsx`)

- [ ] **Step 4: Map Tools & Admin pages**

Pages to map:
1. **Tools** (`src/components/Tools.tsx`)
2. **Administration** (`src/components/Administration.tsx`)
3. **API Test** (`src/components/ApiTestTool.tsx`)
4. **API Documentation** (`src/components/ApiDocumentation.tsx`)
5. **Help** (`src/components/HelpPage.tsx`)

- [ ] **Step 5: Map Detail Panels**

1. **AccessPointDetail** (`src/components/AccessPointDetail.tsx`)
2. **ClientDetail** (`src/components/ClientDetail.tsx`)
3. **SiteDetail** (`src/components/SiteDetail.tsx`)

- [ ] **Step 6: Flag mock/hardcoded data**

While mapping, flag any feature that uses:
- Hardcoded arrays or objects instead of API calls
- `Math.random()` or `Date.now()` to generate fake data
- Comments containing "mock", "fake", "placeholder", "dummy", "sample"
- Data that never changes regardless of selected site/time range

Add a "Mock Data Flags" section to the matrix:

```markdown
## Mock Data Flags

| Page | Feature | Component | Evidence | Severity |
|------|---------|-----------|----------|----------|
```

- [ ] **Step 7: Identify unused Swagger endpoints**

Compare the "All GET Endpoints" list from the Swagger catalog against the endpoints actually used in the feature matrix. Any Swagger GET endpoint not used by any feature is a potential enhancement opportunity.

Add an "Unused Swagger Endpoints" section:

```markdown
## Unused Swagger Endpoints (Enhancement Opportunities)

| Swagger Path | Method | Tag | Summary | Potential Use |
|--------------|--------|-----|---------|---------------|
```

- [ ] **Step 8: Commit**

```bash
git add audit/aura-feature-endpoint-matrix.md
git commit -m "chore(audit): build feature-to-endpoint matrix with mock flags and unused endpoints"
```

---

### Task 6: Summary and handoff

**Files:**
- Create: `audit/README.md`

- [ ] **Step 1: Write the audit README**

Create `audit/README.md`:

```markdown
# AURA Application Audit

## Status

Plan 1 (Discovery & Mapping): COMPLETE
Plan 2 (API Audit — Monitor & Dashboard): PENDING
Plan 3 (API Audit — Configure & System): PENDING
Plan 4 (Cross-Cutting Quality): PENDING
Plan 5 (Final Reporting): PENDING

## Artifacts

| File | Purpose | Status |
|------|---------|--------|
| aura-route-inventory.md | All routes, pages, detail panels, dialogs | Complete |
| aura-swagger-endpoint-catalog.md | Full Swagger parsed into tables by tag | Complete |
| aura-component-inventory.md | Services, hooks, components, dead code | Complete |
| aura-feature-endpoint-matrix.md | Feature → API → Swagger mapping per page | Complete |
| aura-api-test-results.md | Per-endpoint test results | Plan 2-3 |
| aura-widget-enhancement-opportunities.md | Multi-endpoint improvement proposals | Plan 2-3 |
| aura-runtime-request-trace.md | Live request/response analysis | Plan 2-3 |
| aura-schema-drift-report.md | Swagger vs actual response mismatches | Plan 2-3 |
| aura-state-management-findings.md | State bugs, race conditions, leaks | Plan 4 |
| aura-security-findings.md | Auth, storage, CORS, credential issues | Plan 4 |
| aura-accessibility-findings.md | WCAG compliance issues | Plan 4 |
| aura-theme-audit.md | Theme consistency issues | Plan 4 |
| aura-removal-recommendations.md | Features to remove/simplify | Plan 5 |
| aura-final-audit-summary.md | Complete feature coverage report | Plan 5 |

## Key Numbers

- Routes: 27
- Detail Panels: 3
- Swagger Endpoints: 328 (243 paths, 37 tags)
- API Service Methods: 271
- Service Files: 36
- Hooks: 27
- Components: 244
```

- [ ] **Step 2: Commit and push**

```bash
git add audit/README.md
git commit -m "chore(audit): complete Plan 1 discovery with summary README"
git push
```

- [ ] **Step 3: Verify all artifacts are complete**

Check that all 4 artifacts have been populated:
```bash
wc -l audit/*.md
```

Expected: Each file should have substantial content (not just scaffolding).

Verify the feature matrix has entries for all 27 routes:
```bash
grep -c "^|" audit/aura-feature-endpoint-matrix.md
```

Expected: At minimum 27 rows in the matrix (one per page), likely 100+ (multiple features per page).
