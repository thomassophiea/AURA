# AURA Application Audit

## Status

| Plan | Scope | Status |
|------|-------|--------|
| Plan 1 | Discovery & Swagger Mapping | ✅ COMPLETE |
| Plan 2 | API Audit — Monitor & Dashboard Pages | PENDING |
| Plan 3 | API Audit — Configure & System Pages | PENDING |
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
