# AURA Application Audit

## Status

| Plan | Scope | Status |
|------|-------|--------|
| Plan 1 | Discovery & Swagger Mapping | ✅ COMPLETE |
| Plan 2 | API Audit — Monitor & Dashboard Pages | ✅ COMPLETE |
| Plan 3 | API Audit — Configure & System Pages | ✅ COMPLETE |
| Plan 4 | Cross-Cutting Quality (Security, Accessibility, Theme, Performance) | PENDING |
| Plan 5 | Final Reporting | PENDING |

## Artifacts

| File | Purpose | Status |
|------|---------|--------|
| aura-route-inventory.md | All routes, pages, detail panels, dialogs | ✅ Complete |
| aura-swagger-endpoint-catalog.md | Full Swagger parsed into tables by tag (328 endpoints, 37 tags) | ✅ Complete |
| aura-component-inventory.md | Services, hooks, components, dead code candidates | ✅ Complete |
| aura-feature-endpoint-matrix.md | Feature → API → Swagger mapping per page (97 features) | ✅ Complete |
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

## Key Numbers (Plan 1)

- **Routes:** 28 (27 pages + 1 workspace)
- **Detail Panels:** 3 (AP, Client, Site)
- **Dialog Workflows:** ~58
- **Swagger Endpoints:** 328 (243 paths, 37 tags, v1.25.1)
- **API Service Methods:** ~271
- **Service Files:** 35
- **Hooks:** 24
- **Components:** 244 (55 UI + 41 feature + others)
- **Features Mapped:** 97
- **Dead Code Candidates:** 13
- **Mock Data Flags:** 20 (10 high severity)
- **Unused Swagger GET Endpoints:** ~131 enhancement opportunities

## Key Findings from Plan 3 (2026-03-28)

- **10 code fixes applied** across 8 components and api.ts
- **2 non-Swagger endpoints replaced** with Swagger analogs: `/v1/events` → `/v1/auditlogs` (EventAlarmDashboard + Tools)
- **1 endpoint version corrected**: `getClassOfService()` `/v3/cos` → `/v1/cos` (Swagger primary)
- **1 URL version corrected**: ConfigureAdoptionRules `/v1/sites` → `/v3/sites`
- **3 Platform Manager pages** (SystemBackupManager, LicenseDashboard, NetworkDiagnostics) given info banners explaining Platform Manager dependency
- **2 guest pages** (ConfigureGuest, GuestManagement) now surface API unavailability rather than misleading empty state
- **SecurityDashboard**: ADSP confirmed as incompatible replacement (profile configs ≠ detected rogue APs); improved to show availability banner
- **5 pages fully clean**: ConfigureSites, ConfigureAAAPolicies, ConfigureAdvanced, APFirmwareManager, PCIReport
- **6 enhancement opportunities** documented for Plan 5

## Key Findings from Plan 2 (2026-03-28)

- **8 code fixes applied** across ReportWidgets, workspaceDataService, and api.ts
- **5 non-Swagger endpoints replaced** with Swagger analogs (all via `/v1/notifications`)
- **3 misleading metrics** renamed and clarified (Network Utilization → Client Load Index; Network Throughput → Total Traffic Volume; Performance Score → Performance Score Derived)
- **5 pages cleaner than expected**: AppInsights, Connected Clients, Access Points, ClientDetail, SiteDetail — all Swagger-clean with proper error handling
- **AP Detail alarm endpoint** (`/v1/aps/{serial}/alarms`) confirmed non-Swagger; error handling improved to return `[]` gracefully rather than throwing
- **14 enhancement opportunities** documented for Plan 5

## Critical Findings from Plan 1

### High-Severity Mock Data / Non-Swagger Endpoints
Several pages call endpoints that don't exist in the Swagger spec:
1. **Events & Alarms** — `/v1/events`, `/v1/alarms`, `/v1/alarms/active` (not in Swagger; analog: `/v1/auditlogs`)
2. **Security Dashboard** — `/v1/security/rogue-ap/list`, `/v1/security/threats` (Swagger has `/v3/adsp` instead)
3. **System Backup** — all endpoints under `/platformmanager/v1/*` (outside Swagger scope)
4. **License Dashboard** — Platform Manager paths, outside Swagger
5. **Network Diagnostics** — all tools POST to `/platformmanager/v1/network/*`
6. **Guest Management** — uses `/v1/guests` but Swagger has `/v1/eguest`
7. **Report Widgets** — Active Alerts and Security Events use non-Swagger endpoints

### Biggest Unused Swagger Areas
- SwitchManager (9 GET endpoints) — no switch management UI
- ReportTemplateManager (14 GET endpoints) — no scheduled reports UI
- AdspManager (4 GET endpoints) — Air Defense unused while Security invents endpoints
- BestPracticeManager — `/v1/bestpractices/evaluate` could be a valuable widget
