# AURA Removal Recommendations

Generated: 2026-03-28 | Plan 4 — Task 3

---

## Dead Code Removed

All 13 dead code candidates from Plan 1 verified unused and deleted.

| File | Reason | Verified Unused |
|------|--------|-----------------|
| `src/components/NetworkInsights.tsx` | Replaced by DashboardEnhanced | Yes — 0 imports outside own file |
| `src/components/NetworkInsightsEnhanced.tsx` | Replaced by DashboardEnhanced | Yes — 0 imports |
| `src/components/NetworkInsightsSimplified.tsx` | No known consumer | Yes — 0 imports |
| `src/components/LicenseDashboardEnhanced.tsx` | LicenseDashboard.tsx is the active route | Yes — 0 imports |
| `src/components/ContextualInsightsDashboard.tsx` | No route or parent imports it | Yes — 0 imports |
| `src/components/HighAvailabilityWidget.tsx` | No route or parent imports it | Yes — 0 imports |
| `src/components/SwitchesWidget.tsx` | No route or parent imports it | Yes — 0 imports |
| `src/components/APsUpgradeReport.tsx` | No route or parent imports it | Yes — 0 imports |
| `src/components/BackupRestoreManager.tsx` | SystemBackupManager.tsx is the active route | Yes — 0 imports |
| `src/components/ReportManagement.tsx` | No route or parent imports it | Yes — 0 imports |
| `src/components/SystemUtilities.tsx` | No route or parent imports it | Yes — 0 imports |
| `src/hooks/useTabVisibilityPolling.ts` | No consumer found in any component/service | Yes — 0 imports |
| `src/services/serviceMapping.ts` | Replaced by simpleServiceMapping.ts | Yes — 0 imports outside own file |

**Total: 13 files deleted**

---

## Console Statements Cleaned

| Location | Before | After | Action |
|----------|--------|-------|--------|
| `src/services/wlanReconciliation.ts` | 11 `console.log` | 0 | Removed — all were operational debug logs |
| `src/services/assignmentStorage.ts` | 4 `console.log` | 0 | Removed — CRUD operation logs |
| `src/services/aiBaselineService.ts` | 5 `console.log` | 0 | Removed — threshold calculation logs |
| `src/services/simplifiedWidgetService.ts` | 3 `console.log` | 0 | Removed — fetch trace logs |
| `src/services/metricsStorage.ts` | 5 `console.log` | 0 | Removed — storage operation logs |
| `src/services/workspacePersistence.ts` | 1 `console.log` | 0 | Removed — migration log |
| `src/services/chatbot.ts` | 1 `console.log` | 0 | Removed — initialization log |
| `src/components/AdministratorsManagement.tsx` | 10 `console.log` | 0 | Removed — heavy API response debug logging in hot path |
| `src/components/NetworkChatbot.tsx` | 1 `console.log` (render-level) | 0 | Removed — fires on every render |
| `src/components/AccessPointDetail.tsx` | 2 `console.log` (polling) | 0 | Removed — fired every 60s |
| `src/components/RFQualityWidgetAnchored.tsx` | 2 `console.log` in catch blocks | 0 `console.log`, 2 `console.error` | Converted to `console.error` — appropriate for error reporting |
| `src/components/NetworkInsightsEnhanced.tsx` | 1 `console.log` | 0 | Removed — auto-refresh trace (component deleted) |

**Debug logs removed: ~45 direct removals**
**Converted to console.error: 2**

### Remaining Console Statistics (post-cleanup)

| Type | Count | Notes |
|------|-------|-------|
| `console.log` in src/ | ~507 | Majority are in App.tsx (session management), main.tsx (SW lifecycle), and mobile/supabase sub-directories — acceptable operational logs |
| `console.error` in src/ | ~330 | Legitimate error reporting in catch blocks |
| `console.warn` in src/ | ~95 | Deprecation/warning notices |

**Note:** The remaining 507 `console.log` entries in components are a known pattern in this codebase. A complete cleanup would require routing all component logs through `logger.ts` (which is already no-op in production for services). This is a medium-priority refactor, not a critical fix. The most impactful production-visible logs have been removed in this task.

---

## Commented Code

No large blocks of commented-out code found. No `// TODO`, `// FIXME`, or `// HACK` comments exist in the codebase (searched all `.ts` and `.tsx` files).

---

## Impact

- **Bundle size reduction:** ~13 files removed from the component tree. While lazy-loaded routes don't affect initial bundle, removing unused files reduces build time and eliminates dead webpack/Vite analysis.
- **Developer experience:** 13 fewer files to navigate and maintain.
- **Console hygiene:** AdministratorsManagement was logging full API response objects on every load — this has been removed. NetworkChatbot was logging on every render — removed.
