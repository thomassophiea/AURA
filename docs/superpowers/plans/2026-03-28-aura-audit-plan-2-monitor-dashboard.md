# AURA Full Audit — Plan 2: API Audit — Monitor & Dashboard Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For each Monitor & Dashboard page, validate every API call against the live controller, fix broken endpoints, replace mock/hardcoded data with real API calls, enhance widgets with unused Swagger endpoints, and document all findings.

**Architecture:** Code changes + runtime validation. Each task produces both code fixes and test evidence in `/audit/`.

**Prerequisites:** Plan 1 artifacts complete:
- `audit/aura-feature-endpoint-matrix.md` — all features mapped
- `audit/aura-swagger-endpoint-catalog.md` — 328 endpoints cataloged
- `audit/aura-component-inventory.md` — all components inventoried

**Pages in scope (7 pages + 3 detail panels):**
1. Workspace
2. Dashboard Enhanced (Contextual Insights)
3. SLE Dashboard
4. App Insights
5. Connected Clients
6. Access Points
7. Report Widgets
8. AP Detail Panel
9. Client Detail Panel
10. Site Detail Panel

---

### Task 1: Validate Workspace API calls and fix issues

**Files:**
- Read: `src/components/Workspace.tsx`, `src/services/workspaceDataService.ts`
- Modify: `src/services/workspaceDataService.ts` (if fixes needed)
- Modify: `audit/aura-api-test-results.md`

The Workspace page uses `workspaceDataService` which orchestrates multiple API calls for widget data. All calls appear to use real Swagger endpoints.

- [ ] **Step 1: Trace all API calls in workspaceDataService.ts**

Read `src/services/workspaceDataService.ts` and document every `apiService` call it makes. For each:
- Method name
- Endpoint path
- Parameters passed
- Response fields consumed
- Error handling behavior

- [ ] **Step 2: Validate endpoint responses**

For each endpoint used by Workspace widgets, check:
1. Does the endpoint exist in Swagger? (cross-ref `audit/aura-swagger-endpoint-catalog.md`)
2. Does the response shape match what the code expects?
3. Are there error fallbacks that silently swallow failures?
4. Are there hardcoded/mock fallback values?

Look for patterns like:
```typescript
} catch (e) {
  return []; // Silent failure - hides broken endpoint
}
```

- [ ] **Step 3: Fix any broken or mock data paths**

If any widget falls back to hardcoded data:
- Replace with the correct Swagger endpoint
- Add proper error states (show error message, not empty data)
- Add loading states where missing

- [ ] **Step 4: Check for enhancement opportunities**

From the unused endpoints list, these could enhance Workspace:
- `/v1/state/entityDistribution` — entity health overview widget
- `/v1/bestpractices/evaluate` — best practices widget
- `/v1/reports/widgets` — dynamic widget catalog

