# AURA Recent Events — Metrics, Defaults & APIs

> Source of truth: `src/components/dashboard/RecentEventsSummary.tsx`, `src/components/dashboard/AIInsightsBranch.tsx`, `src/hooks/useDashboardData.ts`
> Generated: 2026-05-28

The **Recent Events** card is the 24-hour roll-up shown on the AI Insights branch of the AURA dashboard. It is a derived, "all-clear vs incidents" summary — not a raw event list — and is the user's at-a-glance health check.

---

## 1. Metrics Displayed

The card renders up to three counts plus a fallback success row:

| Metric | Trigger | Visual | Source |
|---|---|---|---|
| **APs Offline**    | `offlineApCount > 0`  | Red row + destructive badge | AP roll-up from `/v1/aps/query` |
| **Critical Alerts**| `criticalCount > 0`   | Red row + destructive badge | Severity-classified notifications |
| **Warnings**       | `warningCount > 0`    | Amber row + warning badge   | Severity-classified notifications |
| **All Clear**      | All three counts are 0 | Green row + "No issues detected — all systems operational" | Computed locally |

Window label is hard-coded to **"Last 24h"** in the card header.

---

## 2. Severity Classification (notification → bucket)

Notifications are bucketed in `useDashboardData.processNotifications()` (useDashboardData.ts:1054):

| Bucket | Match (substring, case-insensitive, against `severity` then `level`) |
|---|---|
| **critical** | `critical` · `high` · `error` |
| **warning**  | `warning` · `warn` · `medium` |
| **info**     | everything else |

The recent-events card consumes `critical` and `warning` only; `info` rolls into total counts elsewhere on the dashboard.

---

## 3. AP Offline Count

`apStats.offline` is derived from `/v1/aps/query` by counting APs whose normalized status indicates a disconnected state. The same dataset feeds the AP Online/Offline donut and the AP Health SLE.

---

## 4. Defaults

| Setting | Default | Notes |
|---|---|---|
| Time window           | **24 h** (`Date.now() − 86_400_000`) | Hard-coded in `processNotifications()` |
| Notifications timeout | 10,000 ms | `apiService.makeAuthenticatedRequest()` call |
| AP query timeout      | inherits service default (~10 s) | Via `getAccessPointsBySite()` |
| Refresh trigger       | Dashboard reload / site change / time-range change | No independent polling |
| Empty / error result  | Empty arrays → "All Clear" success row | Errors are swallowed (returns `[]`) |
| Site scope            | Active site filter from `useGlobalFilters`; org scope falls through to all APs | `getActiveSiteFilter()` |

---

## 5. APIs Used

### Primary endpoint (notifications)

| Endpoint | Method | Purpose | Caller |
|---|---|---|---|
| `/v1/notifications` | GET | Source for critical / warning / info counts | Inline in `useDashboardData.fetchNotifications()` (useDashboardData.ts:417) |
| `/v1/alerts` | GET | Fallback if `/v1/notifications` returns non-2xx | Same caller; tried after `notifications` fails |

Response shape tolerance — accepts any of:

```ts
Array<Notification>                  // raw array
{ notifications: Notification[] }    // nested under .notifications
{ data: Notification[] }             // nested under .data
{ alerts: Notification[] }           // /v1/alerts shape
```

If a site filter is active, results are post-filtered client-side via `filterNotificationsBySite()` (which correlates notification → AP serial → site).

### Secondary endpoint (AP offline count)

| Endpoint | Method | Purpose | Caller |
|---|---|---|---|
| `/v1/aps/query` | GET | AP status roll-up; the offline counter feeds `offlineApCount` | `apiService.getAccessPointsBySite(siteId)` → `getAccessPoints()` (api.ts:1101) |

### Authentication

Bearer token from `localStorage`; auto-refresh on 401 via the central `apiService` refresh lock. Do not implement separate refresh logic in components.

---

## 6. Data Flow

```
useDashboardData.fetchNotifications()
        │
        ▼
GET /v1/notifications  (10s timeout)
        │  (on non-2xx)
        ▼
GET /v1/alerts         (fallback)
        │
        ▼
filterNotificationsBySite()    ←─ if useGlobalFilters.site is set
        │
        ▼
processNotifications()
   - filter last 24 h
   - bucket → critical / warning / info
        │
        ▼
setAlertCounts({ critical, warning, info })
        │
        ▼
AIInsightsBranch passes:
   apStats.offline   ─┐
   alertCounts.critical├─→ RecentEventsSummary  →  renders Last 24h card
   alertCounts.warning ┘
```

`apStats.offline` is computed in parallel from the AP list in the same dashboard load cycle.

---

## 7. File Reference

| Path | Purpose |
|---|---|
| `src/components/dashboard/RecentEventsSummary.tsx` | The card UI (offlineApCount, criticalCount, warningCount props) |
| `src/components/dashboard/AIInsightsBranch.tsx:273` | Wires `apStats.offline` + `alertCounts` into the card |
| `src/hooks/useDashboardData.ts:413` | `fetchNotifications()` — `/v1/notifications` + `/v1/alerts` fallback |
| `src/hooks/useDashboardData.ts:1054` | `processNotifications()` — 24h filter + severity bucketing |
| `src/hooks/useDashboardData.ts:257` | AP fetch via `getAccessPointsBySite()` |
| `src/services/api.ts:1101` | `/v1/aps/query` implementation |