Document opportunities but do NOT implement them (that's Plan 5 territory).

- [ ] **Step 5: Record findings in audit artifact**

Add entries to `audit/aura-api-test-results.md`:
```markdown
## Workspace

| Endpoint | Method | Status | Response Valid | Issues | Fix Applied |
|----------|--------|--------|---------------|--------|-------------|
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "audit(workspace): validate API calls, fix issues, document findings"
```

---

### Task 2: Validate Dashboard Enhanced (Contextual Insights) and fix issues

**Files:**
- Read/Modify: `src/components/DashboardEnhanced.tsx`
- Modify: `audit/aura-api-test-results.md`

DashboardEnhanced makes 8+ API calls. All appear real but need validation.

- [ ] **Step 1: Trace all API calls in DashboardEnhanced.tsx**

Read the component and find every `apiService` call. This page calls:
- `makeAuthenticatedRequest('/v1/stations')` — stations list
- `getServicesBySite()` / `makeAuthenticatedRequest('/v1/services')` — SSID list
- `makeAuthenticatedRequest('/v1/notifications')` — alerts
- `getAccessPointsBySite(siteId)` — AP list
- `fetchRFQualityData(siteId, '24H')` — RF quality
- `getAPInterfaceStatsWithRF()` — interface stats
- `fetchStationDetails(mac)` — client detail
- `fetchStationEvents(mac)` — client events
- `getSiteById(siteFilter)` — site name lookup

- [ ] **Step 2: Validate each endpoint**

For each endpoint:
1. Confirm it's in Swagger
2. Check response shape matches expectations
3. Check error handling (no silent empty returns)
4. Check loading states exist

- [ ] **Step 3: Check notifications endpoint behavior**

The matrix shows `/v1/notifications` as the endpoint but the code may try `/v1/alerts` first. Verify the fallback chain is correct and the UI handles empty notifications gracefully.

- [ ] **Step 4: Fix issues found**

Common patterns to fix:
- Silent `catch` blocks returning `[]` — add error toasts or error state
- Missing loading skeletons — add them
- Stale data on site switch — ensure refresh on site change

- [ ] **Step 5: Record findings**

Add to `audit/aura-api-test-results.md` under `## Dashboard Enhanced`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "audit(dashboard): validate DashboardEnhanced API calls, fix issues"
```

---

### Task 3: Validate SLE Dashboard and fix issues

**Files:**
- Read/Modify: `src/components/SLEDashboard.tsx`
- Modify: `audit/aura-api-test-results.md`

SLE Dashboard makes 3 API calls, all Real per the matrix.

- [ ] **Step 1: Trace API calls**

- `apiService.getSites()` → `/v3/sites`
- `makeAuthenticatedRequest('/v3/sites/{siteId}/stations')` → site-scoped stations
- `getAccessPointsBySite(siteFilter)` → `/v1/aps/query`

- [ ] **Step 2: Validate SLE data calculation**

SLE (Service Level Expectation) dashboards derive metrics from raw data. Check:
- Are the SLE calculations correct (connection time, coverage, capacity, throughput, roaming)?
- Are time range filters working?
- Does site switching properly refresh data?

Also check `src/services/sleDataCollection.ts` for the SLE metric derivation logic.

- [ ] **Step 3: Fix issues found**

- [ ] **Step 4: Record findings and commit**

```bash
git add -A
git commit -m "audit(sle): validate SLE Dashboard API calls and calculations"
```

---

### Task 4: Validate App Insights and fix issues

**Files:**
- Read/Modify: `src/components/AppInsights.tsx`
- Modify: `audit/aura-api-test-results.md`

App Insights uses 2 API calls, both Real.

- [ ] **Step 1: Trace API calls**

- `api.getSites()` → `/v3/sites` (site dropdown)
- `api.getAppInsights(duration, siteId)` → `/v1/report/sites` with `widgetList`

- [ ] **Step 2: Validate widget data**

Check that all app insight widgets render correctly:
- Top apps by usage
- Top apps by throughput
- Top apps by client count
- Worst apps variants

Verify the `widgetList` parameter is correctly constructed and the response is properly parsed.

- [ ] **Step 3: Check time range filtering**

Verify duration selector (24H, 7D, 30D) properly passes to the API and data refreshes.

- [ ] **Step 4: Fix issues and commit**

```bash
git add -A
git commit -m "audit(app-insights): validate App Insights API calls"
```

---

### Task 5: Validate Connected Clients and fix issues

**Files:**
- Read/Modify: `src/components/TrafficStatsConnectedClients.tsx`
- Modify: `audit/aura-api-test-results.md`

Connected Clients is the reference pattern page. All 6 features are Real per the matrix.

- [ ] **Step 1: Trace all API calls**

- `getAccessPointsBySite(siteFilter)` — AP list for site filter
- `makeAuthenticatedRequest('/v3/sites/{siteFilter}/stations')` + fallback `/v1/stations`
- `getServicesBySite(siteFilter)` / `makeAuthenticatedRequest('/v1/services')` — SSID filter
- `getSiteById(siteFilter)` — site name
- `fetchStationEvents(mac)` — event history
- `fetchStationDetails(mac)` — client detail

- [ ] **Step 2: Validate the v3→v1 fallback chain**

The station fetch uses `/v3/sites/{siteId}/stations` with fallback to `/v1/stations`. Verify:
1. v3 endpoint returns expected fields
2. Fallback triggers correctly on v3 failure
3. Field mapping is consistent between v3 and v1 responses

- [ ] **Step 3: Check client event correlation**

`fetchStationEvents` and `fetchStationDetails` are called on row click. Verify:
- Events load within reasonable time
- Event data displays correctly
- Empty event state is handled

- [ ] **Step 4: Validate search and filter behavior**

Test compound search across all search fields. Verify:
- Search tokens work with AND logic
- SSID filter works
- Site filter works
- Clearing search shows all results

- [ ] **Step 5: Fix issues and commit**

```bash
git add -A
git commit -m "audit(clients): validate Connected Clients API calls and interactions"
```

---

### Task 6: Validate Access Points and fix issues

**Files:**
- Read/Modify: `src/components/AccessPoints.tsx`
- Modify: `audit/aura-api-test-results.md`

Access Points makes 7 API calls, all Real. This is the heaviest data page.

- [ ] **Step 1: Trace all API calls**

- `getAPQueryColumns()` → `/v1/aps/query/columns`
- `getAccessPoints()` → `/v1/aps/query`
- `getAccessPointStations(serial)` → `/v1/aps/{serial}/stations`
- `getAllAPInterfaceStats()` → `/v1/aps/ifstats`
- `getAccessPointDetails(serial)` → `/v1/aps/{serial}`
- `getMeshAPRoles(aps)` → `/v3/meshpoints`
- `getAPStates()` → `/v1/state/aps`

- [ ] **Step 2: Validate mesh role correlation**

`getMeshAPRoles` correlates mesh data with AP list. Verify:
- Mesh roles display correctly for mesh APs
- Non-mesh APs show no mesh role
- AP table handles mixed mesh/non-mesh correctly

- [ ] **Step 3: Validate cable health feature**

Check if cable health uses a real API endpoint or derived data.

- [ ] **Step 4: Check for enhancement opportunities**

Unused endpoints that could enhance AP page:
- `/v1/aps/{serial}/cert` — certificate info
- `/v1/aps/{serial}/lldp` — LLDP/switch topology
- `/v1/aps/hardwaretypes` — hardware type filter
- `/v1/aps/platforms` — platform filter
- `/v1/aps/antenna/{serial}` — antenna info

Document in findings but don't implement.

- [ ] **Step 5: Fix issues and commit**

```bash
git add -A
git commit -m "audit(access-points): validate AP page API calls and mesh correlation"
```

---

### Task 7: Fix Report Widgets mock data issues

**Files:**
- Modify: `src/components/ReportWidgets.tsx`
- Modify: `audit/aura-api-test-results.md`

Report Widgets has **5 flagged issues** per the matrix:
- ⚠️ Security Events — `/v1/events?type=security` not in Swagger
- ⚠️ Active Alerts — `/v1/alerts` not in Swagger
- 🔶 Network Utilization — `clientCount / 10` hardcoded formula
- 🔶 Network Throughput — cumulative bytes ÷ 60s assumed interval
- 🔶 Performance Score — synthetic score, no API analog

- [ ] **Step 1: Read ReportWidgets.tsx and identify all widget data sources**

Read the full component. For each widget, document:
- What API call it makes
- What calculation it performs on the response
- Whether the metric has a real Swagger analog

- [ ] **Step 2: Fix Security Events widget**

Replace `/v1/events?type=security` with `/v1/notifications` filtered for security-related categories. If the notification response doesn't contain security events, use `/v1/auditlogs` filtered for security category.

- [ ] **Step 3: Fix Active Alerts widget**

Replace `/v1/alerts` with `/v1/notifications` (which IS in Swagger). Count notifications with severity >= warning as "active alerts".

- [ ] **Step 4: Fix Network Utilization widget**

The current formula `Math.min(clientCount / 10, 100)` is meaningless. Options:
- Use `/v1/report/sites/{siteId}` with `channelUtil` widget to get real channel utilization
- Or clearly label as "Client Load" instead of "Network Utilization"

Choose the most accurate option that works with available endpoints.

- [ ] **Step 5: Fix Network Throughput widget**

Current: `(inBytes + outBytes) / 60` assumes 1-minute window but fields are cumulative.
Fix: Use report endpoint to get actual throughput data, or if cumulative totals are the only source, calculate delta between two polls.

- [ ] **Step 6: Review Performance Score widget**

Current: `apConnectedPct * 0.5 + clientGoodSignalPct * 0.5` is synthetic.
If no real analog exists, label it clearly as "Derived Score" and document the formula. Consider using `/v1/bestpractices/evaluate` if available.

- [ ] **Step 7: Check for reportWidgets Swagger endpoint**

The unused endpoints list includes `/v1/reports/widgets` — "Get available widget definitions." Read this Swagger definition. If it provides a widget catalog, consider using it to dynamically build the report widgets page instead of hardcoding widgets.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix(report-widgets): replace mock endpoints with real Swagger analogs"
```

---

### Task 8: Validate Detail Panels (AP, Client, Site)

**Files:**
- Read/Modify: `src/components/AccessPointDetail.tsx`
- Read/Modify: `src/components/ClientDetail.tsx`
- Read/Modify: `src/components/SiteDetail.tsx`
- Modify: `audit/aura-api-test-results.md`

- [ ] **Step 1: Fix AP Detail event history endpoint**

The matrix flags: `/v1/aps/{serial}/alarms` is NOT in Swagger. The Swagger analogs are:
- `/v1/aps/{serial}/report` — AP report (exists in Swagger)
- `/v1/report/aps/{serial}` — AP reports (also in Swagger, unused)

Read both Swagger definitions and replace the non-Swagger `/alarms` call with the correct report endpoint. Map the response fields to what the AP alarm display expects.

- [ ] **Step 2: Validate Client Detail endpoints**

Both Client Detail endpoints are Real:
- `getStation(mac)` → `/v1/stations/{mac}`
- `fetchStationEventsWithCorrelation(mac, '24H')` → `/v1/stations/{stationId}/report`

Verify the event correlation works correctly and the response is properly parsed.

- [ ] **Step 3: Validate Site Detail endpoints**

Site Detail uses 5 API calls, all Real:
- `/v1/state/sites/{siteId}` — real-time state
- `getAccessPointsBySite(siteId)` — APs
- `getStations()` — clients (filtered)
- `fetchWidgetData(siteId, [...], timeRange)` — report widgets
- `getAppInsights(timeRange, siteId)` — app data

Verify all load correctly. Check that the widget data time range selector works.

- [ ] **Step 4: Check for detail panel enhancement opportunities**

Unused endpoints that could enhance detail panels:
- AP: `/v1/aps/{serial}/cert`, `/v1/aps/{serial}/lldp`, `/v1/aps/antenna/{serial}`, `/v1/report/aps/{serial}/smartrf`
- Client: `/v1/stations/{stationId}/location`
- Site: `/v1/report/sites/{siteId}/smartrf`, `/v3/sites/{siteId}/report/impact`

Document in findings.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(detail-panels): fix AP alarm endpoint, validate client/site detail panels"
```

---

### Task 9: Compile Plan 2 findings and update audit README

**Files:**
- Modify: `audit/aura-api-test-results.md`
- Modify: `audit/README.md`

- [ ] **Step 1: Compile all findings**

Ensure `audit/aura-api-test-results.md` has sections for all 10 pages/panels audited, with:
- Endpoint validation results
- Issues found
- Fixes applied
- Enhancement opportunities documented

- [ ] **Step 2: Update README**

Update `audit/README.md` to mark Plan 2 as complete:
```markdown
| Plan 2 | API Audit — Monitor & Dashboard Pages | ✅ COMPLETE |
```

Add key findings summary.

- [ ] **Step 3: Commit and push**

```bash
git add -A
git commit -m "audit(plan-2): compile Monitor & Dashboard findings, update README"
git push
```
